import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../../database/database';

type Level = 'INFO' | 'WARN' | 'ERROR';

function write(level: Level, scope: string, message: string): void {
  const line = `${new Date().toISOString()} [${level}] [${scope}] ${message}`;

  try {
    const dir = path.join(getDataDir(), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'jobpilot.log'), `${line}\n`, 'utf8');
  } catch {
    // 日志写入失败不影响主流程。
  }

  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}

/** 轻量文件日志（写入 <数据目录>/logs/jobpilot.log，同时输出到控制台）。 */
export const logger = {
  info: (scope: string, message: string) => write('INFO', scope, message),
  warn: (scope: string, message: string) => write('WARN', scope, message),
  error: (scope: string, message: string) => write('ERROR', scope, message),
};
