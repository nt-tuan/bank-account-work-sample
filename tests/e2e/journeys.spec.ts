import AxeBuilder from '@axe-core/playwright';
import { expect, signIn, test, ORIGIN } from './fixtures.ts';
import type { AccountSummary } from '../../shared/schemas/api.ts';

test.describe('auth (AC-14)', () => {
  test('failed logout stays on sign-in with a working retry despite a live server session', async ({
    signedIn: page,
  }) => {
    await page.route('**/api/session/logout', (route) => route.abort('failed'));
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('alert')).toContainText("We couldn't confirm sign-out");
    expect((await (await page.request.get('/api/session')).json()).authenticated).toBe(true);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Retry sign-out' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toHaveCount(0);
    await page.unroute('**/api/session/logout');
    await page.getByRole('button', { name: 'Retry sign-out' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Signed out.' })).toBeVisible();
    expect((await (await page.request.get('/api/session')).json()).authenticated).toBe(false);
  });
  test('protected routes redirect to login and return after sign-in; logout revokes', async ({
    page,
  }) => {
    await page.goto('/activity?status=posted');
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await page.getByLabel('Username').fill('kenji');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('The username or password is incorrect.')).toBeVisible();
    await page.getByLabel('Password').fill('demo-pass-2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/activity\?status=posted$/);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/accounts');
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get('/api/accounts')).status()).toBe(401);
  });
});

