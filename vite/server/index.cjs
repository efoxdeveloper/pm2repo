const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const dns = require('node:dns').promises;
const tls = require('node:tls');
const https = require('node:https');
const { execFile } = require('node:child_process');
const auth = require('./auth.cjs');
const nodemailer = require('nodemailer');

process.env.PM2_HOME = process.env.PM2_HOME || path.join(os.homedir(), '.pm2');
const pm2 = require('pm2');

const PORT = Number(process.env.PM2_MANAGER_PORT || 5010);
const HOST = process.env.PM2_MANAGER_HOST || '0.0.0.0';
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const FRONTEND_BASE_PATH = (process.env.PM2_MANAGER_BASE_PATH || '/free').replace(/\/+$/, '') || '/';
const APPLICATION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS managed_applications (
  name VARCHAR(160) PRIMARY KEY,
  display_name VARCHAR(160) NOT NULL,
  pm2_id INTEGER,
  namespace VARCHAR(80) NOT NULL DEFAULT 'default',
  status VARCHAR(30) NOT NULL DEFAULT 'unknown',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS managed_applications_active_idx ON managed_applications(is_active);
CREATE INDEX IF NOT EXISTS managed_applications_updated_at_idx ON managed_applications(updated_at DESC);
`;
const DOMAIN_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS monitored_domains (
  id BIGSERIAL PRIMARY KEY,
  domain VARCHAR(253) NOT NULL UNIQUE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'error',
  status_message TEXT NOT NULL DEFAULT '',
  dns JSONB NOT NULL DEFAULT '{}'::jsonb,
  ssl JSONB NOT NULL DEFAULT '{}'::jsonb,
  http JSONB NOT NULL DEFAULT '{}'::jsonb,
  registration JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_company TEXT,
  maintenance_responsibility TEXT,
  registrar TEXT,
  dns_managed_by TEXT,
  registration_date DATE,
  expiry_date DATE,
  auto_renewal BOOLEAN NOT NULL DEFAULT FALSE,
  primary_contact TEXT,
  webspace_gb NUMERIC(12, 2),
  notes TEXT,
  scan_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS registration JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS client_company TEXT;
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS maintenance_responsibility TEXT;
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS registrar TEXT;
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS dns_managed_by TEXT;
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS registration_date DATE;
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS primary_contact TEXT;
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS webspace_gb NUMERIC(12, 2);
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS scan_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE monitored_domains DROP COLUMN IF EXISTS management;
ALTER TABLE monitored_domains DROP COLUMN IF EXISTS hosting_provider;
ALTER TABLE monitored_domains DROP COLUMN IF EXISTS domain_owner;
ALTER TABLE monitored_domains DROP COLUMN IF EXISTS technical_responsibility;
ALTER TABLE monitored_domains DROP COLUMN IF EXISTS billing_responsibility;
ALTER TABLE monitored_domains DROP COLUMN IF EXISTS renewal_cost;
ALTER TABLE monitored_domains DROP COLUMN IF EXISTS renewal_status;
ALTER TABLE monitored_domains DROP COLUMN IF EXISTS internal_owner;
ALTER TABLE monitored_domains DROP COLUMN IF EXISTS domain_status;

UPDATE monitored_domains
SET registrar = NULLIF(BTRIM(regexp_replace(registration->>'registrar', '^.*(d/b/a|doing business as)\\s+', '', 'i')), '')
WHERE (registrar IS NULL OR BTRIM(registrar) = '')
  AND jsonb_typeof(registration) = 'object'
  AND NULLIF(BTRIM(registration->>'registrar'), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS monitored_domains_status_idx ON monitored_domains(status);
CREATE INDEX IF NOT EXISTS monitored_domains_scanned_at_idx ON monitored_domains(scanned_at DESC);
CREATE INDEX IF NOT EXISTS monitored_domains_client_company_idx ON monitored_domains(client_company);
CREATE INDEX IF NOT EXISTS monitored_domains_maintenance_idx ON monitored_domains(maintenance_responsibility);
CREATE INDEX IF NOT EXISTS monitored_domains_expiry_date_idx ON monitored_domains(expiry_date);
`;
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};
const allowedActions = new Set(['start', 'stop', 'restart', 'reload', 'delete']);
let connectionPromise;
let applicationStorageInitialized;
let domainStorageInitialized;
let domainScanInProgress = false;
let domainReportInProgress = false;
let rdapBootstrapCache = { expiresAt: 0, services: [] };
const requestLimits = new Map();

function recordAudit(entry) {
  return auth.recordActivity(entry).catch((error) => console.error('Audit write failed:', error.message));
}

