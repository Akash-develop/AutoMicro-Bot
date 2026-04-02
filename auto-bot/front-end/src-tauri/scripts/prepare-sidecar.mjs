import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const extension = process.platform === 'win32' ? '.exe' : '';
const targetTriple = execSync('rustc --print host-tuple').toString().trim();
if (!targetTriple) {
  console.error('Failed to determine platform target triple');
  process.exit(1);
}

// Resolve relative to src-tauri/
const srcTauriDir = path.resolve(import.meta.dirname, '..');
const backendBinarySource = path.resolve(srcTauriDir, '../../back-end/dist/automicro-backend' + extension);
const binariesDir = path.resolve(srcTauriDir, 'binaries');
const sidecarDest = path.resolve(binariesDir, `automicro-backend-${targetTriple}${extension}`);

if (!fs.existsSync(backendBinarySource)) {
  console.error(`Backend binary not found at: ${backendBinarySource}`);
  console.error('Build the backend binary first (or place it there) before building the Tauri app.');
  process.exit(1);
}

fs.mkdirSync(binariesDir, { recursive: true });
fs.copyFileSync(backendBinarySource, sidecarDest);

// Ensure executable bit on unix-like platforms
if (process.platform !== 'win32') {
  fs.chmodSync(sidecarDest, 0o755);
}

console.log(`Prepared sidecar: ${sidecarDest}`);

