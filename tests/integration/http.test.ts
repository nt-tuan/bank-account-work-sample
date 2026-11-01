import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createDemoBankServer } from '../../server/app.ts';
import { loadConfig } from '../../server/config.ts';
import { FakeClock } from '../../server/clock.ts';
import { activityDetailSchema, transferSchema } from '../../shared/schemas/api.ts';
import { reconcile } from '../../server/persistence/schema.ts';
import { ANCHOR, FAST_TIMING, tempDir } from '../helpers.ts';

const ORIGIN = 'http://127.0.0.1:5173';
const servers: { close(): Promise<void> }[] = [];
afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

function makeServer(dir = tempDir(), clock = new FakeClock(ANCHOR)) {
  const config = loadConfig(
    {
      DATA_DIR: dir,
      APP_ORIGIN: ORIGIN,
      PARTNER_LATENCY_MIN_MS: '0',
      PARTNER_LATENCY_MAX_MS: '1',
      EXECUTION_DELAY_MS: '200',
    },
    dir,
  );
  const server = createDemoBankServer(config, { clock, timing: FAST_TIMING });
  servers.push(server);
  return { server, clock, dir, config };
}

/** A tiny cookie-jar client over app.request. */
function client(app: ReturnType<typeof makeServer>['server']['app']) {
  let cookie = '';
  let csrf = '';
  const call = async (
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const h: Record<string, string> = { Origin: ORIGIN, ...headers };
    if (cookie) h.Cookie = cookie;
    if (method !== 'GET' && csrf && !('X-CSRF-Token' in headers)) h['X-CSRF-Token'] = csrf;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await app.request(url, {
      method,
      headers: h,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const set = res.headers.get('set-cookie');
    if (set) {
      const [pair] = set.split(';');
      cookie = pair!.endsWith('=') ? '' : pair!;
    }
    const json = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (json && typeof json === 'object' && 'csrfToken' in json)
      csrf = (json as { csrfToken: string }).csrfToken;
    return {
      res,
      json: json as Record<string, unknown> & {
        error?: { code: string; fieldErrors?: Record<string, string> };
      },
    };
  };
  return {
    call,
    get cookie() {
      return cookie;
    },
    set cookie(v: string) {
      cookie = v;
    },
    async login(username = 'kenji') {
      await call('GET', '/api/session');
      return call('POST', '/api/session/login', { username, password: 'demo-pass-2026' });
    },
  };
}

const transferBody = (amount = '1000') => ({
  sourceAccountId: 'acc_everyday',
  destination: { kind: 'own', accountId: 'acc_savings' },
  amount,
});

describe('sessions and authorization (AC-14)', () => {
  it('issues an HttpOnly SameSite cookie, rotates it at login and rejects the pre-login cookie afterwards', async () => {
    const { server } = makeServer();
    const c = client(server.app);
    const first = await c.call('GET', '/api/session');
    const setCookie = first.res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/^demo-session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const preLogin = c.cookie;
    const login = await c.call('POST', '/api/session/login', {
      username: 'kenji',
      password: 'demo-pass-2026',
    });
    expect(login.res.status).toBe(200);
    expect(login.json.authenticated).toBe(true);
    expect(c.cookie).not.toBe(preLogin);
    const accounts = await c.call('GET', '/api/accounts');
    expect(accounts.res.status).toBe(200);
    expect(accounts.res.headers.get('cache-control')).toBe('no-store');
    c.cookie = preLogin;
    expect((await c.call('GET', '/api/accounts')).res.status).toBe(401);
  });

  it('uses a generic error for bad credentials', async () => {
    const c = client(makeServer().server.app);
    await c.call('GET', '/api/session');
    for (const body of [
      { username: 'kenji', password: 'wrong' },
      { username: 'nobody', password: 'wrong' },
    ]) {
      const r = await c.call('POST', '/api/session/login', body);
      expect(r.res.status).toBe(401);
      expect(r.json.error?.code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('rejects missing CSRF tokens and foreign origins on every mutation, including login', async () => {
    const c = client(makeServer().server.app);
    await c.call('GET', '/api/session');
    expect(
      (
        await c.call(
          'POST',
          '/api/session/login',
          { username: 'kenji', password: 'demo-pass-2026' },
          { 'X-CSRF-Token': 'nope' },
        )
      ).json.error?.code,
    ).toBe('CSRF_INVALID');
    await c.login();
    expect(
      (
        await c.call('POST', '/api/transfers', transferBody(), {
          'Idempotency-Key': randomUUID(),
          Origin: 'https://evil.example',
        })
      ).res.status,
    ).toBe(403);
    expect(
      (
        await c.call('POST', '/api/transfers', transferBody(), {
          'Idempotency-Key': randomUUID(),
          'X-CSRF-Token': '',
        })
      ).res.status,
    ).toBe(403);
  });

  it('reports an ended session as 401 SESSION_EXPIRED on mutations, but still rejects foreign origins first', async () => {
    const { server } = makeServer();
    const c = client(server.app);
    await c.login();
    expect((await c.call('POST', '/api/demo/expire-session')).res.status).toBe(204);
    const order = await c.call('POST', '/api/transfers', transferBody(), {
      'Idempotency-Key': randomUUID(),
    });
    expect(order.res.status).toBe(401);
    expect(order.json.error?.code).toBe('SESSION_EXPIRED');
    expect((await c.call('POST', '/api/session/logout')).json.error?.code).toBe('SESSION_EXPIRED');
    const foreign = await c.call('POST', '/api/transfers', transferBody(), {
      'Idempotency-Key': randomUUID(),
      Origin: 'https://evil.example',
    });
    expect(foreign.res.status).toBe(403);
    expect(foreign.json.error?.code).toBe('CSRF_INVALID');
  });

  it("returns 404 for other customers' and closed resources without revealing existence", async () => {
    const { server } = makeServer();
    const c = client(server.app);
    await c.login();
    for (const url of [
      '/api/accounts/acc_misaki',
      '/api/accounts/acc_old_checking',
      '/api/accounts/does-not-exist',
    ]) {
      const r = await c.call('GET', url);
      expect(r.res.status).toBe(404);
      expect(r.json.error?.code).toBe('NOT_FOUND');
    }
    const misakiTransfer = server.core.read((q) =>
      q.get<{ id: string }>("SELECT id FROM transfers WHERE customer_id = 'cus_ken'"),
    )!;
    expect((await c.call('GET', `/api/transfers/${misakiTransfer.id}`)).res.status).toBe(404);
  });

  it('revokes the session at logout and at absolute expiry', async () => {
    const { server, clock } = makeServer();
    const c = client(server.app);
    await c.login();
    const cookie = c.cookie;
    expect((await c.call('POST', '/api/session/logout')).res.status).toBe(204);
    c.cookie = cookie;
    expect((await c.call('GET', '/api/accounts')).res.status).toBe(401);

    const d = client(server.app);
    await d.login();
    clock.advance(8 * 3600_000 - 1);
    expect((await d.call('GET', '/api/accounts')).res.status).toBe(200);
    clock.advance(1);
    expect((await d.call('GET', '/api/accounts')).res.status).toBe(401);
  });
});

describe('transfer orders over HTTP (AC-05, AC-08, AC-09)', () => {
  it('validates the idempotency key and request, then creates and replays', async () => {
    const { server } = makeServer();
    const c = client(server.app);
    await c.login();
    expect((await c.call('POST', '/api/transfers', transferBody())).json.error?.code).toBe(
      'IDEMPOTENCY_KEY_MISSING',
    );
    expect(
      (await c.call('POST', '/api/transfers', transferBody(), { 'Idempotency-Key': 'abc' })).json
        .error?.code,
    ).toBe('IDEMPOTENCY_KEY_INVALID');
    const bad = await c.call(
      'POST',
      '/api/transfers',
      { ...transferBody('1,000'), reference: 'café' },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(bad.res.status).toBe(400);
    expect(Object.keys(bad.json.error?.fieldErrors ?? {}).sort()).toEqual(['amount', 'reference']);

    const k = randomUUID();
    const created = await c.call('POST', '/api/transfers', transferBody(), {
      'Idempotency-Key': k,
    });
    expect(created.res.status).toBe(202);
    expect(created.res.headers.get('location')).toBe(`/api/transfers/${created.json.id}`);
    const replay = await c.call('POST', '/api/transfers', transferBody(), { 'Idempotency-Key': k });
    expect(replay.res.status).toBe(202);
    expect(replay.res.headers.get('idempotent-replayed')).toBe('true');
    expect(replay.json).toEqual(created.json);
    const order = transferSchema.parse(created.json);
    expect(order.sourceActivityId).toMatch(/^ACT-/);
    const activity = activityDetailSchema.parse(
      (await c.call('GET', `/api/activity/${order.sourceActivityId}`)).json,
    );
    expect(activity.status).toBe('pending');
    expect(activity.transfer?.details).toEqual(order);
  });

  it('keeps both own-account entries consistent with the embedded order after execution', async () => {
    const { server, clock } = makeServer();
    const c = client(server.app);
    await c.login();
    const order = transferSchema.parse(
      (await c.call('POST', '/api/transfers', transferBody(), { 'Idempotency-Key': randomUUID() }))
        .json,
    );
    clock.advance(1_000);
    await server.processor.drain();
    const rows = server.core.read((q) =>
      q.all<{ id: string }>('SELECT id FROM activity WHERE transfer_id = ?', [order.id]),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const activity = activityDetailSchema.parse(
        (await c.call('GET', `/api/activity/${row.id}`)).json,
      );
      expect(activity.status).toBe('posted');
      expect(activity.transfer?.details?.status).toBe('completed');
      expect(activity.transfer?.details?.sourceActivityId).toBe(order.sourceActivityId);
    }
  });

  it('redacts order details from incoming transfers owned by another customer', async () => {
    const { server } = makeServer();
    const c = client(server.app);
    await c.login();
    const row = server.core.read((q) =>
      q.get<{ id: string }>(
        "SELECT a.id FROM activity a JOIN accounts acc ON acc.id = a.account_id JOIN transfers t ON t.id = a.transfer_id WHERE acc.customer_id = 'cus_kenji' AND t.customer_id <> acc.customer_id LIMIT 1",
      ),
    )!;
    expect(row).toBeDefined();
    const activity = activityDetailSchema.parse(
      (await c.call('GET', `/api/activity/${row.id}`)).json,
    );
    expect(activity.transfer).toMatchObject({ id: null, status: null, details: null });
    expect(activity.transferId).toBeNull();
    expect(activity.transferStatus).toBeNull();
    expect(activity.transferDelayedSince).toBeNull();
    expect(activity.transfer?.counterparty.name).not.toBe('');
  });

  it('rejects malformed list queries', async () => {
    const c = client(makeServer().server.app);
    await c.login();
    expect((await c.call('GET', '/api/activity?sort=sideways')).res.status).toBe(400);
    expect((await c.call('GET', '/api/activity?unknown=1')).res.status).toBe(400);
    expect((await c.call('GET', '/api/activity?from=2026-10-05&to=2026-10-01')).res.status).toBe(
      400,
    );
  });

  it('returns 429 with Retry-After once the lookup limit is reached (AC-11)', async () => {
    const c = client(makeServer().server.app);
    await c.login();
    for (let i = 0; i < 10; i++)
      expect(
        (
          await c.call('POST', '/api/recipients/lookup', {
            bankId: 'bank_host',
            accountNumber: '5815810',
          })
        ).res.status,
      ).toBe(200);
    const limited = await c.call('POST', '/api/recipients/lookup', {
      bankId: 'bank_host',
      accountNumber: '5815810',
    });
    expect(limited.res.status).toBe(429);
    expect(Number(limited.res.headers.get('retry-after'))).toBeGreaterThan(0);
    // Re-login does not reset the per-customer counter.
    await c.login();
    expect(
      (
        await c.call('POST', '/api/recipients/lookup', {
          bankId: 'bank_host',
          accountNumber: '5815810',
        })
      ).res.status,
    ).toBe(429);
  });

  it('looks up partner names through the gateway and reports unavailable inquiry banks', async () => {
    const c = client(makeServer().server.app);
    await c.login();
    const found = await c.call('POST', '/api/recipients/lookup', {
      bankId: 'bank_minato',
      accountNumber: '4012733',
    });
    expect(found.json).toMatchObject({
      outcome: 'found',
      holderName: 'SUZUKI HARUTO',
      maskedNumber: '•••2733',
    });
    const frozen = await c.call('POST', '/api/recipients/lookup', {
      bankId: 'bank_minato',
      accountNumber: '4019118',
    });
    expect(frozen.json).toMatchObject({ outcome: 'cannot_receive', holderName: null });
    const kita = await c.call('POST', '/api/recipients/lookup', {
      bankId: 'bank_kita',
      accountNumber: '2700418',
    });
    expect(kita.json.outcome).toBe('unavailable');
  });

  it('reserves lookup quota before partner calls so concurrent requests cannot exceed the limit', async () => {
    const { server } = makeServer();
    const c = client(server.app);
    await c.login();
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        c.call('POST', '/api/recipients/lookup', {
          bankId: 'bank_minato',
          accountNumber: '4012733',
        }),
      ),
    );
    expect(results.filter(({ res }) => res.status === 200)).toHaveLength(10);
    expect(results.filter(({ res }) => res.status === 429)).toHaveLength(2);
    for (const { res } of results.filter(({ res }) => res.status === 429))
      expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    // Creating an order restores the customer's quota, including in-flight reservations.
    await c.call('POST', '/api/transfers', transferBody(), { 'Idempotency-Key': randomUUID() });
    expect(
      (
        await c.call('POST', '/api/recipients/lookup', {
          bankId: 'bank_host',
          accountNumber: '5815810',
        })
      ).res.status,
    ).toBe(200);
  });
});

describe('demo transfer scenarios', () => {
  it('keeps recipient closure pending for own accounts, then fails the internal transfer and releases funds', async () => {
    const { server, clock } = makeServer();
    const c = client(server.app);
    await c.login();
    const scenario = 'destination_closed_during_processing';
    await c.call('POST', '/api/demo/scenario', { scenario });

    for (const destination of [
      transferBody().destination,
      {
        kind: 'recipient',
        bankId: 'bank_host',
        accountNumber: '1047302',
        recipientName: 'WATANABE KENJI',
        recipientNameSource: 'lookup',
      },
    ]) {
      const created = await c.call(
        'POST',
        '/api/transfers',
        { ...transferBody(), destination },
        {
          'Idempotency-Key': randomUUID(),
        },
      );
      expect(created.res.status).toBe(202);
      expect((await c.call('GET', '/api/demo/catalog')).json.pendingScenario).toBe(scenario);
      expect(
        server.core.read((q) =>
          q.get<{ demo_scenario: string | null }>(
            'SELECT demo_scenario FROM transfers WHERE id = ?',
            [String(created.json.id)],
          ),
        )!.demo_scenario,
      ).toBeNull();
      clock.advance(1_000);
      await server.processor.drain();
      expect((await c.call('GET', `/api/transfers/${created.json.id}`)).json.status).toBe(
        'completed',
      );
    }

    const balances = () =>
      server.core.read((q) =>
        q.get<{ current: number; held: number }>(
          "SELECT current_balance_minor AS current, held_minor AS held FROM accounts WHERE id = 'acc_everyday'",
        ),
      );
    const before = balances();
    const created = await c.call(
      'POST',
      '/api/transfers',
      {
        ...transferBody(),
        destination: {
          kind: 'recipient',
          bankId: 'bank_host',
          accountNumber: '5815810',
          recipientName: 'TANAKA MISAKI',
          recipientNameSource: 'lookup',
        },
      },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(created.res.status).toBe(202);
    expect(created.json.status).toBe('processing');
    expect((await c.call('GET', '/api/demo/catalog')).json.pendingScenario).toBeNull();
    clock.advance(1_000);
    await server.processor.drain();
    expect((await c.call('GET', `/api/transfers/${created.json.id}`)).json).toMatchObject({
      status: 'failed',
      failureCode: 'DESTINATION_UNAVAILABLE',
    });
    expect(balances()).toEqual(before);
    const activity = activityDetailSchema.parse(
      (await c.call('GET', `/api/activity/${created.json.sourceActivityId}`)).json,
    );
    expect(activity.status).toBe('cancelled');
    expect(activity.transfer?.details?.status).toBe('failed');
    expect(reconcile(server.core)).toEqual([]);
  });

  it('fails an external transfer when recipient closure is selected after lookup and releases funds', async () => {
    const { server, clock } = makeServer();
    const c = client(server.app);
    await c.login();
    const destination = {
      kind: 'recipient',
      bankId: 'bank_sakura',
      accountNumber: '3107777',
      recipientName: 'TAKAHASHI-MONTGOMERY ELIZABETH',
      recipientNameSource: 'lookup',
    };
    expect(
      (
        await c.call('POST', '/api/recipients/lookup', {
          bankId: destination.bankId,
          accountNumber: destination.accountNumber,
        })
      ).json.outcome,
    ).toBe('found');
    const accountsBefore = (await c.call('GET', '/api/accounts')).json;
    await c.call('POST', '/api/demo/scenario', {
      scenario: 'destination_closed_during_processing',
    });
    const created = await c.call(
      'POST',
      '/api/transfers',
      {
        ...transferBody(),
        destination,
      },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(created.res.status).toBe(202);
    expect(created.json).toMatchObject({ destinationKind: 'external', status: 'processing' });
    expect((await c.call('GET', '/api/demo/catalog')).json.pendingScenario).toBeNull();
    clock.advance(1_000);
    await server.processor.drain();
    expect((await c.call('GET', `/api/transfers/${created.json.id}`)).json).toMatchObject({
      status: 'failed',
      failureCode: 'DESTINATION_REJECTED',
    });
    const activity = activityDetailSchema.parse(
      (await c.call('GET', `/api/activity/${created.json.sourceActivityId}`)).json,
    );
    expect(activity.status).toBe('cancelled');
    expect(activity.transfer?.details?.status).toBe('failed');
    expect((await c.call('GET', '/api/accounts')).json).toEqual(accountsBefore);
    expect(reconcile(server.core)).toEqual([]);
  });

  it('keeps a newly selected scenario pending when replaying an existing order', async () => {
    const { server } = makeServer();
    const c = client(server.app);
    await c.login();
    const idempotencyKey = randomUUID();
    const headers = { 'Idempotency-Key': idempotencyKey };
    const created = await c.call('POST', '/api/transfers', transferBody(), headers);
    await c.call('POST', '/api/demo/scenario', { scenario: 'execution_failure' });
    const replay = await c.call('POST', '/api/transfers', transferBody(), headers);
    expect(replay.json).toEqual(created.json);
    expect(replay.res.headers.get('idempotent-replayed')).toBe('true');
    expect((await c.call('GET', '/api/demo/catalog')).json.pendingScenario).toBe(
      'execution_failure',
    );
  });
});

describe('persistence, restart and reset (AC-10, AC-15)', () => {
  it('resumes processing after a restart without double posting', async () => {
    const dir = tempDir();
    const clock = new FakeClock(ANCHOR);
    const first = makeServer(dir, clock);
    const c = client(first.server.app);
    await c.login();
    const created = await c.call('POST', '/api/transfers', transferBody('3000'), {
      'Idempotency-Key': randomUUID(),
    });
    expect(created.json.status).toBe('processing');
    await first.server.close();
    servers.splice(servers.indexOf(first.server), 1);

    const second = makeServer(dir, clock); // same files: no reseed, sessions gone
    const after = client(second.server.app);
    after.cookie = c.cookie;
    expect((await after.call('GET', '/api/accounts')).res.status).toBe(401);
    clock.advance(1_000);
    await second.server.processor.drain();
    await second.server.processor.drain();
    const status = second.server.core.read((q) =>
      q.get<{ status: string }>('SELECT status FROM transfers WHERE id = ?', [
        String(created.json.id),
      ]),
    )!;
    expect(status.status).toBe('completed');
    expect(reconcile(second.server.core)).toEqual([]);
    const credits = second.server.core.read((q) =>
      q.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM activity WHERE transfer_id = ? AND direction = 'credit'",
        [String(created.json.id)],
      ),
    )!;
    expect(credits.n).toBe(1);
  });

  it('completes an external transfer through the real partner module', async () => {
    const { server, clock } = makeServer();
    const c = client(server.app);
    await c.login();
    const created = await c.call(
      'POST',
      '/api/transfers',
      {
        sourceAccountId: 'acc_everyday',
        destination: {
          kind: 'recipient',
          bankId: 'bank_minato',
          accountNumber: '4012733',
          recipientName: 'SUZUKI HARUTO',
          recipientNameSource: 'lookup',
        },
        amount: '1500',
      },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(created.json.destinationKind).toBe('external');
    clock.advance(10);
    await server.processor.drain();
    expect((await c.call('GET', `/api/transfers/${created.json.id}`)).json.status).toBe(
      'completed',
    );
  });

  it('demo reset restores fixtures and revokes every session', async () => {
    const { server } = makeServer();
    const c = client(server.app);
    await c.login();
    await c.call('POST', '/api/transfers', transferBody('1000'), {
      'Idempotency-Key': randomUUID(),
    });
    const before = server.core.read((q) =>
      q.get<{ n: number }>('SELECT COUNT(*) AS n FROM transfers'),
    )!.n;
    expect((await c.call('POST', '/api/demo/reset', { confirm: true })).res.status).toBe(204);
    await server.processor.stop();
    expect(
      server.core.read((q) => q.get<{ n: number }>('SELECT COUNT(*) AS n FROM transfers'))!.n,
    ).toBe(before - 1);
    expect((await c.call('GET', '/api/accounts')).res.status).toBe(401);
  });

  it('applies a demo read failure once', async () => {
    const c = client(makeServer().server.app);
    await c.login();
    await c.call('POST', '/api/demo/scenario', { scenario: 'read_failure' });
    expect((await c.call('GET', '/api/accounts')).res.status).toBe(503);
    expect((await c.call('GET', '/api/accounts')).res.status).toBe(200);
  });
});

it('production configuration rejects the insecure cookie mode', () => {
  expect(() => loadConfig({ NODE_ENV: 'production', COOKIE_MODE: 'insecure-dev' })).toThrow();
  expect(loadConfig({ NODE_ENV: 'production' }).demoControls).toBe(false);
  expect(path.basename(loadConfig({}).coreDbPath)).toBe('core.sqlite');
});
