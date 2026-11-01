import { test as base, expect, type Page } from '@playwright/test';

export const ORIGIN = 'http://127.0.0.1:8788';

/** Resets both stores through the real API (with session + CSRF), then starts signed out. */
async function resetData(page: Page) {
  const r = page.request;
  const s = await (await r.get('/api/session')).json();
  const login = await r.post('/api/session/login', {
    data: { username: 'kenji', password: 'demo-pass-2026' },
    headers: { Origin: ORIGIN, 'X-CSRF-Token': s.csrfToken },
  });
  const token = (await login.json()).csrfToken;
  const reset = await r.post('/api/demo/reset', {
    data: { confirm: true },
    headers: { Origin: ORIGIN, 'X-CSRF-Token': token },
  });
  expect(reset.status()).toBe(204);
  await page.context().clearCookies();
}

export async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill('kenji');
  await page.getByLabel('Password').fill('demo-pass-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
}

export const test = base.extend<{ signedIn: Page }>({
  page: async ({ page }, use) => {
    await resetData(page);
    await use(page);
  },
  signedIn: async ({ page }, use) => {
    await signIn(page);
    await use(page);
  },
});

export { expect };
