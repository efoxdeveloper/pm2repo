async function request(path, options) {
  const response = await fetch(`/api/auth${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Authentication request failed');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function getCurrentUser() {
  return request('/me');
}

export function login(credentials) {
  return request('/login', { method: 'POST', body: JSON.stringify(credentials) });
}

export function logout() {
  return request('/logout', { method: 'POST' });
}

export function getUsers() {
  return request('/users');
}

export function getRoles() {
  return request('/roles');
}

export function getPermissions() {
  return request('/permissions');
}

export function createUser(user) {
  return request('/users', { method: 'POST', body: JSON.stringify(user) });
}

export function updateUserAccess(id, changes) {
  return request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
}

export function createRole(role) {
  return request('/roles', { method: 'POST', body: JSON.stringify(role) });
}

export function updateRole(id, role) {
  return request(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(role) });
}

export function deleteRole(id) {
  return request(`/roles/${id}`, { method: 'DELETE' });
}

export function resetUserPassword(id, password) {
  return request(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) });
}

export function changePassword(passwords) {
  return request('/change-password', { method: 'POST', body: JSON.stringify(passwords) });
}

export function getAvailableApplications() {
  return request('/available-applications');
}

export function getApplicationAssignments() {
  return request('/application-assignments');
}

export function updateUserApplications(id, applicationNames) {
  return request(`/users/${id}/applications`, { method: 'PUT', body: JSON.stringify({ applicationNames }) });
}
