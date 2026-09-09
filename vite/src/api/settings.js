async function request(options = {}) {
  const { path = '/api/settings', ...requestOptions } = options;
  const response = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...requestOptions });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to save settings');
  return payload;
}

export function getSettings() {
  return request();
}

export function updateSettings(settings) {
  return request({ method: 'PATCH', body: JSON.stringify(settings) });
}

export function sendTestEmail() {
  return request({ path: '/api/settings/test-email', method: 'POST', body: JSON.stringify({}) });
}
