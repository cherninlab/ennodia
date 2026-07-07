const { spawn } = require('child_process');
const path = require('path');

const entryPoint = path.join(__dirname, '..', 'src', 'cli.ts');
const cmd = process.platform === 'win32' ? 'bun.exe' : 'bun';

const child = spawn(cmd, [entryPoint], {
  stdio: ['pipe', 'pipe', 'pipe']
});

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

child.on('error', (err) => {
  console.error(`Failed to start Ennodia via Bun: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (code !== null) {
    process.exit(code);
  } else if (signal) {
    process.exit(1);
  }
});
