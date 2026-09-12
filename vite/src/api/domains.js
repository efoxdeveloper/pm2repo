const API_ROOT = '/api/domains';

async function request(path = '', options) {
  const response = await fetch(`${API_ROOT}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to reach the Website & Hosting API');
  return payload;
}

function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}

export async function getDomains(params = {}) {
  return request(queryString(params));
}

export async function getDomainDashboard() {
  return request('/dashboard');
}

export async function getDomainOptions() {
  return request('/options');
}

export async function exportDomains(params = {}) {
  const response = await fetch(`${API_ROOT}/export${queryString(params)}`, { headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Unable to export domains');
  }
  return response.blob();
}

export async function scanDomains(domains, management) {
  return request('/scan', { method: 'POST', body: JSON.stringify({ domains, management }) });
}

export async function checkWebspace(domains) {
  return request('/webspace/check', { method: 'POST', body: JSON.stringify(domains ? { domains } : {}) });
}

export async function importDomains(rows) {
  return request('/import', { method: 'POST', body: JSON.stringify({ rows }) });
}

export async function deleteDomain(domain) {
  return request(`/${encodeURIComponent(domain)}`, { method: 'DELETE' });
}

export async function updateDomainScan(domain, scanEnabled) {
  return request(`/${encodeURIComponent(domain)}`, { method: 'PATCH', body: JSON.stringify({ scanEnabled }) });
}

export async function updateDomainManagement(domain, management) {
  return request(`/${encodeURIComponent(domain)}`, { method: 'PATCH', body: JSON.stringify({ management }) });
}
