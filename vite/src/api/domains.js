const API_ROOT = '/api/domains';

async function request(path = '', options) {
  const response = await fetch(`${API_ROOT}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to reach the domain monitor API');
  return payload;
}

export async function getDomains() {
  return request();
}

export async function scanDomains(domains) {
  return request('/scan', { method: 'POST', body: JSON.stringify({ domains }) });
}

export async function deleteDomain(domain) {
  return request(`/${encodeURIComponent(domain)}`, { method: 'DELETE' });
}

export async function updateDomainScan(domain, scanEnabled) {
  return request(`/${encodeURIComponent(domain)}`, { method: 'PATCH', body: JSON.stringify({ scanEnabled }) });
}
