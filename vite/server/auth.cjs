const crypto = require('node:crypto');
const path = require('node:path');
const { promisify } = require('node:util');
const { Pool } = require('pg');

if (typeof process.loadEnvFile === 'function') {
  for (const envFile of ['.env', '.env.local']) {
    try { process.loadEnvFile(path.join(__dirname, '..', envFile)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'pm2_session';
const SESSION_DAYS = 7;
const PASSWORD_HASH_VERSION = 'scrypt-v1';

const PERMISSIONS = [
  ['dashboard.view', 'View the dashboard'],
  ['applications.view', 'View managed applications'],
  ['applications.manage', 'Start, stop, restart, delete, deploy, and add applications'],
  ['logs.view', 'View application logs'],
  ['server.view', 'View server information'],
  ['activity.view', 'View activity history'],
  ['domain-dashboard.view', 'View the domain quick-scan dashboard'],
  ['domains.view', 'View monitored domains'],
  ['domains.manage', 'Add, scan, and remove monitored domains'],
  ['users.manage', 'Create, disable, and assign users'],
  ['roles.manage', 'Create roles and assign permissions'],
  ['settings.view', 'View settings'],
  ['settings.manage', 'Change application settings'],
  ['*', 'All permissions']
];

function createPool() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      connectionTimeoutMillis: 10000
    });
  }

  return new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    connectionTimeoutMillis: 10000
  });
}

