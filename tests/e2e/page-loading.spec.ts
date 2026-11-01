import { test, expect } from './fixtures.ts';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test('intent preloads code/data silently; navigation bridges slow code and slow data with skeletons', async ({
  signedIn: page,
}, testInfo) => {
  const code = gate();
  const data = gate();
  let chunkStarted = false;
  let dataRequests = 0;
  await page.route('**/assets/InsightsPage-*.js', async (route) => {
    chunkStarted = true;
    await code.promise;
    await route.continue();
  });
  await page.route('**/api/insights?*', async (route) => {
    dataRequests += 1;
    await data.promise;
    await route.continue();
  });
  try {
    const link = page.locator('#sidebar').getByRole('link', { name: 'Insights', exact: true });
    await link.hover();
    await expect.poll(() => chunkStarted).toBe(true);
    await expect.poll(() => dataRequests).toBe(1);
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading insights' })).toHaveCount(0);

    await link.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading insights filters' })).toBeVisible();
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide amounts' })).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath('pending-code-desktop.png'),
      fullPage: true,
    });

    code.release();
    await expect(page).toHaveURL('/insights');
    await expect(page.getByLabel('Month', { exact: true })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading insights filters' })).toHaveCount(0);
    await expect(page.getByRole('status', { name: 'Loading insights' })).toBeVisible();
    expect(dataRequests).toBe(1);

    data.release();
    await expect(page.getByRole('region', { name: 'Spending by category' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading insights' })).toHaveCount(0);
    expect(dataRequests).toBe(1);
    await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeFocused();
  } finally {
    code.release();
    data.release();
  }
});

test('direct mobile entry renders the destination skeleton before its chunk loads', async ({
  signedIn: page,
}, testInfo) => {
  const code = gate();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/assets/AccountDetailPage-*.js', async (route) => {
    await code.promise;
    await route.continue();
  });
  try {
    await page.goto('/accounts/acc_everyday', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('status', { name: 'Loading account', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('pending-code-mobile.png'), fullPage: true });
    code.release();
    await expect(page.getByRole('region', { name: 'Account details' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading account', exact: true })).toHaveCount(0);
  } finally {
    code.release();
  }
});
