const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

process.env.PM2_HOME = process.env.PM2_HOME || path.join(os.homedir(), '.pm2');
const pm2 = require('pm2');

const PORT = Number(process.env.PM2_MANAGER_PORT || 5010);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const FRONTEND_BASE_PATH = (process.env.PM2_MANAGER_BASE_PATH || '/free').replace(/\/+$/, '') || '/';
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

function runGitPull(cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, 'pull', '--ff-only'], { windowsHide: true, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      resolve((stdout || stderr || 'Already up to date.').trim());
    });
  });
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
    created: env.created_at || null,
    errorLog: env.pm_err_log_path || '',
    outputLog: env.pm_out_log_path || ''
  };
}

function getApplications() {
  return call('list').then((list) => list.map(toApplication));
}

function getApplication(id) {
  return call('describe', id).then((list) => {
    const processInfo = Array.isArray(list) ? list[0] : list;
    if (!processInfo) throw new Error(`Application ${id} was not found`);
    return toApplication(processInfo);
  });
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

async function gitPullApplication(id) {
  const application = await getApplication(id);
  if (!application.cwd || !fs.existsSync(path.join(application.cwd, '.git'))) {
    throw new Error(`${application.name} is not configured with a Git working directory`);
  }
  const output = await runGitPull(application.cwd);
  return { application: await getApplication(id), output };
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
    cpuUsage: 0,
    memory: { total: totalMemory, used: totalMemory - freeMemory, available: freeMemory, usage: ((totalMemory - freeMemory) / totalMemory) * 100 },
    storage,
    runtime: { node: process.version, pm2: version, npm: 'managed by Node.js', daemon: 'Running' }
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
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

  if (!url.pathname.startsWith('/api/')) {
    serveFrontend(request, response, url.pathname);
    return;
  }

  try {
    await connectPm2();
    const match = url.pathname.match(/^\/api\/pm2\/applications\/(\d+)(?:\/(logs|git-pull|actions\/([a-z]+)))?$/);
    if (request.method === 'GET' && url.pathname === '/api/pm2/health') { sendJson(response, 200, { ok: true, pm2Home: process.env.PM2_HOME }); return; }
    if (request.method === 'GET' && url.pathname === '/api/pm2/applications') { sendJson(response, 200, { applications: await getApplications() }); return; }
    if (request.method === 'GET' && url.pathname === '/api/pm2/server') { sendJson(response, 200, { server: await getServer() }); return; }
    if (match && request.method === 'GET' && match[2] === 'logs') { sendJson(response, 200, { logs: await getLogs(Number(match[1])) }); return; }
    if (match && request.method === 'GET' && !match[2]) { sendJson(response, 200, { application: await getApplication(Number(match[1])) }); return; }
    if (match && request.method === 'POST' && match[2] === 'git-pull') { sendJson(response, 200, await gitPullApplication(Number(match[1]))); return; }
    if (match && request.method === 'POST' && match[3]) { sendJson(response, 200, { application: await runAction(Number(match[1]), match[3]) }); return; }
    sendJson(response, 404, { error: 'Route not found' });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message || 'PM2 request failed' });
  }
}

const server = http.createServer(handle);
server.listen(PORT, '127.0.0.1', () => console.log(`PM2 Manager API listening on http://127.0.0.1:${PORT} (PM2_HOME=${process.env.PM2_HOME})`));

function shutdown() {
  if (connectionPromise) pm2.disconnect(() => process.exit(0));
  else process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