test.describe('accounts (AC-01, AC-12)', () => {
  test('Home selection aligns with its page header', async ({ signedIn: page }) => {
    const home = page.locator('#sidebar').getByRole('link', { name: 'Home', exact: true });
    const header = page.getByRole('heading', { level: 1, name: 'Home' }).locator('..');
    const homeBox = await home.boundingBox();
    const headerBox = await header.boundingBox();
    expect(homeBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(homeBox!.y).toBe(headerBox!.y);
    expect(homeBox!.height).toBe(headerBox!.height);
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(home).toBeHidden();
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(home).toBeVisible();
  });

  test('Copy never increases the account-number row height', async ({
    signedIn: page,
  }, testInfo) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    for (const width of [320, 810, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/accounts/acc_everyday');
      const details = page.getByRole('region', { name: 'Account details' });
      const row = details
        .locator('dt')
        .filter({ hasText: /^Account number$/ })
        .locator('xpath=following-sibling::dd[1]');
      const currency = details
        .locator('dt')
        .filter({ hasText: /^Currency$/ })
        .locator('xpath=following-sibling::dd[1]');
      const copy = details.getByRole('button', { name: 'Copy account number' });
      await expect(copy).toBeVisible();
      const height = await row.evaluate((el) => el.getBoundingClientRect().height);
      expect(height).toBe(await currency.evaluate((el) => el.getBoundingClientRect().height));
      const number = (await row.locator('span.tracking-\\[0\\.04em\\]').textContent())!.trim();
      await copy.click();
      await expect(copy).toHaveText('Copied');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(number);
      expect(await row.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
      await page.evaluate(() => {
        navigator.clipboard.writeText = async () => {
          throw new Error('Clipboard unavailable');
        };
      });
      await copy.click();
      await expect(copy).toHaveText('Retry');
      await expect(details.getByRole('status')).toHaveText("Couldn't copy");
      expect(await row.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
      await page.screenshot({ path: testInfo.outputPath(`account-${width}.png`), fullPage: true });
    }
  });

  test('Home shows six accounts with status; hiding amounts removes the numbers from the DOM', async ({
    signedIn: page,
  }) => {
    const rows = page
      .getByRole('link', { name: /Checking|Savings/ })
      .filter({ hasText: 'Available' });
    await expect(rows).toHaveCount(6);
    await expect(page.getByText('Restricted', { exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Hide amounts' }).click();
    await expect(page.getByRole('button', { name: 'Show amounts' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const html = await page.locator('main').innerHTML();
    expect(html).not.toMatch(/¥\s?\d|\d{1,3}(,\d{3})+/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Show amounts' })).toBeVisible();
    await page
      .getByRole('link', { name: /Everyday/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Everyday' })).toBeVisible();
    await expect(page.getByText(/¥\d/).first()).toBeVisible();
    await page
      .getByRole('button', { name: 'Show amounts' })
      .isVisible()
      .catch(() => false);
  });

  test('restricted account explains why transfers are unavailable', async ({ signedIn: page }) => {
    await page.goto('/accounts/acc_rent');
    await expect(page.getByText("This account can't send or receive transfers.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transfer from this account' })).toBeDisabled();
  });
});

test.describe('transfers (AC-05, AC-07, AC-08)', () => {
  test('leaving a processing transfer for Home still updates activity and balances', async ({
    signedIn: page,
  }) => {
    const before = await (await page.request.get('/api/accounts')).json();
    const savingsBefore = before.items.find((a: { id: string }) => a.id === 'acc_savings')
      .availableMinor as number;
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
    await page.getByRole('link', { name: 'Back to Home', exact: true }).click();
    const outgoing = page
      .getByRole('region', { name: 'Recent activity' })
      .getByRole('link', { name: /To Savings/ });
    await expect(outgoing).toContainText('Pending');
    await expect(outgoing).toContainText('Posted', { timeout: 15_000 });
    const savings = page
      .getByRole('region', { name: 'Your accounts' })
      .getByRole('link', { name: /^Savings/ });
    await expect(savings).toContainText(`¥${(savingsBefore + 100).toLocaleString('en-US')}`);
  });
  for (const surface of ['list', 'detail'] as const) {
    test(`account activity ${surface} tracks Processing to Completed without reload`, async ({
      signedIn: page,
    }) => {
      const accounts = await (await page.request.get('/api/accounts')).json();
      const savingsBefore = accounts.items.find((a: { id: string }) => a.id === 'acc_savings')
        .availableMinor as number;
      const expectFreshSavings = async () => {
        await page.locator('#sidebar').getByRole('link', { name: 'Home', exact: true }).click();
        const savings = page
          .getByRole('region', { name: 'Your accounts' })
          .getByRole('link', { name: /^Savings/ });
        await expect(savings).toContainText(`¥${(savingsBefore + 100).toLocaleString('en-US')}`);
        await page.goBack();
      };
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
          amount: '100',
          reference: 'Activity polling',
        },
      });
      expect(response.status()).toBe(202);
      const transfer = await response.json();
      await page
        .locator('#sidebar')
        .getByRole('link', { name: 'Account activity', exact: true })
        .click();
      await page.getByRole('searchbox').fill(transfer.id);
      await expect(page).toHaveURL(new RegExp(`q=${transfer.id}`));
      const row = page.getByRole('row').filter({ hasText: 'To Savings' });
      await expect(row.getByText('Processing', { exact: true })).toBeVisible();
      if (surface === 'detail') {
        await row.getByRole('link').click();
        await expect(
          page.getByRole('heading', { level: 1, name: 'Activity details' }),
        ).toBeVisible();
        await expect(
          page
            .getByRole('region', { name: 'Transfer Details' })
            .getByText('Processing', { exact: true }),
        ).toBeVisible();
        await expect(
          page
            .getByRole('region', { name: 'Transfer status' })
            .getByText('Completed', { exact: true }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          page.getByRole('definition').getByText('Posted', { exact: true }),
        ).toBeVisible();
        await expectFreshSavings();
        await page.getByRole('link', { name: 'Back', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`q=${transfer.id}`));
      } else {
        await expect(row.getByText('Completed', { exact: true })).toBeVisible({ timeout: 15_000 });
        await expectFreshSavings();
        await page.locator('#f-transfer-status').click();
        await page.getByRole('option', { name: 'Completed', exact: true }).click();
        await expect(page).toHaveURL(/transferStatus=completed/);
        await page.reload();
        await expect(row.getByText('Completed', { exact: true })).toBeVisible();
        await page
          .getByRole('button', { name: 'Remove filter Transfer status: Completed', exact: true })
          .click();
        await expect(page).not.toHaveURL(/transferStatus=/);
      }
    });
  }

  test('own-account transfer by keyboard: processing, then completed, visible in account activity', async ({
    signedIn: page,
  }) => {
    await page.goto('/transfers/new');
    await expect(
      page.getByRole('heading', { name: 'Which account are you sending from?' }),
    ).toBeFocused();
    await page.getByRole('radio', { name: /^Everyday/ }).check();
    await page.getByRole('button', { name: 'Next' }).press('Enter');
    await expect(page.getByRole('heading', { name: 'Who are you sending to?' })).toBeFocused();
    await page.getByRole('radio', { name: 'Own accounts' }).check();
    await page.getByRole('radio', { name: /^Savings/ }).check();
    await page.getByRole('button', { name: 'Next' }).press('Enter');
    await page.locator('#amount').fill('12,000');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(
      page.getByText('Enter the amount using digits 0–9 only', { exact: false }),
    ).toBeVisible();
    await page.locator('#amount').fill('12000');
    await page.locator('#reference').fill('Rainy day');
    await page.getByRole('button', { name: 'Next' }).press('Enter');
    await expect(page.getByRole('heading', { name: 'Review your transfer' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm transfer' }).press('Enter');
    await expect(page).toHaveURL(/\/activity\/ACT-/);
    const status = page.getByRole('region', { name: 'Transfer status' });
    await expect(status.getByRole('heading', { name: 'Transfer status' })).toBeFocused();
    await expect(status.getByText(/^(Processing|Completed)$/)).toBeVisible();
    await expect(status.getByText('Completed', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Make another transfer' })).toBeVisible();
    const transferId = await page
      .getByRole('region', { name: 'Transfer Details' })
      .getByRole('definition')
      .filter({ hasText: /^TRF-/ })
      .innerText();
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Transfer status' }).getByText('Completed', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Account activity', exact: true }).last().click();
    await expect(page).toHaveURL(/\/activity\?cat=transfer/);
    await page.getByRole('searchbox').fill(transferId);
    const row = page.getByRole('row').filter({ hasText: 'To Savings' });
    await expect(row.getByText('Completed', { exact: true })).toBeVisible();
    await row.getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Activity details' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Transfer status' }).getByText('Completed', { exact: true }),
    ).toBeVisible();
  });

  test('external transfer with a looked-up name completes; a wrong manual name fails with the hold released', async ({
    signedIn: page,
  }) => {
    const before = (await (await page.request.get('/api/accounts')).json())
      .items as AccountSummary[];
    const sourceBefore = before.find((account) => account.id === 'acc_everyday')!;
    const yen = (amount: number) => `¥${amount.toLocaleString('en-US')}`;
    await page.goto('/transfers/new?from=acc_everyday');
    await page.locator('#bank').click();
    await page.getByRole('option', { name: 'Minato Bank (0152)', exact: true }).click();
    await page.locator('#accountNumber').fill('4012733');
    await page.locator('#accountNumber').press('Tab');
    await expect(page.getByRole('textbox', { name: /Recipient name/ })).toHaveValue(
      'SUZUKI HARUTO',
    );
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('#amount').fill('2500');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Registered at the bank')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm transfer' }).click();
    await expect(
      page.getByRole('region', { name: 'Transfer status' }).getByText('Completed', { exact: true }),
    ).toBeVisible();

    const after = (await (await page.request.get('/api/accounts')).json())
      .items as AccountSummary[];
    const sourceAfter = after.find((account) => account.id === 'acc_everyday')!;
    expect(sourceAfter.currentMinor).toBe(sourceBefore.currentMinor - 2500);
    expect(sourceAfter.availableMinor).toBe(sourceBefore.availableMinor - 2500);
    expect(sourceAfter.heldMinor).toBe(sourceBefore.heldMinor);
    await page.locator('#sidebar').getByRole('link', { name: 'Home', exact: true }).click();
    const balance = page.getByRole('region', { name: 'Total available' });
    await expect(
      balance.getByText(yen(before.reduce((sum, a) => sum + a.availableMinor, 0) - 2500), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      balance.getByText(yen(before.reduce((sum, a) => sum + a.currentMinor, 0) - 2500), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Your accounts' }).getByRole('link', { name: /^Everyday/ }),
    ).toContainText(yen(sourceAfter.availableMinor));

    await page.goto('/transfers/new?from=acc_everyday');
    await page.locator('#bank').click();
    await page.getByRole('option', { name: 'Kita Trust Bank (0427)', exact: true }).click();
    await page.locator('#accountNumber').fill('2700418');
    await page.locator('#accountNumber').press('Tab');
    await expect(
      page.getByText("can't display the name right now", { exact: false }),
    ).toBeVisible();
    await page.getByRole('textbox', { name: /Recipient name/ }).fill('YAMADA AO');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('#amount').fill('3000');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Entered by you')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm transfer' }).click();
    await expect(
      page.getByRole('region', { name: 'Transfer status' }).getByText('Failed', { exact: true }),
    ).toBeVisible();
    const status = page.getByRole('region', { name: 'Transfer status' });
    await expect(
      status.getByText("doesn't match the name registered at the bank", { exact: false }),
    ).toBeVisible();
    await expect(status.getByText('hold has been released', { exact: false })).toBeVisible();
  });

  test('recipient closure selected before submit fails Sakura 3107777 and releases funds', async ({
    signedIn: page,
  }) => {
    const accountsBefore = await (await page.request.get('/api/accounts')).json();
    await page.goto('/transfers/new?from=acc_everyday');
    await page.locator('#bank').click();
    await page.getByRole('option', { name: 'Sakura Partner Bank (0310)', exact: true }).click();
    await page.locator('#accountNumber').fill('3107777');
    await page.locator('#accountNumber').press('Tab');
    await expect(page.getByRole('textbox', { name: /Recipient name/ })).toHaveValue(
      'TAKAHASHI-MONTGOMERY ELIZABETH',
    );
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('#amount').fill('1000');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'Review your transfer' })).toBeVisible();
    await page.getByRole('button', { name: 'Demo controls', exact: true }).click();
    await page.locator('#demo-scenario').click();
    await page
      .getByRole('option', { name: 'Recipient closes during processing', exact: true })
      .click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('Scenario set');
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm transfer' }).click();
    await expect(page).toHaveURL(/\/activity\/ACT-/);
    const status = page.getByRole('region', { name: 'Transfer status' });
    await expect(status.getByText('Failed', { exact: true })).toBeVisible();
    await expect(status.getByText('hold has been released', { exact: false })).toBeVisible();
    expect(await (await page.request.get('/api/accounts')).json()).toEqual(accountsBefore);
    expect((await (await page.request.get('/api/demo/catalog')).json()).pendingScenario).toBeNull();
  });

  test('an order rejection returns to the owning step and records nothing', async ({
    signedIn: page,
  }) => {
    const before = (await (await page.request.get('/api/transfers?pageSize=1')).json()).total;
    await page.goto('/transfers/new?from=acc_side');
    await page.getByRole('radio', { name: 'Own accounts' }).check();
    await page.getByRole('radio', { name: /^Everyday/ }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('#amount').fill('1');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(
      page.getByText('more than the available balance', { exact: false }).first(),
    ).toBeVisible();
    expect((await (await page.request.get('/api/transfers?pageSize=1')).json()).total).toBe(before);
  });

  test('a lost order response is retried with the same key and creates exactly one order (AC-09)', async ({
    signedIn: page,
  }) => {
    const s = await (await page.request.get('/api/session')).json();
    await page.request.post('/api/demo/scenario', {
      data: { scenario: 'create_response_lost' },
      headers: { Origin: ORIGIN, 'X-CSRF-Token': s.csrfToken },
    });
    const before = (await (await page.request.get('/api/transfers?pageSize=1')).json()).total;
    await page.goto('/transfers/new?from=acc_everyday');
    await page.getByRole('radio', { name: 'Own accounts' }).check();
    await page.getByRole('radio', { name: /^Savings/ }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('#amount').fill('777');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Confirm transfer' }).click();
    await expect(page).toHaveURL(/\/activity\/ACT-/);
    expect((await (await page.request.get('/api/transfers?pageSize=1')).json()).total).toBe(
      before + 1,
    );
  });
});

test.describe('activity (AC-03)', () => {
  test('filters live in the URL, survive reload, and lead to an addressable detail', async ({
    signedIn: page,
  }) => {
    await page.goto('/activity');
    await page.locator('#f-account').click();
    await page.getByRole('option', { name: 'Everyday •••2481', exact: true }).click();
    await page.locator('#f-cat').click();
    await page.getByRole('option', { name: 'Dining', exact: true }).click();
    await expect(page).toHaveURL(/account=acc_everyday/);
    await expect(page).toHaveURL(/cat=dining/);
    // The previous month always has seeded dining entries.
    await page.getByRole('navigation', { name: 'Month' }).getByRole('link').nth(4).click();
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
    await expect(page.getByRole('columnheader', { name: 'Balance' })).toBeVisible();
    await page.reload();
    await expect(page.locator('#f-cat')).toHaveText('Dining');
    await expect(
      page.getByRole('button', { name: /Remove filter Category: Dining/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).toHaveURL(/\/activity$/);
    await page.locator('#f-q').fill('concert');
    await page
      .getByRole('link', { name: 'Custom range…' })
      .or(page.getByRole('button', { name: 'Custom range…' }))
      .click();
    await page.locator('#r-from').fill('2026-01-01');
    await page.locator('#r-to').fill('2026-12-31');
    await page.getByRole('button', { name: 'Apply range' }).click();
    await expect(page).toHaveURL(/q=concert/);
    const first = page.getByRole('link', { name: /KOBAYASHI REN|SATO KEN/ }).first();
    await first.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Activity details' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Activity details' })).toBeVisible();
  });
});

test.describe('accessibility and layout (AC-16)', () => {
  for (const path of ['/', '/accounts', '/activity', '/transfers/new', '/insights']) {
    test(`axe: ${path}`, async ({ signedIn: page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) =>
            `${v.id}: ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(', ')}`,
        ),
      ).toEqual([]);
    });
  }

  test('axe: login and Home with amounts hidden', async ({ page }) => {
    await page.goto('/login');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await signIn(page);
    await page.getByRole('button', { name: 'Hide amounts' }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  for (const width of [320, 810, 1440]) {
    test(`no page-level horizontal overflow at ${width}px`, async ({ signedIn: page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        '/',
        '/activity',
        '/transfers/new',
        '/insights',
        '/accounts/acc_everyday',
      ]) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }
});
