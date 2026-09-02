const API_ROOT = '/api/pm2';

async function request(path, options) {
  const response = await fetch(`${API_ROOT}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to reach the PM2 Manager API');
  return payload;
}

export async function getApplications() {
  return request('/applications');
}

export async function getApplication(id) {
  return request(`/applications/${id}`);
}

export async function getApplicationLogs(id) {
  return request(`/applications/${id}/logs`);
}

export async function getServerInfo() {
  return request('/server');
}

export async function performApplicationAction(id, action) {
  return request(`/applications/${id}/actions/${action}`, { method: 'POST' });
}
