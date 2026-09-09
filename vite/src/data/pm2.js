export function formatMemory(bytes) {
  if (!bytes) return '-';
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function formatUptime(seconds) {
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}
