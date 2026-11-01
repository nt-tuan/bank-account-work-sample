/** `npm run demo:reset` — restores both stores to fresh fixtures. Refuses while the server runs (spec §12). */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../server/config.ts';
import { lockHolder } from '../server/lock.ts';
import { createDemoBankServer } from '../server/app.ts';
import { reconcile } from '../server/persistence/schema.ts';

const config = loadConfig(process.env);
const holder = lockHolder(config.lockPath);
if (holder) {
  console.error(
    `The server is running (PID ${holder}). Stop it first (Ctrl+C in the terminal running "npm run dev" or "npm start"), ` +
      'or use Demo controls → Reset all data in the app.',
  );
  process.exit(1);
}
fs.mkdirSync(path.dirname(config.coreDbPath), { recursive: true });
const server = createDemoBankServer(config);
await server.reset();
await server.processor.stop();
const problems = reconcile(server.core);
await server.close();
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Demo data restored to the initial fixtures (core and partner stores).');
