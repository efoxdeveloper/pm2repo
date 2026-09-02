const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

process.env.PM2_HOME = process.env.PM2_HOME || path.join(os.homedir(), '.pm2');
const pm2 = require('pm2');

const PORT = Number(process.env.PM2_MANAGER_PORT || 5010);
const HOST = process.env.PM2_MANAGER_HOST || '127.0.0.1';
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

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body is too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Request body must be valid JSON'));
      }
    });
    request.on('error', reject);
  });
}

function getApplicationOptions(payload) {
  const name = String(payload.name || '').trim();
  const cwd = path.resolve(String(payload.cwd || '').trim());
  let script = String(payload.script || '').trim();
  let detectedArgs = '';
  if (!name || !payload.cwd) throw new Error('Application name and working directory are required');
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Application working directory does not exist');

  if (!script) {
    const packagePath = path.join(cwd, 'package.json');
    if (!fs.existsSync(packagePath)) throw new Error('Enter a script or choose a directory containing package.json');
    let packageJson;
    try {
      packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    } catch {
      throw new Error(`Unable to read ${packagePath}`);
    }
    if (!packageJson.scripts?.start) throw new Error('No start script found in package.json');
    if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
      script = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
      detectedArgs = 'start';
    } else if (fs.existsSync(path.join(cwd, 'yarn.lock'))) {
      script = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
      detectedArgs = 'start';
    } else {
      script = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      detectedArgs = 'run start';
    }
  }

  const scriptPath = path.resolve(cwd, script);
  const isCommand = ['npm', 'npm.cmd', 'yarn', 'yarn.cmd', 'pnpm', 'pnpm.cmd'].includes(script.toLowerCase());
  if (!isCommand && (!fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile())) {
    throw new Error(`Application script does not exist: ${script}`);
  }

  const options = {
    name,
    script: isCommand ? script : scriptPath,
    cwd,
    interpreter: isCommand ? 'none' : payload.interpreter && payload.interpreter !== 'none' ? payload.interpreter : 'none',
    exec_mode: payload.mode === 'cluster' ? 'cluster' : 'fork',
    instances: Math.max(1, Number(payload.instances) || 1),
    autorestart: payload.autorestart !== false,
    watch: payload.watch === true
  };
  if (payload.args || detectedArgs) options.args = String(payload.args || detectedArgs);
  if (payload.nodeArgs) options.node_args = String(payload.nodeArgs);
  if (payload.maxMemoryRestart) options.max_memory_restart = String(payload.maxMemoryRestart);
  if (payload.restartDelay) options.restart_delay = Math.max(0, Number(payload.restartDelay) || 0);
  if (payload.env && typeof payload.env === 'object' && !Array.isArray(payload.env)) options.env = { ...payload.env };
  return options;
}

async function createApplication(payload) {
  const options = getApplicationOptions(payload);
  await call('start', options);
  return getApplicationByName(options.name);
}

function runCommand(command, args, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 15 * 60 * 1000, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function runGitPull(cwd) {
  return runCommand('git', ['-C', cwd, 'pull', '--ff-only'], cwd, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).then(({ stdout, stderr }) => stdout || stderr || 'Already up to date.');
}

async function getGitRoot(cwd) {
  if (!cwd || !fs.existsSync(cwd)) throw new Error('Application working directory does not exist');
  try {
    const result = await runCommand('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], cwd, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return result.stdout.trim();
  } catch {
    throw new Error(`${cwd} is not inside a Git working directory`);
  }
}

function getBuildCommand(cwd) {
  const packagePath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packagePath)) throw new Error(`${cwd} does not contain a package.json file`);

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    throw new Error(`Unable to read ${packagePath}`);
  }
  if (!packageJson.scripts?.build) throw new Error(`${packageJson.name || 'Application'} does not define a build script`);

  const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return { command: corepack, args: ['pnpm', 'run', 'build'], label: 'pnpm run build' };
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return { command: corepack, args: ['yarn', 'build'], label: 'yarn build' };
  return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', 'build'], label: 'npm run build' };
}

async function runBuild(cwd) {
  const build = getBuildCommand(cwd);
  const result = await runCommand(build.command, build.args, cwd, { env: { ...process.env, CI: 'false' } });
  return { ...build, output: result.stdout || result.stderr || 'Build completed successfully.' };
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

function getApplicationByName(name) {
  return call('list').then((list) => {
    const processInfo = list.find((item) => item.name === name);
    if (!processInfo) throw new Error(`Application ${name} was not found after starting`);
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

async function deployApplication(id) {
  const application = await getApplication(id);
  const gitRoot = await getGitRoot(application.cwd);
  const pullOutput = await runGitPull(gitRoot);
  const build = await runBuild(application.cwd);
  await call('reload', id);
  return {
    application: await getApplication(id).catch(() => null),
    buildCommand: build.label,
    buildOutput: build.output,
    pullOutput,
    output: `Pulled latest changes, ran ${build.label}, and reloaded PM2.`
  };
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
    if (request.method === 'POST' && url.pathname === '/api/pm2/applications') {
      const payload = await readJsonBody(request);
      sendJson(response, 201, { application: await createApplication(payload) });
      return;
    }
    const match = url.pathname.match(/^\/api\/pm2\/applications\/(\d+)(?:\/(logs|deploy|actions\/([a-z]+)))?$/);
    if (request.method === 'GET' && url.pathname === '/api/pm2/health') { sendJson(response, 200, { ok: true, pm2Home: process.env.PM2_HOME }); return; }
    if (request.method === 'GET' && url.pathname === '/api/pm2/applications') { sendJson(response, 200, { applications: await getApplications() }); return; }
    if (request.method === 'GET' && url.pathname === '/api/pm2/server') { sendJson(response, 200, { server: await getServer() }); return; }
    if (match && request.method === 'GET' && match[2] === 'logs') { sendJson(response, 200, { logs: await getLogs(Number(match[1])) }); return; }
    if (match && request.method === 'GET' && !match[2]) { sendJson(response, 200, { application: await getApplication(Number(match[1])) }); return; }
    if (match && request.method === 'POST' && match[2] === 'deploy') { sendJson(response, 200, await deployApplication(Number(match[1]))); return; }
    if (match && request.method === 'POST' && match[3]) { sendJson(response, 200, { application: await runAction(Number(match[1]), match[3]) }); return; }
    sendJson(response, 404, { error: 'Route not found' });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message || 'PM2 request failed' });
  }
}

const server = http.createServer(handle);
server.listen(PORT, HOST, () => console.log(`PM2 Manager API listening on http://${HOST}:${PORT} (PM2_HOME=${process.env.PM2_HOME})`));

function shutdown() {
  if (connectionPromise) pm2.disconnect(() => process.exit(0));
  else process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