function getRequestAddress(request) {
  const forwarded = process.env.PM2_MANAGER_TRUST_PROXY === 'true' ? request.headers['x-forwarded-for'] : null;
  return String(forwarded || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function isRateLimited(request, bucket, max, windowMs) {
  const key = `${bucket}:${getRequestAddress(request)}`;
  const now = Date.now();
  const entry = requestLimits.get(key) || { count: 0, resetAt: now + windowMs };
  if (entry.resetAt <= now) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count += 1;
  requestLimits.set(key, entry);
  if (requestLimits.size > 5000) for (const [storedKey, storedEntry] of requestLimits) if (storedEntry.resetAt <= now) requestLimits.delete(storedKey);
  return entry.count > max;
}

async function initializeDomainStorage() {
  if (!domainStorageInitialized) {
    domainStorageInitialized = auth.pool.query(DOMAIN_SCHEMA_SQL);
  }
  return domainStorageInitialized;
}

async function initializeApplicationStorage() {
  if (!applicationStorageInitialized) applicationStorageInitialized = auth.pool.query(APPLICATION_SCHEMA_SQL);
  return applicationStorageInitialized;
}

async function syncManagedApplications(applications) {
  await initializeApplicationStorage();
  const names = applications.map((application) => application.name);
  const client = await auth.pool.connect();
  try {
    await client.query('BEGIN');
    for (const application of applications) {
      await client.query(`
        INSERT INTO managed_applications (name, display_name, pm2_id, namespace, status, is_active, last_seen_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
        ON CONFLICT (name) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          pm2_id = EXCLUDED.pm2_id,
          namespace = EXCLUDED.namespace,
          status = EXCLUDED.status,
          is_active = TRUE,
          last_seen_at = NOW(),
          updated_at = NOW()
      `, [application.name, application.displayName || application.name, Number.isInteger(Number(application.id)) ? Number(application.id) : null, application.namespace || 'default', application.status || 'unknown']);
    }
    if (names.length) await client.query('UPDATE managed_applications SET is_active = FALSE, updated_at = NOW() WHERE NOT (name = ANY($1::text[]))', [names]);
    else await client.query('UPDATE managed_applications SET is_active = FALSE, updated_at = NOW()');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function listManagedApplications() {
  await initializeApplicationStorage();
  const result = await auth.pool.query('SELECT name, display_name AS "displayName", pm2_id AS "pm2Id", namespace, status, is_active AS "isActive", last_seen_at AS "lastSeenAt" FROM managed_applications ORDER BY display_name, name');
  return result.rows;
}

async function saveManagedApplication(application) {
  await initializeApplicationStorage();
  await auth.pool.query(`
    INSERT INTO managed_applications (name, display_name, pm2_id, namespace, status, is_active, last_seen_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
    ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name, pm2_id = EXCLUDED.pm2_id, namespace = EXCLUDED.namespace, status = EXCLUDED.status, is_active = TRUE, last_seen_at = NOW(), updated_at = NOW()
  `, [application.name, application.displayName || application.name, Number.isInteger(Number(application.id)) ? Number(application.id) : null, application.namespace || 'default', application.status || 'unknown']);
}

async function deactivateManagedApplication(name) {
  await initializeApplicationStorage();
  await auth.pool.query('UPDATE managed_applications SET is_active = FALSE, updated_at = NOW() WHERE name = $1', [String(name)]);
}

const MONITORED_DOMAIN_SELECT = `
  SELECT domain, added_at AS "addedAt", scanned_at AS "scannedAt", status,
    status_message AS "statusMessage", dns, ssl, http, registration,
    client_company AS "clientCompany",
    maintenance_responsibility AS "maintenanceResponsibility",
    registrar,
    dns_managed_by AS "dnsManagedBy",
    TO_CHAR(registration_date, 'YYYY-MM-DD') AS "registrationDate",
    TO_CHAR(expiry_date, 'YYYY-MM-DD') AS "expiryDate",
    auto_renewal AS "autoRenewal", primary_contact AS "primaryContact",
    webspace_gb AS webspace,
    notes,
    scan_enabled AS "scanEnabled"
  FROM monitored_domains
`;

function mapMonitoredDomain(row) {
  return {
    domain: row.domain,
    addedAt: row.addedAt,
    scannedAt: row.scannedAt,
    status: row.status,
    statusMessage: row.statusMessage,
    dns: row.dns || {},
    ssl: row.ssl || {},
    http: row.http || {},
    registration: row.registration || {},
    management: {
      clientCompany: row.clientCompany,
      maintenanceResponsibility: row.maintenanceResponsibility,
      registrar: row.registrar,
      dnsManagedBy: row.dnsManagedBy,
      registrationDate: row.registrationDate,
      expiryDate: row.expiryDate,
      autoRenewal: row.autoRenewal,
      primaryContact: row.primaryContact,
      webspace: row.webspace,
      notes: row.notes
    },
    scanEnabled: row.scanEnabled
  };
}

function buildDomainFilterQuery(filters = {}) {
  const clauses = [];
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const search = String(filters.search || '').trim();
  if (search) {
    const parameter = addParam(`%${search}%`);
    clauses.push(`(domain ILIKE ${parameter} OR client_company ILIKE ${parameter} OR registrar ILIKE ${parameter} OR primary_contact ILIKE ${parameter})`);
  }
  if (filters.clientCompany) clauses.push(`client_company ILIKE ${addParam(`%${String(filters.clientCompany).trim()}%`)}`);
  if (filters.maintenanceResponsibility) clauses.push(`maintenance_responsibility = ${addParam(String(filters.maintenanceResponsibility))}`);
  if (filters.registrar) clauses.push(`registrar ILIKE ${addParam(`%${String(filters.registrar).trim()}%`)}`);
  if (filters.autoRenewal === 'true' || filters.autoRenewal === 'false') clauses.push(`auto_renewal = ${addParam(filters.autoRenewal === 'true')}`);
  if (['healthy', 'warning', 'critical', 'error'].includes(filters.status)) clauses.push(`status = ${addParam(filters.status)}`);
  if (filters.expiry === 'expired') clauses.push('expiry_date < CURRENT_DATE');
  if (['7', '30', '90'].includes(String(filters.expiry || ''))) {
    const days = addParam(Number(filters.expiry));
    clauses.push(`expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (${days} * INTERVAL '1 day')`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function queryMonitoredDomains(filters = {}, pagination = null) {
  const { where, params } = buildDomainFilterQuery(filters);
  const summaryResult = await auth.pool.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'healthy')::int AS healthy,
      COUNT(*) FILTER (WHERE status IN ('warning', 'critical'))::int AS attention,
      COUNT(*) FILTER (WHERE status = 'error')::int AS errors
    FROM monitored_domains
    ${where}
  `, params);
  const summary = summaryResult.rows[0] || { total: 0, healthy: 0, attention: 0, errors: 0 };
  const queryParams = [...params];
  let query = `${MONITORED_DOMAIN_SELECT} ${where}
    ORDER BY
      CASE WHEN scan_enabled IS FALSE THEN 1 ELSE 0 END,
      CASE status
        WHEN 'critical' THEN 1
        WHEN 'warning' THEN 2
        WHEN 'error' THEN 3
        WHEN 'healthy' THEN 4
        ELSE 5
      END,
      domain`;
  let page = 1;
  let pageSize = Number(summary.total) || 1;
  let totalPages = 1;
  if (pagination) {
    const requestedPage = Math.max(1, Number(pagination.page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pagination.pageSize) || 25));
    totalPages = Math.max(1, Math.ceil((Number(summary.total) || 0) / pageSize));
    page = Math.min(requestedPage, totalPages);
    queryParams.push(pageSize, (page - 1) * pageSize);
    query += ` LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;
  }
  const result = await auth.pool.query(query, queryParams);
  const total = Number(summary.total) || 0;
  return {
    domains: result.rows.map(mapMonitoredDomain),
    total,
    page,
    pageSize,
    totalPages,
    summary: { total, healthy: Number(summary.healthy) || 0, attention: Number(summary.attention) || 0, errors: Number(summary.errors) || 0 }
  };
}

async function readMonitoredDomains() {
  return (await queryMonitoredDomains()).domains;
}

function normalizeDomainManagement(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const text = (key) => {
    const value = source[key];
    return value === undefined || value === null || String(value).trim() === '' ? null : String(value).trim();
  };
  const date = (key) => /^\d{4}-\d{2}-\d{2}$/.test(String(source[key] || '')) ? String(source[key]) : null;
  const rawWebspace = String(source.webspace || '').trim();
  const webspace = Number(rawWebspace);
  const registrar = shortenRegistrarName(text('registrar'));
  return {
    clientCompany: text('clientCompany'),
    maintenanceResponsibility: text('maintenanceResponsibility'),
    registrar,
    dnsManagedBy: text('dnsManagedBy'),
    registrationDate: date('registrationDate'),
    expiryDate: date('expiryDate'),
    autoRenewal: source.autoRenewal === true,
    primaryContact: text('primaryContact'),
    webspace: rawWebspace && Number.isFinite(webspace) && webspace >= 0 ? webspace : null,
    notes: text('notes')
  };
}

function shortenRegistrarName(value) {
  const name = value ? String(value).trim() : '';
  const brandMatch = name.match(/\b(?:d\/b\/a|doing business as)\s+(.+)$/i);
  return brandMatch?.[1]?.trim() || name || null;
}

function toDateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString().slice(0, 10);
}

function getRdapEntityName(entity) {
  const vcard = Array.isArray(entity?.vcardArray?.[1]) ? entity.vcardArray[1] : [];
  const field = vcard.find((item) => ['fn', 'org'].includes(String(item?.[0] || '').toLowerCase()));
  const value = field?.[3];
  return Array.isArray(value) ? value.filter(Boolean).join(' ') : value ? String(value) : null;
}

function applyOnlineRegistrationDates(value, registration = {}) {
  const management = normalizeDomainManagement(value);
  return {
    ...management,
    registrar: shortenRegistrarName(registration.registrar) || management.registrar || null,
    registrationDate: registration.registrationDate || value?.registrationDate || null,
    expiryDate: registration.expiresAt ? toDateOnly(registration.expiresAt) : value?.expiryDate || null
  };
}

async function saveDomainResults(results) {
  const client = await auth.pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of results) {
      const management = normalizeDomainManagement(item.management);
      await client.query(`
        INSERT INTO monitored_domains (domain, added_at, scanned_at, status, status_message, dns, ssl, http, registration,
          client_company, maintenance_responsibility, registrar, dns_managed_by,
          registration_date, expiry_date, auto_renewal, primary_contact, webspace_gb, notes, scan_enabled)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb,
          $10, $11, $12, $13, $14::date, $15::date, $16, $17, $18, $19, TRUE)
        ON CONFLICT (domain) DO UPDATE SET
          scanned_at = EXCLUDED.scanned_at,
          status = EXCLUDED.status,
          status_message = EXCLUDED.status_message,
          dns = EXCLUDED.dns,
          ssl = EXCLUDED.ssl,
          http = EXCLUDED.http,
          registration = EXCLUDED.registration,
          client_company = EXCLUDED.client_company,
          maintenance_responsibility = EXCLUDED.maintenance_responsibility,
          registrar = EXCLUDED.registrar,
          dns_managed_by = EXCLUDED.dns_managed_by,
          registration_date = EXCLUDED.registration_date,
          expiry_date = EXCLUDED.expiry_date,
          auto_renewal = EXCLUDED.auto_renewal,
          primary_contact = EXCLUDED.primary_contact,
          webspace_gb = EXCLUDED.webspace_gb,
          notes = EXCLUDED.notes
      `, [
        // Keep management fields relational in PostgreSQL; the nested object is only the API shape.
        item.domain,
        item.addedAt || item.scannedAt || new Date().toISOString(),
        item.scannedAt || new Date().toISOString(),
        item.status || 'error',
        item.statusMessage || '',
        JSON.stringify(item.dns || {}),
        JSON.stringify(item.ssl || {}),
        JSON.stringify(item.http || {}),
        JSON.stringify(item.registration || {}),
        management.clientCompany,
        management.maintenanceResponsibility,
        management.registrar,
        management.dnsManagedBy,
        management.registrationDate,
        management.expiryDate,
        management.autoRenewal,
        management.primaryContact,
        management.webspace,
        management.notes
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function normalizeDomain(value) {
  let candidate = String(value || '').trim();
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!hostname || hostname.length > 253 || hostname.includes('/') || hostname.includes('..')) return null;
    if (!hostname.includes('.') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) && hostname !== 'localhost') return null;
    return hostname;
  } catch {
    return null;
  }
}

function isPrivateAddress(value) {
  const address = String(value || '').toLowerCase();
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
  }
  if (net.isIPv6(address)) return address === '::' || address === '::1' || (address.startsWith('::ffff:') && isPrivateAddress(address.slice(7))) || address.startsWith('fc') || address.startsWith('fd') || /^fe[89ab]/.test(address);
  return false;
}

function assertSafePublicUrl(urlValue) {
  const target = new URL(urlValue);
  if (target.protocol !== 'https:') throw new Error('Only HTTPS RDAP endpoints are allowed');
  if (target.hostname === 'localhost' || target.hostname.endsWith('.local') || isPrivateAddress(target.hostname)) throw new Error('Private network targets are not allowed');
  return target;
}

async function resolveDnsOverHttps(hostname, type) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`, { headers: { accept: 'application/dns-json' }, signal: controller.signal });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.Answer || []).filter((answer) => answer.type === (type === 'A' ? 1 : 28)).map((answer) => answer.data);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function safeDns(method, hostname) {
  if (typeof dns[method] !== 'function') return Promise.resolve([]);
  return dns[method](hostname).catch(() => {
    if (method === 'resolve4') return resolveDnsOverHttps(hostname, 'A');
    if (method === 'resolve6') return resolveDnsOverHttps(hostname, 'AAAA');
    return [];
  });
}

async function getDnsDetails(hostname) {
  const [ipv4, ipv6, cname, mx, ns, txt, caa] = await Promise.all([
    safeDns('resolve4', hostname),
    safeDns('resolve6', hostname),
    safeDns('resolveCname', hostname),
    safeDns('resolveMx', hostname),
    safeDns('resolveNs', hostname),
    safeDns('resolveTxt', hostname),
    safeDns('resolveCaa', hostname)
  ]);

  return {
    ipv4,
    ipv6,
    cname,
    mx: mx.sort((left, right) => left.priority - right.priority),
    ns,
    txt: txt.map((entry) => Array.isArray(entry) ? entry.join('') : String(entry)),
    caa
  };
}

function getCertificate(hostname) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false, timeout: 8000 }, () => {
      const certificate = socket.getPeerCertificate(true);
      const validTo = certificate.valid_to ? new Date(certificate.valid_to) : null;
      const validFrom = certificate.valid_from ? new Date(certificate.valid_from) : null;
      const daysRemaining = validTo && !Number.isNaN(validTo.valueOf()) ? Math.ceil((validTo.getTime() - Date.now()) / 86400000) : null;
      finish({
        valid: Boolean(certificate && certificate.valid_to),
        authorized: socket.authorized,
        authorizationError: socket.authorizationError || null,
        subject: certificate.subject || {},
        issuer: certificate.issuer || {},
        validFrom: validFrom && !Number.isNaN(validFrom.valueOf()) ? validFrom.toISOString() : null,
        validTo: validTo && !Number.isNaN(validTo.valueOf()) ? validTo.toISOString() : null,
        daysRemaining,
        serialNumber: certificate.serialNumber || null,
        fingerprint256: certificate.fingerprint256 || null,
        subjectAltName: certificate.subjectaltname || null,
        protocol: socket.getProtocol() || null
      });
      socket.end();
    });

    socket.once('error', (error) => finish({ valid: false, error: error.message }));
    socket.once('timeout', () => {
      socket.destroy();
      finish({ valid: false, error: 'TLS connection timed out' });
    });
  });
}

function probeHttps(hostname) {
  return new Promise((resolve) => {
    const started = Date.now();
    const request = https.request({ hostname, port: 443, path: '/', method: 'HEAD', rejectUnauthorized: false, timeout: 8000, headers: { 'User-Agent': 'PM2 Domain Monitor/1.0' } }, (response) => {
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]));
      response.resume();
      resolve({ reachable: true, statusCode: response.statusCode, statusMessage: response.statusMessage, responseTime: Date.now() - started, headers });
    });
    request.once('error', (error) => resolve({ reachable: false, responseTime: Date.now() - started, error: error.message }));
    request.once('timeout', () => request.destroy(new Error('HTTPS request timed out')));
    request.end();
  });
}

function requestJson(urlValue, redirects = 0) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = assertSafePublicUrl(urlValue); } catch (error) { reject(error); return; }
    const request = https.request({
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: { Accept: 'application/rdap+json, application/json' },
      timeout: 8000
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 3) {
        response.resume();
        requestJson(new URL(response.headers.location, target).toString(), redirects + 1).then(resolve, reject);
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) response.destroy(new Error('RDAP response is too large'));
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`RDAP lookup returned HTTP ${response.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { reject(new Error('RDAP returned invalid JSON')); }
      });
      response.on('error', reject);
    });
    request.once('error', reject);
    request.once('timeout', () => request.destroy(new Error('RDAP lookup timed out')));
    request.end();
  });
}

