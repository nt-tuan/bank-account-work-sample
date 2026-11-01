import path from 'node:path';

/** Cookie security mode; insecure cookies are permitted only in development. */
export enum CookieMode {
  Secure = 'secure',
  InsecureDev = 'insecure-dev',
}

export type Config = {
  port: number;
  /** Allowed browser origins for mutations (comma-separated APP_ORIGIN). */
  appOrigins: string[];
  coreDbPath: string;
  partnerDbPath: string;
  lockPath: string;
  cookieMode: CookieMode;
  demoControls: boolean;
  serveStatic: boolean;
  distDir: string;
  internalExecutionDelayMs: number;
  partnerLatencyMs: { min: number; max: number };
  partnerTimeoutMs: number;
  production: boolean;
};

const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined ? fallback : !['false', '0', 'no'].includes(v.toLowerCase());

export function loadConfig(env: NodeJS.ProcessEnv, cwd = process.cwd()): Config {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT ?? 8787);
  const dataDir = path.resolve(cwd, env.DATA_DIR ?? 'data');
  const cookieMode =
    (env.COOKIE_MODE as Config['cookieMode'] | undefined) ??
    (production ? CookieMode.Secure : CookieMode.InsecureDev);
  if (production && cookieMode !== CookieMode.Secure) {
    // Spec §9: production configuration must reject the insecure development cookie mode.
    throw new Error('COOKIE_MODE=insecure-dev is not allowed when NODE_ENV=production');
  }
  return {
    port,
    appOrigins: (env.APP_ORIGIN ?? `http://127.0.0.1:${port},http://localhost:${port}`)
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    coreDbPath: path.resolve(cwd, env.CORE_DB_PATH ?? path.join(dataDir, 'core.sqlite')),
    partnerDbPath: path.resolve(
      cwd,
      env.PARTNER_DB_PATH ?? path.join(dataDir, 'partner-network.sqlite'),
    ),
    lockPath: path.resolve(cwd, env.LOCK_PATH ?? path.join(dataDir, 'server.lock')),
    cookieMode,
    demoControls: production ? false : bool(env.DEMO_CONTROLS, true),
    serveStatic: bool(env.SERVE_STATIC, false),
    distDir: path.resolve(cwd, 'dist'),
    internalExecutionDelayMs: Number(env.EXECUTION_DELAY_MS ?? 1_500),
    partnerLatencyMs: {
      min: Number(env.PARTNER_LATENCY_MIN_MS ?? 100),
      max: Number(env.PARTNER_LATENCY_MAX_MS ?? 300),
    },
    partnerTimeoutMs: Number(env.PARTNER_TIMEOUT_MS ?? 5_000),
    production,
  };
}
