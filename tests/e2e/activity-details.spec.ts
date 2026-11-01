import AxeBuilder from '@axe-core/playwright';
import { test, expect, ORIGIN } from './fixtures.ts';

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`Activity Details: two sections, hold links, legacy redirect and layout at ${viewport.width}px`, async ({
    signedIn: page,
  }) => {
    await page.setViewportSize(viewport);
    const session = await (await page.request.get('/api/session')).json();
    const headers = { Origin: ORIGIN, 'X-CSRF-Token': session.csrfToken };
    await page.request.post('/api/demo/scenario', {
      headers,
      data: { scenario: 'execution_slow' },
    });
    const response = await page.request.post('/api/transfers', {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: {
        sourceAccountId: 'acc_everyday',
        destination: { kind: 'own', accountId: 'acc_savings' },
        amount: '1250',
        reference: 'Activity details QA',
      },
    });
    expect(response.status()).toBe(202);
    const order = await response.json();
    await page.goto('/accounts/acc_everyday');
    await page.getByRole('link', { name: 'To Savings', exact: true }).click();
    await expect(page).toHaveURL(`/activity/${order.sourceActivityId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Activity details' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Activity Summary' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Transfer Details' })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Transfer status' })
        .getByText('Processing', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('main section')).toHaveCount(2);
    await expect(page.locator('main a[href^="/transfers/TRF-"]')).toHaveCount(0);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(accessibility.violations.map((v) => v.id)).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (viewport.width === 390) {
      await page.setViewportSize({ width: 320, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.setViewportSize(viewport);
    }
    await page.screenshot({
      path: `test-results/activity-details-${viewport.width}.png`,
      fullPage: true,
    });
    await page.goto(`/transfers/${order.id}`);
    await expect(page).toHaveURL(`/activity/${order.sourceActivityId}`);
    await expect(
      page.getByRole('region', { name: 'Transfer status' }).getByText('Completed', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole('region', { name: 'Activity Summary' })).toContainText('Posted');
    await expect(page.getByRole('region', { name: 'Transfer status' })).toContainText('Completed');
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL('/activity?cat=transfer');
  });
}
