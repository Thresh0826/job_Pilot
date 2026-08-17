/**
 * 为 Electron 运行时准备 better-sqlite3 的预编译二进制。
 *
 * 背景：better-sqlite3 通过 prebuild-install 发布预编译产物，但其
 * package.json 仅在 devDependencies 中声明 prebuild-install，导致
 * electron-builder / @electron/rebuild 无法识别 prebuild 路径，转而尝试
 * node-gyp 源码编译（在无 MSVC 的机器上会失败）。
 *
 * 本脚本直接调用 prebuild-install，从 GitHub Release 下载与当前 Electron
 * ABI 匹配的预编译二进制，避免任何源码编译。幂等，可重复执行。
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const electronPkgPath = path.join(root, 'node_modules', 'electron', 'package.json');
const moduleDir = path.join(root, 'node_modules', 'better-sqlite3');
const prebuildBin = path.join(root, 'node_modules', 'prebuild-install', 'bin.js');

function skip(message) {
  console.log(`[setup-native] ${message}`);
  process.exit(0);
}

if (!fs.existsSync(electronPkgPath)) {
  skip('electron not installed yet, nothing to do.');
}
if (!fs.existsSync(moduleDir)) {
  skip('better-sqlite3 not installed yet, nothing to do.');
}
if (!fs.existsSync(prebuildBin)) {
  console.error('[setup-native] prebuild-install binary not found. Did npm install complete?');
  process.exit(1);
}

const electronVersion = require(electronPkgPath).version;
console.log(`[setup-native] fetching better-sqlite3 prebuild for electron@${electronVersion} ...`);

const result = spawnSync(
  process.execPath,
  [
    prebuildBin,
    '--runtime=electron',
    `--target=${electronVersion}`,
    '--arch=x64',
    '--platform=win32',
    '--verbose',
  ],
  { cwd: moduleDir, stdio: 'inherit' },
);

if (result.error) {
  console.error('[setup-native] failed to spawn prebuild-install:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
