async function request(path = '') {
  const response = await fetch(`/api/activity${path}`, { credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to load activity');
  return payload;
}

export function getActivity() {
  return request();
}
