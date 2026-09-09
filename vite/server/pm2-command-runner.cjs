const { spawn } = require('node:child_process');

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('PM2 command runner requires a command');
  process.exit(1);
}

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
  shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
});

child.on('error', (error) => {
  console.error(`Unable to start ${command}: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
