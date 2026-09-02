export const applications = [
  {
    id: 0,
    name: 'gymfox-api',
    displayName: 'GYMFox API',
    namespace: 'default',
    status: 'online',
    pid: 8921,
    mode: 'fork',
    instances: 1,
    cpu: 2.4,
    memory: 152043520,
    uptime: 273600,
    restarts: 1,
    nodeVersion: '22.x',
    script: 'server.js',
    cwd: 'C:\\apps\\gymfox-api',
    created: '30 Aug 2026, 10:32 AM',
    errorLog: 'C:\\Users\\Administrator.pm2\\logs\\gymfox-api-error.log',
    outputLog: 'C:\\Users\\Administrator.pm2\\logs\\gymfox-api-out.log'
  },
  {
    id: 1,
    name: 'crm-api',
    displayName: 'CRM API',
    namespace: 'default',
    status: 'online',
    pid: 7742,
    mode: 'cluster',
    instances: 2,
    cpu: 4.1,
    memory: 230686720,
    uptime: 30720,
    restarts: 3,
    nodeVersion: '22.x',
    script: 'server.js',
    cwd: 'C:\\apps\\crm-api',
    created: '01 Sep 2026, 02:15 PM',
    errorLog: 'C:\\Users\\Administrator.pm2\\logs\\crm-api-error.log',
    outputLog: 'C:\\Users\\Administrator.pm2\\logs\\crm-api-out.log'
  },
  {
    id: 2,
    name: 'school-api',
    displayName: 'School API',
    namespace: 'default',
    status: 'online',
    pid: 6531,
    mode: 'cluster',
    instances: 4,
    cpu: 1.2,
    memory: 102760448,
    uptime: 957600,
    restarts: 0,
    nodeVersion: '22.x',
    script: 'server.js',
    cwd: 'C:\\apps\\school-api',
    created: '22 Aug 2026, 09:10 AM',
    errorLog: 'C:\\Users\\Administrator.pm2\\logs\\school-api-error.log',
    outputLog: 'C:\\Users\\Administrator.pm2\\logs\\school-api-out.log'
  },
  {
    id: 3,
    name: 'payment-api',
    displayName: 'Payment API',
    namespace: 'default',
    status: 'errored',
    pid: null,
    mode: 'fork',
    instances: 1,
    cpu: 0,
    memory: 0,
    uptime: 0,
    restarts: 8,
    nodeVersion: '22.x',
    script: 'server.js',
    cwd: 'C:\\apps\\payment-api',
    created: '28 Aug 2026, 04:45 PM',
    errorLog: 'C:\\Users\\Administrator.pm2\\logs\\payment-api-error.log',
    outputLog: 'C:\\Users\\Administrator.pm2\\logs\\payment-api-out.log'
  },
  {
    id: 4,
    name: 'website',
    displayName: 'Website',
    namespace: 'default',
    status: 'stopped',
    pid: null,
    mode: 'fork',
    instances: 1,
    cpu: 0,
    memory: 0,
    uptime: 0,
    restarts: 0,
    nodeVersion: '22.x',
    script: 'server.js',
    cwd: 'C:\\apps\\website',
    created: '15 Aug 2026, 11:20 AM',
    errorLog: 'C:\\Users\\Administrator.pm2\\logs\\website-error.log',
    outputLog: 'C:\\Users\\Administrator.pm2\\logs\\website-out.log'
  }
];

export const metrics = {
  labels: ['10:00', '10:05', '10:10', '10:15', '10:20'],
  cpu: [25, 31, 28, 42, 38],
  memory: [5.1, 5.4, 5.8, 6.1, 6.2]
};

export const logs = [
  { timestamp: '10:32:16', application: 'gymfox-api', type: 'info', message: 'Server started on port 5001' },
  { timestamp: '10:32:18', application: 'gymfox-api', type: 'info', message: 'PostgreSQL connected' },
  { timestamp: '10:33:02', application: 'gymfox-api', type: 'info', message: 'GET /api/users 200' },
  { timestamp: '10:33:04', application: 'crm-api', type: 'error', message: 'Database connection timeout' },
  { timestamp: '10:33:08', application: 'crm-api', type: 'warn', message: 'Retrying connection' },
  { timestamp: '10:33:12', application: 'crm-api', type: 'info', message: 'Database connection restored' }
];

export const server = {
  hostname: 'WIN-SERVER-01',
  operatingSystem: 'Windows Server 2022',
  architecture: 'x64',
  uptime: '18 days 6 hours',
  processor: 'Intel Xeon',
  cores: 8,
  cpuUsage: 38,
  memory: { total: 16, used: 6.2, available: 9.8, usage: 38.75 },
  storage: { drive: 'C:', total: 500, used: 327, available: 173, usage: 65.4 },
  runtime: { node: 'v22.x', pm2: '6.0.8', npm: '10.9.3', daemon: 'Running' }
};

export const activity = [
  { id: 1, time: '02 Sep 2026 10:32', application: 'GYMFox API', action: 'Restart', user: 'Admin', result: 'success', details: 'Application restarted successfully' },
  { id: 2, time: '02 Sep 2026 10:12', application: 'Payment API', action: 'Start', user: 'Admin', result: 'failed', details: 'Application failed to start' }
];

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