const pool = createPool();

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS auth_roles (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_permissions (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS auth_role_permissions (
  role_id BIGINT NOT NULL REFERENCES auth_roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES auth_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS auth_users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  password_hash TEXT NOT NULL,
  role_id BIGINT NOT NULL REFERENCES auth_roles(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_activity (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES auth_users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  application VARCHAR(160) NOT NULL DEFAULT '',
  action VARCHAR(120) NOT NULL,
  result VARCHAR(20) NOT NULL DEFAULT 'success',
  details TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_activity_occurred_at_idx ON audit_activity(occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_activity_user_id_idx ON audit_activity(user_id);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(120) PRIMARY KEY,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by BIGINT REFERENCES auth_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_user_applications (
  user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  application_name VARCHAR(160) NOT NULL,
  assigned_by BIGINT REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, application_name)
);

CREATE INDEX IF NOT EXISTS auth_user_applications_name_idx ON auth_user_applications(application_name);
`;

let initialized;

async function initializeAuth() {
  if (!initialized) {
    initialized = (async () => {
      await pool.query(SCHEMA_SQL);
      await pool.query(`INSERT INTO auth_roles (name, description, is_system) VALUES ('Super Admin', 'Developer-level administrator with access to every feature', TRUE) ON CONFLICT (name) DO NOTHING`);
      await pool.query(`UPDATE auth_roles SET is_system = TRUE, description = 'Developer-level administrator with access to every feature', updated_at = NOW() WHERE name = 'Super Admin'`);
      for (const [key, description] of PERMISSIONS) {
        await pool.query('INSERT INTO auth_permissions (key, description) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, description]);
      }
      await pool.query(`
        INSERT INTO auth_role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM auth_roles r CROSS JOIN auth_permissions p
        WHERE r.name = 'Super Admin'
        ON CONFLICT DO NOTHING
      `);
      await pool.query(`
        INSERT INTO app_settings (setting_key, setting_value) VALUES
          ('panelName', '"PM2 Manager"'::jsonb),
          ('refreshInterval', '10'::jsonb),
          ('defaultLogLines', '500'::jsonb),
          ('autoRefreshProcesses', 'true'::jsonb),
          ('domainScanEnabled', 'true'::jsonb),
          ('domainScanIntervalMinutes', '60'::jsonb),
          ('sslWarningDays', '30'::jsonb),
          ('sslCriticalDays', '7'::jsonb),
          ('sslCheckIntervalMinutes', '1440'::jsonb),
          ('domainWarningDays', '30'::jsonb),
          ('domainCriticalDays', '7'::jsonb),
          ('domainScheduleEnabled', 'true'::jsonb),
          ('domainScheduleFrequency', '"daily"'::jsonb),
          ('domainScheduleTime', '"09:00"'::jsonb),
          ('domainScheduleWeekdays', '[1,3,5]'::jsonb),
          ('domainScheduleMonthDays', '[1]'::jsonb),
          ('domainReportLeadDays', '[30,14,7,1]'::jsonb),
          ('domainReportRecipients', '""'::jsonb),
          ('webspaceScheduleEnabled', 'true'::jsonb),
          ('webspaceCheckIntervalMinutes', '60'::jsonb),
          ('webspaceWarningPercent', '80'::jsonb),
          ('webspaceCriticalPercent', '95'::jsonb),
          ('applicationDefaultNamespace', '"default"'::jsonb),
          ('applicationDefaultMode', '"fork"'::jsonb),
          ('applicationDefaultInstances', '1'::jsonb),
          ('applicationDefaultAutorestart', 'true'::jsonb),
          ('applicationDefaultWatch', 'false'::jsonb)
        ON CONFLICT (setting_key) DO NOTHING
      `);
      await pool.query('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
    })();
  }
  return initialized;
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username)) throw new Error('Username must be 3-80 characters and use only letters, numbers, dots, underscores, or hyphens');
  return username;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 12 || password.length > 128) throw new Error('Password must be 12-128 characters');
  return password;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${PASSWORD_HASH_VERSION}$${salt.toString('base64')}$${Buffer.from(derivedKey).toString('base64')}`;
}

async function verifyPassword(password, storedHash) {
  try {
    const [version, encodedSalt, encodedKey] = String(storedHash).split('$');
    if (version !== PASSWORD_HASH_VERSION || !encodedSalt || !encodedKey) return false;
    const salt = Buffer.from(encodedSalt, 'base64');
    const expected = Buffer.from(encodedKey, 'base64');
    const actual = Buffer.from(await scrypt(String(password || ''), salt, expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function getUserByUsername(username) {
  const result = await pool.query(`
    SELECT u.*, r.name AS role_name,
      COALESCE(array_agg(p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permissions
    FROM auth_users u
    JOIN auth_roles r ON r.id = u.role_id
    LEFT JOIN auth_role_permissions rp ON rp.role_id = r.id
    LEFT JOIN auth_permissions p ON p.id = rp.permission_id
    WHERE u.username = $1
    GROUP BY u.id, r.name
  `, [normalizeUsername(username)]);
  return result.rows[0] || null;
}

function publicUser(user) {
  return { id: user.id, username: user.username, displayName: user.display_name, role: user.role_name, permissions: user.permissions || [] };
}

async function createUser({ username, password, displayName, roleName = 'Super Admin' }) {
  const normalizedUsername = validateUsername(username);
  const validPassword = validatePassword(password);
  const roleResult = await pool.query('SELECT id, name FROM auth_roles WHERE name = $1', [roleName]);
  if (!roleResult.rows[0]) throw new Error(`Role not found: ${roleName}`);
  const passwordHash = await hashPassword(validPassword);
  const safeDisplayName = String(displayName || normalizedUsername).trim().slice(0, 120) || normalizedUsername;
  const result = await pool.query(`
    INSERT INTO auth_users (username, display_name, password_hash, role_id)
    VALUES ($1, $2, $3, $4)
    RETURNING id, username, display_name
  `, [normalizedUsername, safeDisplayName, passwordHash, roleResult.rows[0].id]);
  return result.rows[0];
}

async function createManagedUser({ username, password, displayName, roleId }) {
  const roleResult = await pool.query('SELECT name FROM auth_roles WHERE id = $1', [roleId]);
  if (!roleResult.rows[0]) throw new Error('Selected role does not exist');
  return createUser({ username, password, displayName, roleName: roleResult.rows[0].name });
}

async function listRoles() {
  const result = await pool.query(`
    SELECT r.id, r.name, r.description, r.is_system, COUNT(DISTINCT u.id)::int AS user_count,
      COALESCE(array_agg(p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permissions
    FROM auth_roles r
    LEFT JOIN auth_users u ON u.role_id = r.id
    LEFT JOIN auth_role_permissions rp ON rp.role_id = r.id
    LEFT JOIN auth_permissions p ON p.id = rp.permission_id
    GROUP BY r.id
    ORDER BY r.is_system DESC, r.name
  `);
  return result.rows;
}

async function listUsers() {
  const result = await pool.query(`
    SELECT u.id, u.username, u.display_name, u.is_active, u.last_login_at, u.created_at, r.id AS role_id, r.name AS role_name
    FROM auth_users u JOIN auth_roles r ON r.id = u.role_id
    ORDER BY u.username
  `);
  return result.rows.map((user) => ({ id: user.id, username: user.username, displayName: user.display_name, isActive: user.is_active, lastLoginAt: user.last_login_at, createdAt: user.created_at, roleId: user.role_id, role: user.role_name }));
}

async function listPermissions() {
  const result = await pool.query('SELECT id, key, description FROM auth_permissions WHERE key <> $1 ORDER BY key', ['*']);
  return result.rows;
}

async function createRole({ name, description, permissions = [] }) {
  const normalizedName = String(name || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{1,79}$/.test(normalizedName)) throw new Error('Role name must be 2-80 characters');
  if (normalizedName.toLowerCase() === 'super admin') throw new Error('The Super Admin role is reserved');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const roleResult = await client.query('INSERT INTO auth_roles (name, description) VALUES ($1, $2) RETURNING id, name, description, is_system', [normalizedName, String(description || '').trim().slice(0, 255)]);
    const permissionKeys = [...new Set(Array.isArray(permissions) ? permissions.map(String) : [])].filter((key) => key !== '*');
    if (permissionKeys.length) {
      const permissionResult = await client.query('SELECT id FROM auth_permissions WHERE key = ANY($1::text[])', [permissionKeys]);
      for (const permission of permissionResult.rows) await client.query('INSERT INTO auth_role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [roleResult.rows[0].id, permission.id]);
    }
    await client.query('COMMIT');
    return roleResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function updateRole(id, { name, description, permissions = [] }) {
  const roleId = Number(id);
  if (!Number.isInteger(roleId) || roleId < 1) throw new Error('Invalid role');
  const roleResult = await pool.query('SELECT id, is_system FROM auth_roles WHERE id = $1', [roleId]);
  if (!roleResult.rows[0]) throw new Error('Role not found');
  if (roleResult.rows[0].is_system) throw new Error('The Super Admin role cannot be edited');
  const normalizedName = String(name || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{1,79}$/.test(normalizedName)) throw new Error('Role name must be 2-80 characters');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE auth_roles SET name = $1, description = $2, updated_at = NOW() WHERE id = $3', [normalizedName, String(description || '').trim().slice(0, 255), roleId]);
    await client.query('DELETE FROM auth_role_permissions WHERE role_id = $1', [roleId]);
    const permissionKeys = [...new Set(Array.isArray(permissions) ? permissions.map(String) : [])].filter((key) => key !== '*');
    if (permissionKeys.length) {
      const permissionResult = await client.query('SELECT id FROM auth_permissions WHERE key = ANY($1::text[])', [permissionKeys]);
      for (const permission of permissionResult.rows) await client.query('INSERT INTO auth_role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [roleId, permission.id]);
    }
    await client.query('COMMIT');
    return (await listRoles()).find((role) => Number(role.id) === roleId);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function deleteRole(id) {
  const roleId = Number(id);
  const result = await pool.query('SELECT is_system FROM auth_roles WHERE id = $1', [roleId]);
  if (!result.rows[0]) throw new Error('Role not found');
  if (result.rows[0].is_system) throw new Error('The Super Admin role cannot be deleted');
  const users = await pool.query('SELECT 1 FROM auth_users WHERE role_id = $1 LIMIT 1', [roleId]);
  if (users.rows[0]) throw new Error('Reassign users before deleting this role');
  await pool.query('DELETE FROM auth_roles WHERE id = $1', [roleId]);
  return listRoles();
}

async function updateUserAccess(id, { roleId, isActive }) {
  if (roleId === undefined && isActive === undefined) throw new Error('No user changes supplied');
  const values = [];
  const updates = [];
  if (roleId !== undefined) {
    const normalizedRoleId = Number(roleId);
    if (!Number.isInteger(normalizedRoleId) || normalizedRoleId < 1) throw new Error('Invalid role');
    const role = await pool.query('SELECT 1 FROM auth_roles WHERE id = $1', [normalizedRoleId]);
    if (!role.rows[0]) throw new Error('Selected role does not exist');
    values.push(normalizedRoleId);
    updates.push(`role_id = $${values.length}`);
  }
  if (isActive !== undefined) { values.push(Boolean(isActive)); updates.push(`is_active = $${values.length}`); }
  values.push(Number(id));
  const result = await pool.query(`UPDATE auth_users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING id`, values);
  if (!result.rowCount) throw new Error('User not found');
  return listUsers();
}

async function listUserApplications(userId) {
  const result = await pool.query('SELECT application_name FROM auth_user_applications WHERE user_id = $1 ORDER BY application_name', [Number(userId)]);
  return result.rows.map((row) => row.application_name);
}

async function listApplicationAssignments() {
  const result = await pool.query(`
    SELECT a.user_id AS "userId", a.application_name AS "applicationName", u.username
    FROM auth_user_applications a JOIN auth_users u ON u.id = a.user_id
    ORDER BY u.username, a.application_name
  `);
  return result.rows;
}

async function replaceUserApplications(userId, applicationNames, assignedBy) {
  const targetId = Number(userId);
  const user = await pool.query('SELECT id FROM auth_users WHERE id = $1', [targetId]);
  if (!user.rows[0]) throw new Error('User not found');
  const names = [...new Set((Array.isArray(applicationNames) ? applicationNames : []).map((name) => String(name).trim()).filter((name) => name && name.length <= 160))];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM auth_user_applications WHERE user_id = $1', [targetId]);
    for (const name of names) await client.query('INSERT INTO auth_user_applications (user_id, application_name, assigned_by) VALUES ($1, $2, $3)', [targetId, name, Number(assignedBy)]);
    await client.query('COMMIT');
    return listUserApplications(targetId);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function hasApplicationAccess(userId, applicationName) {
  const result = await pool.query('SELECT 1 FROM auth_user_applications WHERE user_id = $1 AND application_name = $2', [Number(userId), String(applicationName)]);
  return Boolean(result.rows[0]);
}

async function changePassword(userId, currentPassword, newPassword) {
  const result = await pool.query('SELECT id, password_hash FROM auth_users WHERE id = $1 AND is_active = TRUE', [Number(userId)]);
  if (!result.rows[0] || !(await verifyPassword(currentPassword, result.rows[0].password_hash))) throw new Error('Current password is incorrect');
  const passwordHash = await hashPassword(validatePassword(newPassword));
  await pool.query('UPDATE auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, Number(userId)]);
  await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [Number(userId)]);
}

async function resetUserPassword(id, newPassword) {
  const passwordHash = await hashPassword(validatePassword(newPassword));
  const result = await pool.query('UPDATE auth_users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $2 RETURNING id', [passwordHash, Number(id)]);
  if (!result.rowCount) throw new Error('User not found');
  await pool.query('DELETE FROM auth_sessions WHERE user_id = $1', [Number(id)]);
}

async function recordActivity({ userId = null, application = '', action, result = 'success', details = '', metadata = {} }) {
  await pool.query('INSERT INTO audit_activity (user_id, application, action, result, details, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [userId ? Number(userId) : null, String(application || '').slice(0, 160), String(action || '').slice(0, 120), String(result || 'success').slice(0, 20), String(details || ''), JSON.stringify(metadata || {})]);
}

async function listActivity(limit = 500) {
  const result = await pool.query(`
    SELECT a.id, a.occurred_at AS "occurredAt", a.application, a.action, a.result, a.details,
      COALESCE(u.display_name, 'System') AS "user"
    FROM audit_activity a
    LEFT JOIN auth_users u ON u.id = a.user_id
    ORDER BY a.occurred_at DESC
    LIMIT $1
  `, [Math.min(1000, Math.max(1, Number(limit) || 500))]);
  return result.rows;
}

async function getSettings() {
  const result = await pool.query('SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key');
  return Object.fromEntries(result.rows.map((row) => [row.setting_key, row.setting_value]));
}

async function updateSettings(settings, userId) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Settings must be an object');
  const allowed = new Set(['panelName', 'refreshInterval', 'defaultLogLines', 'autoRefreshProcesses', 'domainScanEnabled', 'domainScanIntervalMinutes', 'sslWarningDays', 'sslCriticalDays', 'sslCheckIntervalMinutes', 'domainWarningDays', 'domainCriticalDays', 'domainScheduleEnabled', 'domainScheduleFrequency', 'domainScheduleTime', 'domainScheduleWeekdays', 'domainScheduleMonthDays', 'domainReportLeadDays', 'domainReportRecipients', 'webspaceScheduleEnabled', 'webspaceCheckIntervalMinutes', 'webspaceWarningPercent', 'webspaceCriticalPercent', 'applicationDefaultNamespace', 'applicationDefaultMode', 'applicationDefaultInstances', 'applicationDefaultAutorestart', 'applicationDefaultWatch']);
  const normalized = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!allowed.has(key)) continue;
    if (key === 'panelName') normalized[key] = String(value || '').trim().slice(0, 120) || 'PM2 Manager';
    if (key === 'refreshInterval') normalized[key] = Math.min(300, Math.max(5, Number(value) || 10));
    if (key === 'defaultLogLines') normalized[key] = Math.min(5000, Math.max(1, Number(value) || 500));
    if (key === 'autoRefreshProcesses') normalized[key] = value === true || value === 'true';
    if (['domainScanIntervalMinutes', 'webspaceCheckIntervalMinutes', 'sslCheckIntervalMinutes', 'sslWarningDays', 'sslCriticalDays', 'domainWarningDays', 'domainCriticalDays', 'applicationDefaultInstances'].includes(key)) normalized[key] = Math.min(5000, Math.max(1, Number(value) || 1));
    if (['webspaceWarningPercent', 'webspaceCriticalPercent'].includes(key)) normalized[key] = Math.min(1000, Math.max(1, Number(value) || 1));
    if (key === 'domainScanEnabled' || key === 'webspaceScheduleEnabled' || key === 'applicationDefaultAutorestart' || key === 'applicationDefaultWatch') normalized[key] = value === true || value === 'true';
    if (key === 'applicationDefaultNamespace') normalized[key] = String(value || '').trim().replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'default';
    if (key === 'applicationDefaultMode') normalized[key] = value === 'cluster' ? 'cluster' : 'fork';
    if (key === 'domainScheduleEnabled') normalized[key] = value === true || value === 'true';
    if (key === 'domainScheduleFrequency') normalized[key] = ['daily', 'weekly', 'monthly'].includes(value) ? value : 'daily';
    if (key === 'domainScheduleTime') normalized[key] = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)) ? String(value) : '09:00';
    if (['domainScheduleWeekdays', 'domainScheduleMonthDays', 'domainReportLeadDays'].includes(key)) {
      const maximum = key === 'domainScheduleWeekdays' ? 6 : key === 'domainScheduleMonthDays' ? 31 : 3650;
      const values = [...new Set((Array.isArray(value) ? value : []).map(Number).filter((item) => Number.isInteger(item) && item >= (key === 'domainScheduleWeekdays' ? 0 : 1) && item <= maximum))].sort((left, right) => left - right);
      normalized[key] = values.length ? values : key === 'domainScheduleWeekdays' ? [1] : key === 'domainScheduleMonthDays' ? [1] : [7];
    }
    if (key === 'domainReportRecipients') normalized[key] = String(value || '').split(/[;,\s]+/).map((item) => item.trim().toLowerCase()).filter((item) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item)).slice(0, 20).join(',');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of Object.entries(normalized)) {
      await client.query(`
        INSERT INTO app_settings (setting_key, setting_value, updated_by, updated_at)
        VALUES ($1, $2::jsonb, $3, NOW())
        ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
      `, [key, JSON.stringify(value), Number(userId)]);
    }
    await client.query('COMMIT');
    return getSettings();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(header) {
  return String(header || '').split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return cookies;
  }, {});
}

function getCookieHeader(token, maxAge = SESSION_DAYS * 86400) {
  const secure = process.env.AUTH_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

async function createSession(user, request) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await pool.query('INSERT INTO auth_sessions (token_hash, user_id, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)', [hashSessionToken(token), user.id, expiresAt, request.socket.remoteAddress || null, request.headers['user-agent'] || null]);
  return { token, expiresAt };
}

async function getAuthenticatedUser(request) {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  if (!token || token.length !== 64) return null;
  const result = await pool.query(`
    SELECT u.*, r.name AS role_name,
      COALESCE(array_agg(p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permissions
    FROM auth_sessions s
    JOIN auth_users u ON u.id = s.user_id
    JOIN auth_roles r ON r.id = u.role_id
    LEFT JOIN auth_role_permissions rp ON rp.role_id = r.id
    LEFT JOIN auth_permissions p ON p.id = rp.permission_id
    WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = TRUE
    GROUP BY u.id, r.name
  `, [hashSessionToken(token)]);
  if (!result.rows[0]) return null;
  await pool.query('UPDATE auth_sessions SET last_seen_at = NOW() WHERE token_hash = $1', [hashSessionToken(token)]);
  return publicUser(result.rows[0]);
}

async function destroySession(request) {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
}

async function login(username, password, request) {
  const normalizedUsername = normalizeUsername(username);
  const user = await getUserByUsername(normalizedUsername);
  const genericError = new Error('Invalid username or password');
  if (!user || !user.is_active) throw genericError;
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) throw new Error('Account temporarily locked. Try again later.');

  const passwordMatches = await verifyPassword(password, user.password_hash);
  if (!passwordMatches) {
    const attempts = Number(user.failed_login_attempts || 0) + 1;
    await pool.query('UPDATE auth_users SET failed_login_attempts = $1, locked_until = $2, updated_at = NOW() WHERE id = $3', [attempts, attempts >= 5 ? new Date(Date.now() + 15 * 60000) : null, user.id]);
    throw genericError;
  }

  await pool.query('UPDATE auth_users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);
  await pool.query('DELETE FROM auth_sessions WHERE expires_at <= NOW() OR user_id = $1', [user.id]);
  const session = await createSession(user, request);
  return { user: publicUser(user), session };
}

function hasPermission(user, permission) {
  return Boolean(user && (user.permissions || []).some((item) => item === '*' || item === permission));
}

module.exports = {
  SCHEMA_SQL,
  SESSION_COOKIE,
  createSession,
  createManagedUser,
  createUser,
  createRole,
  updateRole,
  deleteRole,
  changePassword,
  resetUserPassword,
  recordActivity,
  listActivity,
  getSettings,
  updateSettings,
  destroySession,
  getAuthenticatedUser,
  getCookieHeader,
  hasPermission,
  initializeAuth,
  login,
  listPermissions,
  listRoles,
  listUsers,
  pool,
  publicUser,
  validatePassword,
  validateUsername,
  updateUserAccess,
  listUserApplications,
  listApplicationAssignments,
  replaceUserApplications,
  hasApplicationAccess
};
