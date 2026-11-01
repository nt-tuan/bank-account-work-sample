import { expect, test, ORIGIN } from './fixtures.ts';
import type { AccountSummary } from '../../shared/schemas/api.ts';

for (const reload of [false, true]) {
  test(`transfer updates a balance-only page after ${reload ? 'reload' : 'immediate navigation'}`, async ({
    signedIn: page,
  }) => {
    const before = (await (await page.request.get('/api/accounts')).json())
      .items as AccountSummary[];
    const savingsBefore = before.find((account) => account.id === 'acc_savings')!.currentMinor;
    const session = await (await page.request.get('/api/session')).json();
    await page.request.post('/api/demo/scenario', {
      headers: { Origin: ORIGIN, 'X-CSRF-Token': session.csrfToken },
      data: { scenario: 'execution_slow' },
    });
    await page.goto('/transfers/new?from=acc_everyday');
    await page.getByRole('radio', { name: 'Own accounts' }).check();
    await page.getByRole('radio', { name: /^Savings/ }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('#amount').fill('100');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Confirm transfer' }).click();
    await expect(page).toHaveURL(/\/activity\/[^/?]+$/);
    await page
      .locator('#sidebar')
      .getByRole('link', { name: 'Account information', exact: true })
      .click();
    await expect(page).toHaveURL(/\/accounts$/);
    if (reload) await page.reload();
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('link', { name: 'Savings', exact: true }) });
    await expect(row).toContainText(`¥${savingsBefore.toLocaleString('en-US')}`);
    await expect(row).toContainText(`¥${(savingsBefore + 100).toLocaleString('en-US')}`, {
      timeout: 20_000,
    });
    await expect(
      page.getByRole('heading', { name: 'Account information', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Recent activity' })).toHaveCount(0);
  });
}
