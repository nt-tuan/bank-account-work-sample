import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

async function choose(page: Page, id: string, label: string) {
  await page.locator(`#${id}`).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

test('all shared selects use the shared dropdown and preserve empty selections', async ({
  signedIn: page,
}) => {
  await page.goto('/activity');
  await expect(page.getByRole('combobox')).toHaveCount(6);
  await choose(page, 'f-account', 'Everyday •••2481');
  await choose(page, 'f-dir', 'Money out');
  await choose(page, 'f-status', 'Posted');
  await choose(page, 'f-cat', 'Dining');
  await choose(page, 'f-sort', 'Oldest first');
  await expect(page).toHaveURL(/sort=asc/);
  await choose(page, 'f-account', 'All accounts');
  await choose(page, 'f-dir', 'All');
  await choose(page, 'f-status', 'All');
  await choose(page, 'f-cat', 'All');
  await expect(page).not.toHaveURL(/account=|dir=|status=|cat=/);
  await page.locator('#f-sort').press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('#f-sort')).toBeFocused();

  await choose(page, 'f-transfer-status', 'Processing');
  await expect(page).toHaveURL(/transferStatus=processing/);
  await choose(page, 'f-transfer-status', 'All');
  await expect(page).not.toHaveURL(/transferStatus=/);

  await page.goto('/transfers');
  await expect(page).toHaveURL(/\/activity\?cat=transfer$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Account activity');
  await expect(page.getByRole('link', { name: 'Transfer history', exact: true })).toHaveCount(0);

  await page.goto('/insights');
  await expect(page.getByRole('combobox')).toHaveCount(2);
  await page.locator('#i-month').click();
  await page.getByRole('option').nth(1).click();
  await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
  await choose(page, 'i-account', 'Everyday •••2481');
  await choose(page, 'i-account', 'All accounts');
  await expect(page).not.toHaveURL(/account=/);

  await page.goto('/transfers/new?from=acc_everyday');
  await expect(page.getByRole('combobox')).toHaveCount(1);
  await page.locator('#bank').press('Enter');
  await expect(page.getByRole('option', { name: 'Choose a bank' })).toBeFocused();
  await page.keyboard.type('Minato');
  await expect(page.getByRole('option', { name: 'Minato Bank (0152)' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#bank')).toHaveText('Minato Bank (0152)');
  await choose(page, 'bank', 'Choose a bank');
  await expect(page.locator('#bank')).toHaveText('Choose a bank');

  await page.locator('#sidebar').getByRole('button', { name: 'Demo controls' }).click();
  const dialog = page.getByRole('dialog', { name: /Demo controls/ });
  await expect(dialog.getByRole('combobox')).toHaveCount(1);
  await dialog.locator('#demo-scenario').click();
  const scenario = page.getByRole('option').nth(1);
  const label = await scenario.textContent();
  await scenario.click();
  await expect(dialog.locator('#demo-scenario')).toHaveText(label!);
  await expect(dialog.locator('#demo-scenario')).toBeEnabled();
  await choose(page, 'demo-scenario', 'None (normal behavior)');
  await expect(dialog.getByRole('status')).toHaveText('Scenario cleared.');
});

test('route chrome keeps titles, back actions and menu context across navigation', async ({
  signedIn: page,
}) => {
  await page.goto('/accounts/acc_everyday');
  await expect(page).toHaveTitle('Everyday · Demo Banking');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Everyday');
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveTitle('Account information · Demo Banking');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.goto('/menu');
  await page.getByRole('button', { name: 'Demo controls DEMO ONLY', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Demo controls/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto('/does-not-exist');
  await expect(page).toHaveTitle('Not found · Demo Banking');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('bank dropdown fits all target widths and remains accessible when open', async ({
  signedIn: page,
}, testInfo) => {
  for (const width of [320, 810, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/transfers/new?from=acc_everyday');
    const bank = page.locator('#bank');
    await bank.click();
    const triggerBox = (await bank.boundingBox())!;
    const iconBox = (await bank.locator('svg').boundingBox())!;
    expect(triggerBox.x + triggerBox.width - iconBox.x - iconBox.width).toBeGreaterThanOrEqual(12);
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    const listBox = (await list.boundingBox())!;
    expect(listBox.height).toBeGreaterThan(100);
    expect(listBox.x).toBeGreaterThanOrEqual(0);
    expect(listBox.x + listBox.width).toBeLessThanOrEqual(width);
    expect(listBox.y).toBeGreaterThanOrEqual(0);
    expect(listBox.y + listBox.height).toBeLessThanOrEqual(900);
    await expect(page.getByRole('option').first()).toBeInViewport();
    // Radix hides the background while trapping focus; audit the active popup.
    await expect
      .poll(() => list.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press('Tab');
    await expect
      .poll(() => list.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .include('[role="listbox"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`bank-select-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(bank).toBeFocused();
  }
});
