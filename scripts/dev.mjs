import { spawn } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
let port = process.env.PORT || '3000';
let host = '0.0.0.0';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if ((arg === '--port' || arg === '-p') && args[i + 1]) {
    port = args[i + 1];
    i += 1;
  } else if (arg.startsWith('--port=')) {
    port = arg.slice('--port='.length);
  } else if ((arg === '--host' || arg === '--hostname' || arg === '-H') && args[i + 1]) {
    host = args[i + 1];
    i += 1;
  } else if (arg.startsWith('--host=')) {
    host = arg.slice('--host='.length);
  } else if (arg.startsWith('--hostname=')) {
    host = arg.slice('--hostname='.length);
  }
}

const nextBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'next');
const child = spawn(nextBin, ['dev', '-p', port, '-H', host], {
  stdio: 'inherit',
  env: process.env,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