async function getDomainRegistration(hostname) {
  if (hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || !hostname.includes('.')) {
    return { available: false, registrar: null, registrationDate: null, expiresAt: null, daysRemaining: null, error: 'Registration expiry is unavailable for this host' };
  }

  try {
    if (rdapBootstrapCache.expiresAt <= Date.now()) {
      const bootstrap = await requestJson('https://data.iana.org/rdap/dns.json');
      rdapBootstrapCache = { expiresAt: Date.now() + 6 * 60 * 60 * 1000, services: bootstrap.services || [] };
    }
    const tld = hostname.split('.').at(-1).toLowerCase();
    const service = rdapBootstrapCache.services.find(([tlds]) => tlds.includes(tld));
    const baseUrl = service?.[1]?.find((value) => String(value).startsWith('https://'));
    if (!baseUrl) return { available: false, registrar: null, registrationDate: null, expiresAt: null, daysRemaining: null, error: `No secure RDAP service is registered for .${tld}` };
    const endpoint = new URL(`domain/${encodeURIComponent(hostname)}`, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
    const rdap = await requestJson(endpoint);
    const registrarEntity = rdap.entities?.find((entity) => (entity.roles || []).map((role) => String(role).toLowerCase()).includes('registrar'));
    const registrar = shortenRegistrarName(getRdapEntityName(registrarEntity));
    const registrationEvent = rdap.events?.find((event) => String(event.eventAction || '').toLowerCase() === 'registration');
    const expirationEvent = rdap.events?.find((event) => String(event.eventAction || '').toLowerCase() === 'expiration');
    const registrationDate = registrationEvent?.eventDate ? toDateOnly(registrationEvent.eventDate) : null;
    const expiresAt = expirationEvent?.eventDate ? new Date(expirationEvent.eventDate) : null;
    if (!expiresAt || Number.isNaN(expiresAt.valueOf())) {
      return { available: false, registrar, registrationDate, expiresAt: null, daysRemaining: null, error: 'Registration expiry was not provided by RDAP' };
    }
    return { available: true, registrar, registrationDate, expiresAt: expiresAt.toISOString(), daysRemaining: Math.ceil((expiresAt.getTime() - Date.now()) / 86400000) };
  } catch (error) {
    return { available: false, registrar: null, registrationDate: null, expiresAt: null, daysRemaining: null, error: error.message };
  }
}

function settingNumber(settings, key, fallback, minimum = 1, maximum = 5000) {
  return Math.min(maximum, Math.max(minimum, Number(settings[key]) || fallback));
}

async function scanDomain(hostname, settings = {}) {
  const scannedAt = new Date().toISOString();
  const dnsDetails = await getDnsDetails(hostname);
  if (process.env.ALLOW_PRIVATE_DOMAIN_TARGETS !== 'true') {
    const addresses = [...dnsDetails.ipv4, ...dnsDetails.ipv6];
    if (hostname === 'localhost' || isPrivateAddress(hostname) || addresses.some(isPrivateAddress)) throw new Error('Private or internal domain targets are disabled');
  }
  const [ssl, httpDetails, registration] = await Promise.all([getCertificate(hostname), probeHttps(hostname), getDomainRegistration(hostname)]);
  const daysRemaining = ssl.daysRemaining;
  let status = 'healthy';
  let statusMessage = 'Certificate and HTTPS endpoint look healthy';

  if (!ssl.valid) {
    status = 'error';
    statusMessage = ssl.error || 'No SSL certificate could be read';
  } else if (daysRemaining !== null && daysRemaining <= settingNumber(settings, 'sslCriticalDays', 7)) {
    status = 'critical';
    statusMessage = daysRemaining < 0 ? 'SSL certificate has expired' : `SSL certificate expires within ${settingNumber(settings, 'sslCriticalDays', 7)} days`;
  } else if (daysRemaining !== null && daysRemaining <= settingNumber(settings, 'sslWarningDays', 30)) {
    status = 'warning';
    statusMessage = `SSL certificate expires within ${settingNumber(settings, 'sslWarningDays', 30)} days`;
  } else if (!httpDetails.reachable) {
    status = 'warning';
    statusMessage = 'Certificate found, but HTTPS did not respond';
  } else if (!dnsDetails.ipv4.length && !dnsDetails.ipv6.length) {
    status = 'warning';
    statusMessage = 'No A or AAAA record was returned';
  } else if (registration.daysRemaining !== null && registration.daysRemaining <= settingNumber(settings, 'domainCriticalDays', 7)) {
    status = 'critical';
    statusMessage = registration.daysRemaining < 0 ? 'Domain registration has expired' : `Domain registration expires within ${settingNumber(settings, 'domainCriticalDays', 7)} days`;
  } else if (registration.daysRemaining !== null && registration.daysRemaining <= settingNumber(settings, 'domainWarningDays', 30)) {
    status = 'warning';
    statusMessage = `Domain registration expires within ${settingNumber(settings, 'domainWarningDays', 30)} days`;
  }

  return { domain: hostname, scannedAt, status, statusMessage, dns: dnsDetails, ssl, http: httpDetails, registration };
}

async function scanAndStoreDomains(values, management = null) {
  const candidates = Array.isArray(values) ? values : String(values || '').split(/[\s,;]+/);
  const domains = [...new Set(candidates.map(normalizeDomain).filter(Boolean))];
  if (!domains.length) throw new Error('Enter at least one valid domain name');
  if (domains.length > 100) throw new Error('Scan up to 100 domains at a time');

  const savedDomains = new Map((await readMonitoredDomains()).map((item) => [item.domain, item]));
  const enabledDomains = domains.filter((domain) => !savedDomains.has(domain) || savedDomains.get(domain).scanEnabled !== false);
  if (!enabledDomains.length) return [];
  const settings = await auth.getSettings();
  const normalizedManagement = management === null ? null : normalizeDomainManagement(management);
  const results = await Promise.all(enabledDomains.map(async (domain) => {
    const savedManagement = savedDomains.get(domain)?.management;
    const managementForDomain = normalizedManagement ? {
      ...normalizedManagement,
      registrationDate: normalizedManagement.registrationDate || savedManagement?.registrationDate || null,
      expiryDate: normalizedManagement.expiryDate || savedManagement?.expiryDate || null
    } : savedManagement;
    try {
      const result = await scanDomain(domain, settings);
      return { ...result, management: applyOnlineRegistrationDates(managementForDomain, result.registration) };
    } catch (error) {
      return { domain, scannedAt: new Date().toISOString(), status: 'error', statusMessage: error.message, dns: { ipv4: [], ipv6: [], cname: [], mx: [], ns: [], txt: [], caa: [] }, ssl: { valid: false, error: error.message }, http: { reachable: false, error: error.message }, registration: { available: false, error: error.message }, management: applyOnlineRegistrationDates(managementForDomain) };
    }
  }));

  await saveDomainResults(results);
  return results;
}

async function scanSavedDomains(settings = null) {
  if (domainScanInProgress) return;
  domainScanInProgress = true;
  try {
    await initializeDomainStorage();
    const activeSettings = settings || await auth.getSettings();
    const saved = (await readMonitoredDomains()).filter((item) => item.scanEnabled !== false);
    if (!saved.length) return [];
    const results = await Promise.all(saved.map(async (item) => {
      try {
        const result = await scanDomain(item.domain, activeSettings);
        return { ...result, management: applyOnlineRegistrationDates(item.management, result.registration) };
      } catch (error) {
        return { ...item, scannedAt: new Date().toISOString(), status: 'error', statusMessage: error.message, management: applyOnlineRegistrationDates(item.management) };
      }
    }));
    await saveDomainResults(results);
    await recordAudit({ action: 'Scheduled domain scan', result: 'success', details: `Scanned ${results.length} monitored domain${results.length === 1 ? '' : 's'}` });
    return results;
  } catch (error) {
    console.error('Scheduled domain scan failed:', error);
    await recordAudit({ action: 'Scheduled domain scan', result: 'error', details: error.message });
  } finally {
    domainScanInProgress = false;
  }
}

function scheduleMatchesNow(settings, now = new Date()) {
  const time = String(settings.domainScheduleTime || '09:00');
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (currentTime !== time) return false;
  const frequency = settings.domainScheduleFrequency || 'daily';
  if (frequency === 'weekly') return (settings.domainScheduleWeekdays || []).map(Number).includes(now.getDay());
  if (frequency === 'monthly') return (settings.domainScheduleMonthDays || []).map(Number).includes(now.getDate());
  return frequency === 'daily';
}

function scheduledRunKey(now = new Date()) {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
}

function reportRecipients(settings) {
  return String(settings.domainReportRecipients || process.env.SMTP_REPORT_RECIPIENTS || process.env.SMTP_USER || '').split(/[;,\s]+/).map((item) => item.trim()).filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function reportLeadDays(settings) {
  return (Array.isArray(settings.domainReportLeadDays) ? settings.domainReportLeadDays : [30, 14, 7, 1]).map(Number).filter((value) => Number.isInteger(value) && value > 0);
}

function reportDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date.toLocaleString() : '—';
}

function reportReasons(item, settings) {
  const reasons = [];
  const sslDays = Number.isFinite(Number(item.ssl?.daysRemaining)) ? Number(item.ssl.daysRemaining) : null;
  const domainDays = Number.isFinite(Number(item.registration?.daysRemaining)) ? Number(item.registration.daysRemaining) : null;
  const leadThreshold = Math.max(...reportLeadDays(settings), 1);
  const sslThreshold = Math.max(settingNumber(settings, 'sslWarningDays', 30), leadThreshold);
  const domainThreshold = Math.max(settingNumber(settings, 'domainWarningDays', 30), leadThreshold);
  if (!item.ssl?.valid) reasons.push('SSL certificate check failed');
  else if (sslDays !== null && sslDays <= sslThreshold) reasons.push(`SSL expires in ${sslDays} day${sslDays === 1 ? '' : 's'}`);
  if (domainDays !== null && domainDays <= domainThreshold) reasons.push(`Domain expires in ${domainDays} day${domainDays === 1 ? '' : 's'}`);
  return reasons;
}

async function sendDomainReport(results, settings, { test = false } = {}) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error('SMTP is not configured');
  const recipients = reportRecipients(settings);
  if (!recipients.length) throw new Error('No domain report recipient is configured');
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: process.env.SMTP_SECURE !== 'false', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
  const rows = results.map((item) => {
    const ips = [...(item.dns?.ipv4 || []), ...(item.dns?.ipv6 || [])].join(', ') || '—';
    const reasons = test ? ['Full domain inventory'] : reportReasons(item, settings);
    const status = String(item.status || 'unknown').toLowerCase();
    const statusColor = status === 'critical' || status === 'error' ? '#b42318' : status === 'warning' ? '#b54708' : '#027a48';
    return `<tr><td><strong>${escapeHtml(item.domain)}</strong></td><td>${escapeHtml(reportDate(item.scannedAt))}</td><td>${escapeHtml(ips)}</td><td><span style="color:${statusColor};font-weight:700;text-transform:capitalize">${escapeHtml(status)}</span></td><td><strong>${escapeHtml(item.ssl?.daysRemaining ?? '—')}</strong> days</td><td><strong>${escapeHtml(item.registration?.daysRemaining ?? '—')}</strong> days</td><td>${escapeHtml(reasons.join('; ') || '—')}</td></tr>`;
  }).join('');
  const text = results.map((item) => `${item.domain} | ${item.status} | IP: ${[...(item.dns?.ipv4 || []), ...(item.dns?.ipv6 || [])].join(', ') || '—'} | SSL days: ${item.ssl?.daysRemaining ?? '—'} | Domain days: ${item.registration?.daysRemaining ?? '—'} | ${test ? 'Full domain inventory' : reportReasons(item, settings).join('; ')}`).join('\n');
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: recipients, subject: `Mantis Monitor ${test ? 'test report' : 'expiry alert'} - ${results.length} domain${results.length === 1 ? '' : 's'}`, text, html: `<div style="background:#f4f7fb;padding:20px 12px;font-family:Arial,sans-serif;color:#172b4d"><div style="max-width:1100px;margin:0 auto;background:#fff;border:1px solid #dbe3ef;border-radius:10px;padding:20px"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#eef3f8;text-align:left"><th style="padding:12px;border-bottom:2px solid #cbd5e1">Domain</th><th style="padding:12px;border-bottom:2px solid #cbd5e1">Last scan</th><th style="padding:12px;border-bottom:2px solid #cbd5e1">IP address</th><th style="padding:12px;border-bottom:2px solid #cbd5e1">Status</th><th style="padding:12px;border-bottom:2px solid #cbd5e1">SSL days</th><th style="padding:12px;border-bottom:2px solid #cbd5e1">Domain days</th><th style="padding:12px;border-bottom:2px solid #cbd5e1">Alert</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>` });
  } finally {
    transport.close();
  }
  return results.length;
}

