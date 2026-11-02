import { expect, signIn, test } from './fixtures.ts';
import type { Page } from '@playwright/test';
import { addMonths, jstMonthOf } from '../../shared/time.ts';

async function reviewOwnTransfer(page: Page) {
  await page.goto('/transfers/new?from=acc_everyday');
  await page.getByLabel('Own accounts', { exact: true }).check();
  await page.locator('input[value="acc_savings"]').check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Amount (¥)').fill('100');
  await page.getByLabel(/Reference/).fill('Review regression');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review your transfer' })).toBeVisible();
}

async function rotateSessionInAnotherTab(page: Page) {
  const other = await page.context().newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(other).toHaveURL(/\/login$/);
  await signIn(other);
  await other.close();
}

test('a committed order with all responses lost remains uncertain when leaving and retries exactly once', async ({
  signedIn: page,
}) => {
  await reviewOwnTransfer(page);
  const keys: (string | undefined)[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/transfers')
      keys.push(request.headers()['idempotency-key']);
  });
  let transferId = '';
  await page.route('**/api/transfers', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(202);
    transferId = (await response.json()).id;
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Confirm transfer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: "We couldn't confirm your transfer" }),
  ).toBeVisible();
  await expect
    .poll(
      async () => (await (await page.request.get(`/api/transfers/${transferId}`)).json()).status,
    )
    .toBe('completed');
  await page.getByRole('link', { name: 'View account activity' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Your transfer may already have been sent.');
  await expect(dialog).not.toContainText('Nothing has been sent.');
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.unroute('**/api/transfers');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL(/\/activity\/ACT-/);
  expect(keys).toHaveLength(4);
  expect(new Set(keys).size).toBe(1);
  const orders = await (await page.request.get('/api/transfers?q=Review%20regression')).json();
  expect(orders.total).toBe(1);
  expect(orders.items[0].id).toBe(transferId);
});

test('a login in another tab refreshes CSRF without discarding the review or replaying automatically', async ({
  signedIn: page,
}) => {
  await reviewOwnTransfer(page);
  await rotateSessionInAnotherTab(page);
  const keys: (string | undefined)[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/transfers')
      keys.push(request.headers()['idempotency-key']);
  });
  await page.getByRole('button', { name: 'Confirm transfer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Your session was refreshed. Please try again.',
  );
  expect(keys).toHaveLength(1);
  await expect(page.getByRole('heading', { name: 'Review your transfer' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm transfer', exact: true }).click();
  await expect(page).toHaveURL(/\/activity\/ACT-/);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(
    (await (await page.request.get('/api/transfers?q=Review%20regression')).json()).total,
  ).toBe(1);
});

test('a CSRF rejection cannot turn an earlier committed unknown submission into a new order', async ({
  signedIn: page,
}) => {
  await reviewOwnTransfer(page);
  await page.route('**/api/transfers', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Confirm transfer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: "We couldn't confirm your transfer" }),
  ).toBeVisible();
  await page.unroute('**/api/transfers');
  await rotateSessionInAnotherTab(page);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: "We couldn't confirm your transfer" }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL(/\/activity\/ACT-/);
  expect(
    (await (await page.request.get('/api/transfers?q=Review%20regression')).json()).total,
  ).toBe(1);
});

test('opening pagination and month tabs in a new tab preserves the filter context', async ({
  signedIn: page,
}) => {
  const month = addMonths(jstMonthOf(Date.now()), -1);
  await page.goto(`/activity?account=acc_everyday&month=${month}&status=posted`);
  const [next] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('link', { name: 'Next page' }).click({ button: 'middle' }),
  ]);
  await expect(next).toHaveURL(
    new RegExp(`account=acc_everyday&month=${month}&status=posted&page=2$`),
  );
  await expect(next.getByRole('table', { name: 'Account activity' })).toBeVisible();
  await next.close();
  const oldest = page
    .getByRole('navigation', { name: 'Month', exact: true })
    .getByRole('link')
    .first();
  const href = await oldest.getAttribute('href');
  const [changedMonth] = await Promise.all([
    page.context().waitForEvent('page'),
    oldest.click({ button: 'middle' }),
  ]);
  await expect(changedMonth).toHaveURL(new URL(href!, page.url()).href);
  const query = new URL(changedMonth.url()).searchParams;
  expect(query.get('account')).toBe('acc_everyday');
  expect(query.get('status')).toBe('posted');
  expect(query.has('page')).toBe(false);
  await changedMonth.close();
});
