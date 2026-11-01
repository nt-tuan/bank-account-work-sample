import fs from 'node:fs';
import path from 'node:path';

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** PID of a live server holding the lock, or null (stale locks are ignored). */
export function lockHolder(lockPath: string): number | null {
  try {
    const pid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 && alive(pid) ? pid : null;
  } catch {
    return null;
  }
}

/** The CLI reset refuses to run while this lock is held (spec §12, Reset). */
export function acquireLock(lockPath: string): () => void {
  const holder = lockHolder(lockPath);
  if (holder && holder !== process.pid)
    throw new Error(`Another server (PID ${holder}) is already using ${path.dirname(lockPath)}`);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, String(process.pid));
  return () => {
    try {
      if (lockHolder(lockPath) === process.pid) fs.unlinkSync(lockPath);
    } catch {
      /* already gone */
    }
  };
}