async function sendTestEmail(settings) {
  await initializeDomainStorage();
  const domains = await readMonitoredDomains();
  if (!domains.length) throw new Error('No monitored domains are available for the test report');
  const count = await sendDomainReport(domains, settings, { test: true });
  return { count, recipients: reportRecipients(settings) };
}

async function domainSchedulerTick() {
  if (domainReportInProgress) return;
  domainReportInProgress = true;
  try {
    const settings = await auth.getSettings();
    const enabled = settings.domainScheduleEnabled === undefined ? process.env.DOMAIN_SCAN_ENABLED !== 'false' : settings.domainScheduleEnabled !== false;
    const now = new Date();
    const key = scheduledRunKey(now);
    if (!enabled || key === domainSchedulerTick.lastRunKey || !scheduleMatchesNow(settings, now)) return;
    domainSchedulerTick.lastRunKey = key;
    const results = await scanSavedDomains(settings);
    if (results?.length) {
      const expiring = results.filter((item) => reportReasons(item, settings).length > 0);
      if (expiring.length) {
        await sendDomainReport(expiring, settings);
        await recordAudit({ action: 'Email domain report', result: 'success', details: `Sent an expiry report for ${expiring.length} domain${expiring.length === 1 ? '' : 's'}` });
      } else {
        await recordAudit({ action: 'Email domain report', result: 'success', details: 'No domains are within the configured expiry alert thresholds' });
      }
    }
  } catch (error) {
    console.error('Scheduled domain report failed:', error);
    await recordAudit({ action: 'Email domain report', result: 'error', details: error.message });
  } finally {
    domainReportInProgress = false;
  }
}
domainSchedulerTick.lastRunKey = '';

