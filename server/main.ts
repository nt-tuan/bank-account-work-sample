import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { loadConfig } from './config.ts';
import { createDemoBankServer } from './app.ts';
import { acquireLock } from './lock.ts';

const config = loadConfig(process.env);
fs.mkdirSync(path.dirname(config.coreDbPath), { recursive: true });
fs.mkdirSync(path.dirname(config.partnerDbPath), { recursive: true });
const releaseLock = acquireLock(config.lockPath);

const log = (line: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), ...line }));
const server = createDemoBankServer(config, { log });

const root = new Hono();
root.route('/', server.app);
if (config.serveStatic) {
  if (!fs.existsSync(path.join(config.distDir, 'index.html'))) {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }
  const relDist = path.relative(process.cwd(), config.distDir) || '.';
  const csp =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
  root.use('*', async (c, next) => {
    await next();
    if (c.res.headers.get('content-type')?.includes('text/html'))
      c.header('Content-Security-Policy', csp);
  });
  root.use('/assets/*', serveStatic({ root: relDist }));
  root.use('/favicon.svg', serveStatic({ root: relDist }));
  // SPA fallback: every non-API path renders the app; the router handles direct links and refresh.
  root.get('*', serveStatic({ root: relDist, rewriteRequestPath: () => '/index.html' }));
}

server.processor.start();
const http = serve({ fetch: root.fetch, hostname: '127.0.0.1', port: config.port }, (info) => {
  log({
    msg: `Demo Banking API listening on http://127.0.0.1:${info.port}`,
    appOrigins: config.appOrigins,
    demoControls: config.demoControls,
  });
});

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  http.close();
  await server.close();
  releaseLock();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