function domainFiltersFromSearchParams(searchParams) {
  return {
    search: searchParams.get('search') || '',
    clientCompany: searchParams.get('clientCompany') || '',
    maintenanceResponsibility: searchParams.get('maintenanceResponsibility') || '',
    registrar: searchParams.get('registrar') || '',
    autoRenewal: searchParams.get('autoRenewal') || '',
    status: searchParams.get('status') || '',
    expiry: searchParams.get('expiry') || ''
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function monitoredDomainsCsv(domains) {
  const headers = ['Domain', 'Client / Company', 'Maintenance Responsibility', 'Registrar', 'DNS Managed By', 'Auto-Renewal', 'Primary Contact', 'Webspace (GB)', 'Registration Date', 'Expiry Date', 'SSL Days Remaining', 'Domain Days Remaining', 'IP Addresses', 'Health Status', 'Last Scanned', 'Notes'];
  const rows = domains.map((item) => [
    item.domain,
    item.management.clientCompany,
    item.management.maintenanceResponsibility,
    item.management.registrar,
    item.management.dnsManagedBy,
    item.management.autoRenewal ? 'Yes' : 'No',
    item.management.primaryContact,
    item.management.webspace,
    item.management.registrationDate,
    item.management.expiryDate,
    item.ssl?.daysRemaining,
    item.registration?.daysRemaining,
    [...(item.dns?.ipv4 || []), ...(item.dns?.ipv6 || [])].join(', '),
    item.status,
    item.scannedAt,
    item.management.notes
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

async function handleDomainApi(request, response, url) {
  await initializeDomainStorage();

  if (request.method === 'GET' && url.pathname === '/api/domains/export') {
    const { domains } = await queryMonitoredDomains(domainFiltersFromSearchParams(url.searchParams));
    response.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="domain-monitor-export.csv"',
      'Cache-Control': 'no-store'
    });
    response.end(`\uFEFF${monitoredDomainsCsv(domains)}`);
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/domains/options') {
    const result = await auth.pool.query(`
      SELECT ARRAY(
        SELECT client_company
        FROM (
          SELECT MIN(BTRIM(client_company)) AS client_company
          FROM monitored_domains
          WHERE client_company IS NOT NULL AND BTRIM(client_company) <> ''
          GROUP BY LOWER(BTRIM(client_company))
        ) AS client_values
        ORDER BY LOWER(client_company)
      ) AS "clientCompanies",
      ARRAY(
        SELECT registrar
        FROM (
          SELECT MIN(BTRIM(registrar)) AS registrar
          FROM monitored_domains
          WHERE registrar IS NOT NULL AND BTRIM(registrar) <> ''
          GROUP BY LOWER(BTRIM(registrar))
        ) AS registrar_values
        ORDER BY LOWER(registrar)
      ) AS registrars
    `);
    sendJson(response, 200, { options: result.rows[0] || { clientCompanies: [], registrars: [] } });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/domains') {
    const filters = domainFiltersFromSearchParams(url.searchParams);
    const page = await queryMonitoredDomains(filters, { page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') });
    sendJson(response, 200, { domains: page.domains, pagination: { page: page.page, pageSize: page.pageSize, total: page.total, totalPages: page.totalPages }, summary: page.summary });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/domains/scan') {
    if (isRateLimited(request, 'domain-scan', 10, 5 * 60 * 1000)) { sendJson(response, 429, { error: 'Too many scans. Try again later.' }); return true; }
    const payload = await readJsonBody(request);
    sendJson(response, 200, { domains: await scanAndStoreDomains(payload.domains || payload.domain || '', payload.management) });
    return true;
  }

  const encodedDomain = url.pathname.match(/^\/api\/domains\/([^/]+)$/)?.[1];
  if (encodedDomain && request.method === 'PATCH') {
    const domain = normalizeDomain(decodeURIComponent(encodedDomain));
    const payload = await readJsonBody(request);
    const hasScanUpdate = typeof payload.scanEnabled === 'boolean';
    const hasManagementUpdate = payload.management && typeof payload.management === 'object' && !Array.isArray(payload.management);
    if (!domain || (!hasScanUpdate && !hasManagementUpdate)) { sendJson(response, 400, { error: 'A valid domain and update payload are required' }); return true; }
    if (hasScanUpdate) await auth.pool.query('UPDATE monitored_domains SET scan_enabled = $1 WHERE domain = $2', [payload.scanEnabled, domain]);
    if (hasManagementUpdate) {
      const management = normalizeDomainManagement(payload.management);
      await auth.pool.query(`
        UPDATE monitored_domains
        SET client_company = $1,
            maintenance_responsibility = $2,
            registrar = $3,
            dns_managed_by = $4,
            auto_renewal = $5,
            primary_contact = $6,
            webspace_gb = $7,
            notes = $8
        WHERE domain = $9
      `, [management.clientCompany, management.maintenanceResponsibility, management.registrar, management.dnsManagedBy, management.autoRenewal, management.primaryContact, management.webspace, management.notes, domain]);
    }
    sendJson(response, 200, { domains: await readMonitoredDomains() });
    return true;
  }
  if (encodedDomain && request.method === 'DELETE') {
    const domain = normalizeDomain(decodeURIComponent(encodedDomain));
    if (!domain) { sendJson(response, 400, { error: 'Invalid domain name' }); return true; }
    await auth.pool.query('DELETE FROM monitored_domains WHERE domain = $1', [domain]);
    sendJson(response, 200, { domains: await readMonitoredDomains() });
    return true;
  }

  sendJson(response, 404, { error: 'Domain route not found' });
  return true;
}

function connectPm2() {
  if (!connectionPromise) {
    connectionPromise = new Promise((resolve, reject) => {
      pm2.connect((error) => {
        if (error) {
          connectionPromise = null;
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
  return connectionPromise;
}

function call(method, ...args) {
  return new Promise((resolve, reject) => {
    pm2[method](...args, (error, result) => (error ? reject(error) : resolve(result)));
  });
}

function callRemote(method, payload) {
  return new Promise((resolve, reject) => {
    pm2.Client.executeRemote(method, payload, (error, result) => (error ? reject(error) : resolve(result)));
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body is too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Request body must be valid JSON'));
      }
    });
    request.on('error', reject);
  });
}

function requiredPermission(pathname, method) {
  if (pathname.startsWith('/api/domains')) return method === 'GET' ? 'domains.view' : 'domains.manage';
  if (pathname === '/api/activity') return 'activity.view';
  if (pathname === '/api/settings') return method === 'GET' ? 'settings.view' : 'settings.manage';
  if (pathname.includes('/logs')) return 'logs.view';
  if (pathname === '/api/pm2/server' || pathname === '/api/pm2/health') return 'server.view';
  if (/^\/api\/pm2\/applications\/\d+\/ai$/.test(pathname)) return 'applications.view';
  if (pathname.startsWith('/api/pm2/applications')) return method === 'GET' ? 'applications.view' : 'applications.manage';
  return null;
}

async function handleAuthApi(request, response, url) {
  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    if (isRateLimited(request, 'login', 20, 15 * 60 * 1000)) { sendJson(response, 429, { error: 'Too many login attempts. Try again later.' }); return; }
    const payload = await readJsonBody(request);
    const result = await auth.login(payload.username, payload.password, request);
    sendJson(response, 200, { user: result.user }, { 'Set-Cookie': auth.getCookieHeader(result.session.token) });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = await auth.getAuthenticatedUser(request);
    if (!user) { sendJson(response, 401, { error: 'Authentication required' }); return; }
    sendJson(response, 200, { user });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    await auth.destroySession(request);
    sendJson(response, 200, { ok: true }, { 'Set-Cookie': auth.getCookieHeader('', 0) });
    return;
  }

  const currentUser = await auth.getAuthenticatedUser(request);
  if (!currentUser) { sendJson(response, 401, { error: 'Authentication required' }); return; }

  const canManageUsers = auth.hasPermission(currentUser, 'users.manage');
  const canManageRoles = auth.hasPermission(currentUser, 'roles.manage');
  if (request.method === 'GET' && url.pathname === '/api/auth/available-applications' && canManageUsers) {
    await initializeApplicationStorage();
    try {
      await connectPm2();
      await getApplications();
    } catch (error) {
      const registered = await listManagedApplications();
      if (!registered.length) throw error;
    }
    const applications = await listManagedApplications();
    sendJson(response, 200, { applications: applications.map((application) => ({ id: application.pm2Id, name: application.name, displayName: application.displayName, isActive: application.isActive, lastSeenAt: application.lastSeenAt })) });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/auth/application-assignments' && canManageUsers) {
    sendJson(response, 200, { assignments: await auth.listApplicationAssignments() });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/auth/users' && canManageUsers) { sendJson(response, 200, { users: await auth.listUsers() }); return; }
  if (request.method === 'GET' && url.pathname === '/api/auth/roles' && (canManageUsers || canManageRoles)) { sendJson(response, 200, { roles: await auth.listRoles() }); return; }
  if (request.method === 'GET' && url.pathname === '/api/auth/permissions' && canManageRoles) { sendJson(response, 200, { permissions: await auth.listPermissions() }); return; }
  if (request.method === 'POST' && url.pathname === '/api/auth/users' && canManageUsers) {
    const payload = await readJsonBody(request);
    const user = await auth.createManagedUser(payload);
    await recordAudit({ userId: currentUser.id, action: 'Create user', result: 'success', details: `Created user ${user.username}` });
    sendJson(response, 201, { user });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/roles' && canManageRoles) {
    const payload = await readJsonBody(request);
    const role = await auth.createRole(payload);
    await recordAudit({ userId: currentUser.id, action: 'Create role', result: 'success', details: `Created role ${role.name}` });
    sendJson(response, 201, { role });
    return;
  }
  const userMatch = url.pathname.match(/^\/api\/auth\/users\/(\d+)(?:\/reset-password)?$/);
  const userApplicationsMatch = url.pathname.match(/^\/api\/auth\/users\/(\d+)\/applications$/);
  if (request.method === 'PUT' && userApplicationsMatch && canManageUsers) {
    const payload = await readJsonBody(request);
    const applications = await auth.replaceUserApplications(Number(userApplicationsMatch[1]), payload.applicationNames, currentUser.id);
    await recordAudit({ userId: currentUser.id, action: 'Assign applications', result: 'success', details: `Updated application access for user ${userApplicationsMatch[1]}` });
    sendJson(response, 200, { applications });
    return;
  }
  if (request.method === 'PATCH' && userMatch && canManageUsers) {
    const payload = await readJsonBody(request);
    if (Number(userMatch[1]) === Number(currentUser.id) && payload.isActive === false) throw new Error('You cannot deactivate your own account');
    if (Number(userMatch[1]) === Number(currentUser.id) && payload.roleId !== undefined) throw new Error('You cannot change your own role');
    const users = await auth.updateUserAccess(Number(userMatch[1]), payload);
    await recordAudit({ userId: currentUser.id, action: 'Update user access', result: 'success', details: `Updated access for user ${userMatch[1]}` });
    sendJson(response, 200, { users });
    return;
  }

  if (request.method === 'POST' && userMatch && canManageUsers && url.pathname.endsWith('/reset-password')) {
    if (Number(userMatch[1]) === Number(currentUser.id)) throw new Error('Use Change password to update your own password');
    const payload = await readJsonBody(request);
    await auth.resetUserPassword(Number(userMatch[1]), payload.password);
    await recordAudit({ userId: currentUser.id, action: 'Reset password', result: 'success', details: `Password reset for user ${userMatch[1]}` });
    sendJson(response, 200, { ok: true });
    return;
  }

  const roleMatch = url.pathname.match(/^\/api\/auth\/roles\/(\d+)$/);
  if (request.method === 'PATCH' && roleMatch && canManageRoles) {
    const payload = await readJsonBody(request);
    const role = await auth.updateRole(Number(roleMatch[1]), payload);
    await recordAudit({ userId: currentUser.id, action: 'Update role', result: 'success', details: `Updated role ${role.name}` });
    sendJson(response, 200, { role });
    return;
  }
  if (request.method === 'DELETE' && roleMatch && canManageRoles) {
    const roles = await auth.deleteRole(Number(roleMatch[1]));
    await recordAudit({ userId: currentUser.id, action: 'Delete role', result: 'success', details: `Deleted role ${roleMatch[1]}` });
    sendJson(response, 200, { roles });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/change-password') {
    const payload = await readJsonBody(request);
    await auth.changePassword(currentUser.id, payload.currentPassword, payload.newPassword);
    sendJson(response, 200, { ok: true }, { 'Set-Cookie': auth.getCookieHeader('', 0) });
    return;
  }

  sendJson(response, 404, { error: 'Authentication route not found' });
}

function parseArguments(value) {
  if (Array.isArray(value)) return value.map(String);
  const matches = String(value || '').match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map((argument) => argument.replace(/^['"]|['"]$/g, ''));
}

function redactProjectValue(value) {
  return String(value || '').replace(/((?:password|passwd|secret|token|api[_-]?key|private[_-]?key)\s*[=:]\s*)([^\s,;]+)/gi, '$1[redacted]').slice(0, 500);
}

function getProjectSnapshot(cwd) {
  const packagePath = path.join(cwd, 'package.json');
  let packageJson = null;
  if (fs.existsSync(packagePath)) {
    try { packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')); } catch { throw new Error('package.json is not valid JSON'); }
  }
  const ignored = new Set(['.git', '.next', '.nuxt', '.cache', 'node_modules', 'dist', 'build', 'coverage']);
  const entries = fs.readdirSync(cwd, { withFileTypes: true }).filter((entry) => !ignored.has(entry.name) && !entry.name.startsWith('.env')).slice(0, 120).map((entry) => `${entry.isDirectory() ? 'dir' : 'file'}:${entry.name}`);
  const files = new Set(entries.filter((entry) => entry.startsWith('file:')).map((entry) => entry.slice(5)));
  const dependencies = { ...(packageJson?.dependencies || {}), ...(packageJson?.devDependencies || {}) };
  const framework = dependencies.next ? 'Next.js' : dependencies.react ? 'React' : dependencies.vue ? 'Vue' : dependencies.angular ? 'Angular' : dependencies.express ? 'Express' : dependencies.fastify ? 'Fastify' : dependencies.nestjs ? 'NestJS' : files.has('requirements.txt') || files.has('pyproject.toml') ? 'Python' : files.has('go.mod') ? 'Go' : 'Unknown';
  const packageManager = fs.existsSync(path.join(cwd, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(cwd, 'yarn.lock')) ? 'yarn' : fs.existsSync(path.join(cwd, 'package-lock.json')) ? 'npm' : packageJson ? 'npm' : null;
  return {
    directory: cwd,
    package: packageJson ? { name: packageJson.name || null, version: packageJson.version || null, scripts: Object.fromEntries(Object.entries(packageJson.scripts || {}).map(([key, value]) => [key, redactProjectValue(value)])), dependencyNames: Object.keys(dependencies).sort().slice(0, 200) } : null,
    framework,
    packageManager,
    entries,
    candidateFiles: ['server.js', 'app.js', 'index.js', 'main.js', 'app.py', 'main.py'].filter((file) => files.has(file))
  };
}

function localProjectAnalysis(snapshot) {
  const scripts = snapshot.package?.scripts || {};
  const startScript = scripts.start ? 'package.json: start' : null;
  const candidate = snapshot.candidateFiles[0] || '';
  const ready = Boolean(startScript || candidate);
  return {
    ready,
    summary: ready ? 'The project has a usable start entry point.' : 'No safe start entry point was found automatically.',
    project: { name: snapshot.package?.name || path.basename(snapshot.directory), framework: snapshot.framework, packageManager: snapshot.packageManager },
    recommended: startScript ? { command: `${snapshot.packageManager || 'npm'} run start`, script: '', args: [], interpreter: '' } : candidate ? { command: `node ${candidate}`, script: candidate, args: [], interpreter: candidate.endsWith('.py') ? 'python' : 'node' } : { command: '', script: '', args: [], interpreter: '' },
    requiredChanges: ready ? [] : [{ file: 'package.json', reason: 'Add a start script, for example: "start": "node server.js".', suggestion: 'Add scripts.start or provide a start file in Advanced settings.' }],
    structure: snapshot.entries
  };
}

async function requestGroqProjectAnalysis(snapshot, local) {
  if (!process.env.GROQ_API_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b', temperature: 0, max_tokens: 900, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'You analyze project metadata for a PM2 manager. Return JSON only with keys ready (boolean), summary (string), recommended (object with command, script, args array, interpreter), requiredChanges (array of objects with file, reason, suggestion), and project (object with framework and packageManager). Never ask for or infer secrets. Do not recommend destructive commands. A project is ready only when a safe start command can be identified.' }, { role: 'user', content: JSON.stringify({ metadata: snapshot, localAnalysis: local }) }] })
    });
    if (!response.ok) throw new Error(`Groq analysis returned HTTP ${response.status}`);
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq returned an empty analysis');
    const result = JSON.parse(content);
    return {
      ready: result.ready === true,
      summary: String(result.summary || local.summary).slice(0, 500),
      project: { ...local.project, ...(result.project || {}) },
      recommended: { ...local.recommended, ...(result.recommended || {}), args: Array.isArray(result.recommended?.args) ? result.recommended.args.map(String).slice(0, 30) : local.recommended.args },
      requiredChanges: Array.isArray(result.requiredChanges) ? result.requiredChanges.map((item) => ({ file: String(item.file || 'project'), reason: String(item.reason || '').slice(0, 300), suggestion: String(item.suggestion || '').slice(0, 300) })).filter((item) => item.reason).slice(0, 10) : []
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzeProject(cwdValue) {
  const cwd = path.resolve(String(cwdValue || '').trim());
  if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Project working directory does not exist');
  const snapshot = getProjectSnapshot(cwd);
  const local = localProjectAnalysis(snapshot);
  let ai = null;
  try { ai = await requestGroqProjectAnalysis(snapshot, local); } catch (error) { console.warn(`Groq project analysis unavailable: ${error.message}`); }
  const analysis = ai || local;
  return { ...analysis, ready: Boolean(local.ready && analysis.ready && !(analysis.requiredChanges || []).length), source: ai ? 'groq' : 'local', structure: snapshot.entries, scripts: snapshot.package?.scripts || {}, recommended: { ...local.recommended, ...(analysis.recommended || {}) } };
}

function getApplicationOptions(payload) {
  const name = String(payload.name || '').trim();
  const cwd = path.resolve(String(payload.cwd || '').trim());
  let script = String(payload.script || '').trim();
  let detectedArgs = [];
  let packageJson;
  if (!name || !payload.cwd) throw new Error('Application name and working directory are required');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(name)) throw new Error('Application name may contain only letters, numbers, dots, underscores, and hyphens');
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Application working directory does not exist');

  const packagePath = path.join(cwd, 'package.json');
  if (script.toLowerCase() === 'start' && fs.existsSync(packagePath)) {
    try {
      const packageCandidate = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (packageCandidate.scripts?.start) script = '';
    } catch {
      // The normal package.json validation below returns the useful error.
    }
  }
  if (!script) {
    if (!fs.existsSync(packagePath)) throw new Error('Enter a script or choose a directory containing package.json');
    try {
      packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    } catch {
      throw new Error(`Unable to read ${packagePath}`);
    }
    if (!packageJson.scripts?.start) throw new Error('No start script found in package.json');
    const nextCli = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
    const hasNext = packageJson.dependencies?.next || packageJson.devDependencies?.next || packageJson.peerDependencies?.next;
    if (hasNext && fs.existsSync(nextCli)) {
      script = nextCli;
      const startCommand = parseArguments(packageJson.scripts.start);
      detectedArgs = startCommand[0] && /(^|[\\/])next(?:\.cmd)?$/i.test(startCommand[0]) ? startCommand.slice(1) : ['start'];
    } else if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
      script = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
      detectedArgs = ['start'];
    } else if (fs.existsSync(path.join(cwd, 'yarn.lock'))) {
      script = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
      detectedArgs = ['start'];
    } else {
      script = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      detectedArgs = ['run', 'start'];
    }
  }

  const scriptPath = path.resolve(cwd, script);
  const isCommand = ['npm', 'npm.cmd', 'yarn', 'yarn.cmd', 'pnpm', 'pnpm.cmd'].includes(script.toLowerCase());
  if (!isCommand && (!fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile())) {
    throw new Error(`Application script does not exist: ${script}`);
  }

  if (!payload.args && !detectedArgs.length && path.basename(script).toLowerCase() === 'next') detectedArgs = ['start'];
  const commandArguments = parseArguments(payload.args || detectedArgs);
  const commandRunner = path.join(__dirname, 'pm2-command-runner.cjs');
  const pm2Script = isCommand ? commandRunner : scriptPath;
  const pm2Arguments = isCommand ? [script, ...commandArguments] : commandArguments;
  const defaultInterpreter = /\.(py|pyw)$/i.test(script) ? 'python' : 'node';
  const maxRestarts = Math.min(5, Math.max(1, Number(payload.maxRestarts) || 5));

  const options = {
    name,
    script: pm2Script,
    cwd,
    interpreter: isCommand ? process.execPath : payload.interpreter && payload.interpreter !== 'none' ? payload.interpreter : defaultInterpreter,
    exec_mode: payload.mode === 'cluster' ? 'cluster' : 'fork',
    instances: Math.max(1, Number(payload.instances) || 1),
    namespace: String(payload.namespace || 'default').trim().slice(0, 80) || 'default',
    autorestart: payload.autorestart !== false,
    watch: payload.watch === true,
    windowsHide: true,
    min_uptime: 1000,
    max_restarts: maxRestarts
  };
  if (pm2Arguments.length) options.args = pm2Arguments;
  if (payload.nodeArgs) options.node_args = parseArguments(payload.nodeArgs);
  if (payload.maxMemoryRestart) options.max_memory_restart = String(payload.maxMemoryRestart);
  if (payload.restartDelay) options.restart_delay = Math.max(0, Number(payload.restartDelay) || 0);
  if (payload.env && typeof payload.env === 'object' && !Array.isArray(payload.env)) options.env = { ...payload.env };
  return options;
}

async function createApplication(payload) {
  const options = getApplicationOptions(payload);
  const existing = await getApplicationByName(options.name, 0).catch(() => null);
  if (existing) throw new Error(`Application ${options.name} is already managed by PM2`);

  try {
    await call('start', options);
    const port = payload.port || options.env?.PORT;
    const application = await waitForApplicationReady(options.name, port);
    const startupDiagnosis = await diagnoseApplicationStartup(application).catch(() => null);
    return startupDiagnosis ? { ...application, startupDiagnosis } : application;
  } catch (error) {
    throw await cleanupFailedApplication(options.name, error);
  }
}

function runCommand(command, args, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    const windowsScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
    const executable = windowsScript ? (process.env.ComSpec || process.env.COMSPEC || 'cmd.exe') : command;
    const commandArgs = windowsScript ? ['/d', '/s', '/c', command, ...args] : args;
    execFile(executable, commandArgs, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 15 * 60 * 1000, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function runGitPull(cwd) {
  return runCommand('git', ['-C', cwd, 'pull', 'origin', '--ff-only'], cwd, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).then(({ stdout, stderr }) => [stdout, stderr].filter(Boolean).join('\n') || 'Already up to date.');
}

async function getGitRoot(cwd) {
  if (!cwd || !fs.existsSync(cwd)) throw new Error('Application working directory does not exist');
  try {
    const result = await runCommand('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], cwd, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return result.stdout.trim();
  } catch {
    throw new Error(`${cwd} is not inside a Git working directory`);
  }
}

function getBuildCommand(cwd) {
  const packagePath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packagePath)) throw new Error(`${cwd} does not contain a package.json file`);

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    throw new Error(`Unable to read ${packagePath}`);
  }
  if (!packageJson.scripts?.build) throw new Error(`${packageJson.name || 'Application'} does not define a build script`);

  const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return { command: corepack, args: ['pnpm', 'run', 'build'], label: 'pnpm run build' };
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return { command: corepack, args: ['yarn', 'build'], label: 'yarn build' };
  return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', 'build'], label: 'npm run build' };
}

async function runBuild(cwd) {
  const build = getBuildCommand(cwd);
  const result = await runCommand(build.command, build.args, cwd, { env: { ...process.env, CI: 'false' } });
  return { ...build, output: [result.stdout, result.stderr].filter(Boolean).join('\n') || 'Build completed successfully.' };
}

async function installApplicationDependencies(cwd) {
  if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Application working directory does not exist');
  const packagePath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packagePath)) throw new Error(`${cwd} does not contain a package.json file`);
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = await runCommand(command, ['i'], cwd, { env: { ...process.env, npm_config_yes: 'true' } });
  return { command: 'npm i', output: [result.stdout, result.stderr].filter(Boolean).join('\n') || 'Dependencies installed successfully.' };
}

function normalizeStatus(status) {
  if (status === 'online' || status === 'stopped' || status === 'errored' || status === 'launching') return status;
  if (status === 'waiting for restart') return 'launching';
  return status || 'stopped';
}

function toApplication(processInfo) {
  const env = processInfo.pm2_env || {};
  const script = env.pm_exec_path || env.script || '';
  const cwd = env.cwd || (script ? path.dirname(script) : '');
  return {
    id: env.pm_id ?? processInfo.pm_id,
    name: env.name || processInfo.name,
    displayName: env.name || processInfo.name,
    namespace: env.namespace || 'default',
    status: normalizeStatus(env.status),
    pid: processInfo.pid > 0 ? processInfo.pid : null,
    mode: env.exec_mode === 'cluster_mode' ? 'cluster' : 'fork',
    instances: Number(env.instances) || 1,
    cpu: Number(processInfo.monit?.cpu) || 0,
    memory: Number(processInfo.monit?.memory) || 0,
    uptime: env.pm_uptime ? Math.max(0, Math.floor((Date.now() - env.pm_uptime) / 1000)) : 0,
    restarts: Number(env.restart_time) || 0,
    nodeVersion: env.node_version || process.version.replace(/^v/, ''),
    script: script ? path.basename(script) : '',
    scriptPath: script,
    cwd,
    environment: { NODE_ENV: env.env?.NODE_ENV || null, PORT: env.env?.PORT || null },
    environmentKeys: Object.keys(env.env || {}).filter((key) => !/^pm_/i.test(key)).sort(),
    autorestart: env.autorestart !== false,
    watch: env.watch === true,
    maxMemoryRestart: env.max_memory_restart || null,
    restartDelay: env.restart_delay || 0,
    maxRestarts: env.max_restarts ?? 5,
    created: env.created_at || null,
    errorLog: env.pm_err_log_path || '',
    outputLog: env.pm_out_log_path || ''
  };
}

function getApplications() {
  return call('list').then(async (list) => {
    const applications = list.map(toApplication);
    await syncManagedApplications(applications);
    return applications;
  });
}

async function getApplicationsForUser(user) {
  const applications = await getApplications();
  if (auth.hasPermission(user, '*')) return applications;
  const assigned = new Set(await auth.listUserApplications(user.id));
  return applications.filter((application) => assigned.has(application.name));
}

async function ensureApplicationAccess(user, application) {
  if (auth.hasPermission(user, '*') || await auth.hasApplicationAccess(user.id, application.name)) return;
  const error = new Error('You do not have access to this application');
  error.statusCode = 403;
  throw error;
}

function getApplication(id) {
  return call('describe', id).then((list) => {
    const processInfo = Array.isArray(list) ? list[0] : list;
    if (!processInfo) throw new Error(`Application ${id} was not found`);
    return toApplication(processInfo);
  });
}

async function getApplicationByName(name, attempts = 5) {
  const list = await call('list');
  const processInfo = list.find((item) => item.name === name || item.pm2_env?.name === name);
  if (processInfo) return toApplication(processInfo);
  if (attempts > 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return getApplicationByName(name, attempts - 1);
  }
  throw new Error(`Application ${name} was not found after starting`);
}

function probeHttp(port) {
  return new Promise((resolve) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 1000 }, (response) => {
      response.resume();
      resolve(true);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => request.destroy());
  });
}

async function waitForApplicationReady(name, port, timeout = 20000) {
  const portNumber = Number(port);
  if (!port) return getApplicationByName(name);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) throw new Error(`Invalid application port: ${port}`);

  const deadline = Date.now() + timeout;
  let application;
  while (Date.now() < deadline) {
    try {
      application = await getApplicationByName(name);
      if (application.status === 'errored' || application.status === 'stopped') {
        throw new Error(`Application ${name} entered ${application.status} state`);
      }
      if (application.status === 'online' && await probeHttp(portNumber)) return application;
    } catch (error) {
      if (error.message.includes('entered')) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Application ${name} is online in PM2 but is not responding on HTTP port ${portNumber}`);
}

async function cleanupFailedApplication(name, originalError) {
  const application = await getApplicationByName(name, 0).catch(() => null);
  let detail = '';
  let startupDiagnosis = null;
  if (application?.errorLog) {
    const errorEntries = tailLog(application.errorLog, name, 'error');
    detail = redactLogValue(errorEntries.at(-1)?.message?.trim() || '').slice(0, 500);
  }
  if (application) startupDiagnosis = await diagnoseApplicationStartup(application).catch(() => null);
  if (application) await call('delete', application.id).catch(() => {});
  if (detail && !originalError.message.includes(detail)) originalError.message = `${originalError.message}: ${detail}`;
  if (startupDiagnosis?.hasIssue) {
    originalError.message = `${originalError.message}. ${startupDiagnosis.issue} Solution: ${startupDiagnosis.solution}`;
    originalError.startupDiagnosis = startupDiagnosis;
  }
  return originalError;
}

function redactLogValue(value) {
  return String(value || '')
    .replace(/((?:password|passwd|secret|token|api[_-]?key|private[_-]?key|authorization|cookie)\s*[=:]\s*)([^\s,;]+)/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .slice(0, 400);
}

function readRecentLogLines(filePath, limit) {
  if (!filePath) return [];
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-limit).map(redactLogValue);
  } catch {
    return [];
  }
}

function getStartupLogContext(application) {
  const errors = readRecentLogLines(application?.errorLog, 8);
  const output = errors.length ? [] : readRecentLogLines(application?.outputLog, 3);
  if (!errors.length && !output.length) return null;
  return { errors, output };
}

function localLogDiagnosis(context) {
  const evidence = context.errors.join('\n');
  if (/EADDRINUSE|address already in use/i.test(evidence)) return { hasIssue: true, severity: 'error', issue: 'The application port is already in use.', solution: 'Stop the process using that port or choose a different port in Advanced settings.', category: 'port' };
  if (/MODULE_NOT_FOUND|Cannot find module|module not found/i.test(evidence)) return { hasIssue: true, severity: 'error', issue: 'A required application module is missing.', solution: 'Run the project package install command in its directory, then start it again.', category: 'dependencies' };
  if (/Could not find a production build|production build.*not found|next start/i.test(evidence) && /build/i.test(evidence)) return { hasIssue: true, severity: 'error', issue: 'The production build required by the start command is missing.', solution: 'Run the project build script before starting the application.', category: 'build' };
  if (/ENOENT|no such file or directory|script does not exist/i.test(evidence)) return { hasIssue: true, severity: 'error', issue: 'The configured application file or directory could not be found.', solution: 'Verify the working directory and the detected start script in Advanced settings.', category: 'path' };
  if (/EACCES|permission denied|access is denied/i.test(evidence)) return { hasIssue: true, severity: 'error', issue: 'The application does not have permission to access a required file or port.', solution: 'Check folder permissions and run the application with an account that can access its directory.', category: 'permissions' };
  return { hasIssue: true, severity: 'error', issue: 'The application reported an error during startup.', solution: 'Open the application Logs page, fix the reported startup error, and restart it.', category: 'startup' };
}

async function requestGroqLogDiagnosis(context, local) {
  if (!process.env.GROQ_API_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b', temperature: 0, max_tokens: 450, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'You diagnose a newly started PM2 application. Return JSON only with keys hasIssue (boolean), severity (error or warning), issue (short), solution (short), and category. Use only the small redacted log sample provided. Never request secrets, reproduce credentials, or include raw log lines in the response. Do not recommend destructive commands.' }, { role: 'user', content: JSON.stringify({ recentErrors: context.errors, recentOutput: context.output, localDiagnosis: local }) }] }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Groq log diagnosis returned HTTP ${response.status}`);
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq returned an empty log diagnosis');
    const result = JSON.parse(content);
    return { hasIssue: result.hasIssue !== false, severity: result.severity === 'warning' ? 'warning' : 'error', issue: String(result.issue || local.issue).slice(0, 300), solution: String(result.solution || local.solution).slice(0, 500), category: String(result.category || local.category).slice(0, 80) };
  } finally {
    clearTimeout(timeout);
  }
}

async function diagnoseApplicationStartup(application) {
  const context = getStartupLogContext(application);
  if (!context?.errors.length) return null;
  const local = localLogDiagnosis(context);
  let ai = null;
  try { ai = await requestGroqLogDiagnosis(context, local); } catch (error) { console.warn(`Groq startup diagnosis unavailable: ${error.message}`); }
  return { ...(ai || local), source: ai ? 'groq' : 'local' };
}

function getApplicationAiContext(application) {
  let snapshot = null;
  try { snapshot = getProjectSnapshot(application.cwd); } catch {}
  const errors = readRecentLogLines(application?.errorLog, 8);
  const output = errors.length ? [] : readRecentLogLines(application?.outputLog, 5);
  const scripts = snapshot?.package?.scripts || {};
  const compactScripts = Object.fromEntries(Object.entries(scripts).slice(0, 30).map(([name, command]) => [name, redactProjectValue(command).slice(0, 220)]));
  return {
    application: { name: application.name, status: application.status, cwd: application.cwd, script: application.script, mode: application.mode, instances: application.instances, nodeVersion: application.nodeVersion, restarts: application.restarts, environmentKeys: application.environmentKeys || [] },
    project: snapshot ? { name: snapshot.package?.name, version: snapshot.package?.version, framework: snapshot.framework, packageManager: snapshot.packageManager, scripts: compactScripts, dependencies: snapshot.package?.dependencyNames?.slice(0, 40) || [], entries: snapshot.entries.slice(0, 30) } : null,
    logs: { recentErrors: errors, recentOutput: output }
  };
}

async function requestGroqApplicationAnswer(context, question) {
  if (!process.env.GROQ_API_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b', temperature: 0.1, max_tokens: 700, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'You are an application operations assistant. Answer the user question using only the supplied structured project metadata and small redacted recent log sample. Return JSON only with keys answer (string), severity (info, warning, or error), and suggestions (array of short strings). Be concise and practical. Never ask for or reveal secrets. Never reproduce raw log lines. Do not recommend destructive commands.' }, { role: 'user', content: JSON.stringify({ question, context }) }] }),
      signal: controller.signal
    });
    if (!response.ok) {
      const providerError = await response.text();
      let detail = '';
      try { detail = JSON.parse(providerError).error?.message || ''; } catch {}
      throw new Error(`Groq application answer returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq returned an empty application answer');
    const result = JSON.parse(content);
    return { answer: String(result.answer || 'No answer was returned.').slice(0, 2500), severity: ['warning', 'error'].includes(result.severity) ? result.severity : 'info', suggestions: Array.isArray(result.suggestions) ? result.suggestions.map(String).map((item) => item.slice(0, 300)).slice(0, 5) : [], source: 'groq' };
  } finally {
    clearTimeout(timeout);
  }
}

async function answerApplicationQuestion(application, question) {
  const safeQuestion = redactLogValue(String(question || '').trim()).slice(0, 1000);
  if (!safeQuestion) throw new Error('Ask a question about this application');
  const context = getApplicationAiContext(application);
  let answer = null;
  try { answer = await requestGroqApplicationAnswer(context, safeQuestion); } catch (error) { console.warn(`Groq application question unavailable: ${error.message}`); }
  return answer || { answer: 'AI is temporarily unavailable. Review the application status and recent logs, then try again.', severity: 'warning', suggestions: ['Open the Logs tab to inspect the latest application output.'], source: 'local' };
}

function tailLog(filePath, application, type) {
  if (!filePath) return [];
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-500);
    return lines.map((message, index) => ({
      timestamp: new Date().toLocaleTimeString('en-GB'),
      sortKey: Date.now() - (lines.length - index),
      application,
      type,
      message,
      id: `${filePath}-${index}`
    }));
  } catch (error) {
    return [{ timestamp: new Date().toLocaleTimeString('en-GB'), application, type: 'error', message: `Unable to read log: ${error.message}` }];
  }
}

async function getLogs(id) {
  const application = await getApplication(id);
  return [...tailLog(application.outputLog, application.name, 'info'), ...tailLog(application.errorLog, application.name, 'error')].sort((left, right) => right.sortKey - left.sortKey);
}

async function runAction(id, action) {
  if (!allowedActions.has(action)) throw new Error(`Unsupported action: ${action}`);
  if (action === 'start') await callRemote('startProcessId', id);
  else await call(action, id);
  return getApplication(id).catch(() => null);
}

async function deployApplication(id) {
  const application = await getApplication(id);
  const gitRoot = await getGitRoot(application.cwd);
  const pullOutput = await runGitPull(gitRoot);
  const build = await runBuild(application.cwd);
  const reloadResult = await call('reload', id);
  return {
    application: await getApplication(id).catch(() => null),
    buildCommand: build.label,
    buildOutput: clipCommandOutput(build.output),
    pullOutput: clipCommandOutput(pullOutput),
    reloadOutput: reloadResult ? 'PM2 reload completed successfully.' : 'PM2 reload returned no output.',
    output: `Pulled latest changes, ran ${build.label}, and reloaded PM2.`
  };
}

function clipCommandOutput(value, limit = 12000) {
  const output = String(value || '').trim();
  if (output.length <= limit) return output || 'No terminal output.';
  return `[Output truncated. Showing the last ${limit} characters.]\n${output.slice(-limit)}`;
}

async function pullApplication(id) {
  const application = await getApplication(id);
  const gitRoot = await getGitRoot(application.cwd);
  return { application, command: 'git pull origin --ff-only', output: clipCommandOutput(await runGitPull(gitRoot)) };
}

async function buildApplication(id) {
  const application = await getApplication(id);
  const build = await runBuild(application.cwd);
  return { application, command: build.label, output: clipCommandOutput(build.output) };
}

function getStorage() {
  try {
    const root = path.parse(process.cwd()).root;
    const stats = fs.statfsSync(root);
    const total = stats.blocks * stats.bsize;
    const available = stats.bavail * stats.bsize;
    const used = total - available;
    return { drive: root.replace(/\\$/, ''), total, used, available, usage: total ? (used / total) * 100 : 0 };
  } catch {
    return null;
  }
}

function cpuSnapshot() {
  return os.cpus().reduce((total, cpu) => {
    const times = cpu.times || {};
    return { idle: total.idle + (times.idle || 0), total: total.total + Object.values(times).reduce((sum, value) => sum + value, 0) };
  }, { idle: 0, total: 0 });
}

async function getCpuUsage() {
  const before = cpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const after = cpuSnapshot();
  const totalDelta = after.total - before.total;
  const idleDelta = after.idle - before.idle;
  return totalDelta > 0 ? Math.round(Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)) * 10) / 10 : 0;
}

async function getServer() {
  const cpus = os.cpus();
  const version = await call('getVersion');
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const storage = getStorage();
  return {
    hostname: os.hostname(),
    operatingSystem: `${os.type()} ${os.release()}`,
    architecture: os.arch(),
    uptime: os.uptime(),
    processor: cpus[0]?.model || 'Unknown',
    cores: cpus.length,
    cpuUsage: await getCpuUsage(),
    memory: { total: totalMemory, used: totalMemory - freeMemory, available: freeMemory, usage: ((totalMemory - freeMemory) / totalMemory) * 100 },
    storage,
    runtime: { node: process.version, pm2: version, npm: 'managed by Node.js', daemon: 'Running' }
  };
}

function sendJson(response, status, payload, headers = {}) {
  const corsOrigin = process.env.PM2_MANAGER_ORIGIN;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}), 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', ...headers });
  response.end(JSON.stringify(payload));
}

function getFrontendFile(pathname) {
  let relativePath = pathname;
  if (FRONTEND_BASE_PATH !== '/' && (pathname === FRONTEND_BASE_PATH || pathname.startsWith(`${FRONTEND_BASE_PATH}/`))) {
    relativePath = pathname.slice(FRONTEND_BASE_PATH.length) || '/';
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(relativePath);
  } catch {
    return null;
  }

  const requestedPath = path.resolve(DIST_DIR, `.${decodedPath}`);
  const relativeToDist = path.relative(DIST_DIR, requestedPath);
  if (relativeToDist.startsWith('..') || path.isAbsolute(relativeToDist)) return null;

  try {
    if (fs.statSync(requestedPath).isFile()) return requestedPath;
  } catch {
    // Client-side routes should receive the application shell.
  }

  const indexPath = path.join(DIST_DIR, 'index.html');
  return fs.existsSync(indexPath) ? indexPath : null;
}

function serveFrontend(request, response, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  if (FRONTEND_BASE_PATH !== '/' && pathname === '/') {
    response.writeHead(302, { Location: `${FRONTEND_BASE_PATH}/` });
    response.end();
    return;
  }

  const filePath = getFrontendFile(pathname);
  if (!filePath) {
    sendJson(response, 404, { error: 'Frontend build not found. Run yarn build first.' });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const headers = {
    'Cache-Control': path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream'
  };
  response.writeHead(200, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  response.end(fs.readFileSync(filePath));
}

async function handle(request, response) {
  if (request.method === 'OPTIONS') { sendJson(response, 204, {}); return; }
  const url = new URL(request.url, `http://${request.headers.host}`);

  const configuredOrigin = process.env.PM2_MANAGER_ORIGIN;
  if (configuredOrigin && url.pathname.startsWith('/api/') && request.headers.origin && request.headers.origin !== configuredOrigin) {
    sendJson(response, 403, { error: 'Origin is not allowed' });
    return;
  }

  if (!url.pathname.startsWith('/api/')) {
    serveFrontend(request, response, url.pathname);
    return;
  }

  if (url.pathname.startsWith('/api/auth')) {
    try {
      await auth.initializeAuth();
      await handleAuthApi(request, response, url);
    } catch (error) {
      console.error(error);
      const message = String(error.message || 'Authentication service unavailable');
      const status = message === 'Invalid username or password' || message.startsWith('Account temporarily locked') ? 401 : error.code === '23505' ? 409 : message.match(/required|must be|not found|reserved|cannot|incorrect|reassign|selected role|password/i) ? 400 : 503;
      sendJson(response, status, { error: message });
    }
    return;
  }

  if (url.pathname === '/api/domains' || url.pathname.startsWith('/api/domains/')) {
    try {
      await auth.initializeAuth();
      const user = await auth.getAuthenticatedUser(request);
      if (!user) { sendJson(response, 401, { error: 'Authentication required' }); return; }
      const permission = requiredPermission(url.pathname, request.method);
      if (permission && !auth.hasPermission(user, permission)) { sendJson(response, 403, { error: 'You do not have permission to perform this action' }); return; }
      await handleDomainApi(request, response, url);
    } catch (error) {
      console.error(error);
      const message = String(error.message || 'Domain scan failed');
      sendJson(response, error.statusCode || (message.match(/valid domain|private|disabled|allowed/i) ? 400 : 503), { error: message });
    }
    return;
  }

  if (url.pathname === '/api/activity') {
    try {
      await auth.initializeAuth();
      const user = await auth.getAuthenticatedUser(request);
      if (!user) { sendJson(response, 401, { error: 'Authentication required' }); return; }
      if (!auth.hasPermission(user, 'activity.view')) { sendJson(response, 403, { error: 'You do not have permission to view activity' }); return; }
      sendJson(response, 200, { activity: await auth.listActivity() });
    } catch (error) {
      console.error(error);
      sendJson(response, 503, { error: error.message || 'Activity service unavailable' });
    }
    return;
  }

  if (url.pathname === '/api/settings' || url.pathname === '/api/settings/test-email') {
    try {
      await auth.initializeAuth();
      const user = await auth.getAuthenticatedUser(request);
      if (!user) { sendJson(response, 401, { error: 'Authentication required' }); return; }
      const permission = request.method === 'GET' && url.pathname === '/api/settings' ? 'settings.view' : 'settings.manage';
      if (!auth.hasPermission(user, permission)) { sendJson(response, 403, { error: 'You do not have permission to manage settings' }); return; }
      if (request.method === 'POST' && url.pathname === '/api/settings/test-email') {
        const result = await sendTestEmail(await auth.getSettings());
        await recordAudit({ userId: user.id, action: 'Send test email', result: 'success', details: `Sent all-domain SMTP test report for ${result.count} domain${result.count === 1 ? '' : 's'} to ${result.recipients.length} recipient${result.recipients.length === 1 ? '' : 's'}` });
        sendJson(response, 200, { message: `Test report sent with ${result.count} domain${result.count === 1 ? '' : 's'}` });
      } else if (request.method === 'GET') {
        sendJson(response, 200, { settings: await auth.getSettings() });
      } else if (request.method === 'PATCH') {
        const payload = await readJsonBody(request);
        const settings = await auth.updateSettings(payload, user.id);
        await recordAudit({ userId: user.id, action: 'Update settings', result: 'success', details: 'Updated application settings' });
        sendJson(response, 200, { settings });
      } else {
        sendJson(response, 405, { error: 'Method not allowed' });
      }
    } catch (error) {
      console.error(error);
      sendJson(response, 503, { error: error.message || 'Settings service unavailable' });
    }
    return;
  }

  let requestUser = null;
  try {
    await auth.initializeAuth();
    const user = await auth.getAuthenticatedUser(request);
    if (!user) { sendJson(response, 401, { error: 'Authentication required' }); return; }
    requestUser = user;
    const permission = requiredPermission(url.pathname, request.method);
    if (permission && !auth.hasPermission(user, permission)) { sendJson(response, 403, { error: 'You do not have permission to perform this action' }); return; }
    if (request.method === 'POST' && url.pathname === '/api/pm2/applications/analyze') {
      const payload = await readJsonBody(request);
      const analysis = await analyzeProject(payload.cwd);
      await recordAudit({ userId: user.id, action: 'Analyze application project', result: 'success', details: `Analyzed project at ${analysis.project.name || payload.cwd}` });
      sendJson(response, 200, { analysis });
      return;
    }
    await connectPm2();
    if (request.method === 'POST' && url.pathname === '/api/pm2/applications') {
      const payload = await readJsonBody(request);
      const settings = await auth.getSettings();
      const application = await createApplication({ ...payload, namespace: payload.namespace || settings.applicationDefaultNamespace || 'default', mode: payload.mode || settings.applicationDefaultMode || 'fork', instances: payload.instances || settings.applicationDefaultInstances || 1, autorestart: payload.autorestart ?? settings.applicationDefaultAutorestart ?? true, watch: payload.watch ?? settings.applicationDefaultWatch ?? false });
      await saveManagedApplication(application);
      if (!auth.hasPermission(user, '*')) {
        const assigned = await auth.listUserApplications(user.id);
        await auth.replaceUserApplications(user.id, [...assigned, application.name], user.id);
      }
      await recordAudit({ userId: user.id, application: application.displayName, action: 'Start', result: 'success', details: 'Application added and started' });
      sendJson(response, 201, { application });
      return;
    }
    const match = url.pathname.match(/^\/api\/pm2\/applications\/(\d+)(?:\/(logs|deploy|ai|git-pull|build|npm-install|actions\/([a-z]+)))?$/);
    if (request.method === 'GET' && url.pathname === '/api/pm2/health') { sendJson(response, 200, { ok: true, pm2Home: process.env.PM2_HOME }); return; }
    if (request.method === 'GET' && url.pathname === '/api/pm2/applications') { sendJson(response, 200, { applications: await getApplicationsForUser(user) }); return; }
    if (request.method === 'GET' && url.pathname === '/api/pm2/server') { sendJson(response, 200, { server: await getServer() }); return; }
    if (match && request.method === 'GET' && match[2] === 'logs') { const application = await getApplication(Number(match[1])); await ensureApplicationAccess(user, application); sendJson(response, 200, { logs: await getLogs(Number(match[1])) }); return; }
    if (match && request.method === 'GET' && !match[2]) { const application = await getApplication(Number(match[1])); await ensureApplicationAccess(user, application); sendJson(response, 200, { application }); return; }
    if (match && request.method === 'POST' && match[2] === 'ai') { const application = await getApplication(Number(match[1])); await ensureApplicationAccess(user, application); const payload = await readJsonBody(request); const answer = await answerApplicationQuestion(application, payload.question); await recordAudit({ userId: user.id, application: application.displayName, action: 'Ask application AI', result: 'success', details: 'Asked an AI question about the application' }); sendJson(response, 200, answer); return; }
    if (match && request.method === 'POST' && match[2] === 'git-pull') { const target = await getApplication(Number(match[1])); await ensureApplicationAccess(user, target); const result = await pullApplication(Number(match[1])); await recordAudit({ userId: user.id, application: target.displayName, action: 'Git pull', result: 'success', details: 'Pulled latest changes from origin' }); sendJson(response, 200, result); return; }
    if (match && request.method === 'POST' && match[2] === 'build') { const target = await getApplication(Number(match[1])); await ensureApplicationAccess(user, target); const result = await buildApplication(Number(match[1])); await recordAudit({ userId: user.id, application: target.displayName, action: 'Build', result: 'success', details: `Ran ${result.command}` }); sendJson(response, 200, result); return; }
    if (match && request.method === 'POST' && match[2] === 'npm-install') { const target = await getApplication(Number(match[1])); await ensureApplicationAccess(user, target); const result = await installApplicationDependencies(target.cwd); await recordAudit({ userId: user.id, application: target.displayName, action: 'npm i', result: 'success', details: `Installed dependencies in ${target.cwd}` }); sendJson(response, 200, result); return; }
    if (match && request.method === 'POST' && match[2] === 'deploy') {
      await ensureApplicationAccess(user, await getApplication(Number(match[1])));
      const result = await deployApplication(Number(match[1]));
      await recordAudit({ userId: user.id, application: result.application?.displayName || String(match[1]), action: 'Deploy', result: 'success', details: result.output || 'Deployment completed' });
      sendJson(response, 200, result);
      return;
    }
    if (match && request.method === 'POST' && match[3]) {
      const action = match[3];
      const target = await getApplication(Number(match[1]));
      await ensureApplicationAccess(user, target);
      const application = await runAction(Number(match[1]), action);
      if (action === 'delete') await deactivateManagedApplication(target.name);
      else if (application) await saveManagedApplication(application);
      await recordAudit({ userId: user.id, application: application?.displayName || String(match[1]), action: action.charAt(0).toUpperCase() + action.slice(1), result: 'success', details: `Application ${action} completed` });
      sendJson(response, 200, { application });
      return;
    }
    sendJson(response, 404, { error: 'Route not found' });
  } catch (error) {
    console.error(error);
    if (requestUser && url.pathname.startsWith('/api/pm2/')) {
      const applicationId = url.pathname.match(/^\/api\/pm2\/applications\/(\d+)/)?.[1] || '';
      await recordAudit({ userId: requestUser.id, application: applicationId, action: 'PM2 request', result: 'error', details: error.message || 'PM2 request failed' });
    }
    sendJson(response, error.statusCode || 500, { error: error.message || 'PM2 request failed' });
  }
}

const server = http.createServer(handle);
server.listen(PORT, HOST, () => {
  console.log(`PM2 Manager API listening on http://${HOST}:${PORT} (PM2_HOME=${process.env.PM2_HOME})`);
  Promise.all([auth.initializeAuth(), initializeApplicationStorage(), initializeDomainStorage()]).then(() => {
    if (process.env.DOMAIN_SCAN_ENABLED !== 'false') {
      setInterval(domainSchedulerTick, 30 * 1000).unref();
      console.log('Domain monitor scheduler enabled');
    }
  }).catch((error) => {
    console.error('Manager startup failed:', error.message);
    server.close(() => process.exit(1));
  });
});

function shutdown() {
  if (connectionPromise) pm2.disconnect(() => process.exit(0));
  else process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
