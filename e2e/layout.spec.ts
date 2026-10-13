import { expect, test, type Page } from '@playwright/test';

const PHONE_MAX = 520;

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./');
  await expect(page.locator('.stage canvas').first()).toBeVisible();
  return errors;
}

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

test('loads without errors and fits the screen', async ({ page }) => {
  const errors = await open(page);
  const vp = page.viewportSize()!;
  // The page itself never scrolls (the plan and the panel scroll on their own).
  const scrolled = await page.evaluate(() => {
    window.scrollTo(9999, 9999);
    return { x: window.scrollX, y: window.scrollY, w: document.documentElement.scrollWidth };
  });
  expect(scrolled).toMatchObject({ x: 0, y: 0 });
  expect(scrolled.w).toBeLessThanOrEqual(vp.width);
  // Top bar and status bar are on screen.
  const top = await box(page, '.topbar');
  const status = await box(page, '.statusbar');
  expect(top.y).toBeGreaterThanOrEqual(0);
  expect(status.y + status.height).toBeLessThanOrEqual(vp.height + 1);
  expect(errors).toEqual([]);
});

test('menu and plan are both visible (side by side unless on a phone)', async ({ page }) => {
  await open(page);
  const vp = page.viewportSize()!;
  const stage = await box(page, '.stage');
  const panel = await box(page, '.panel');
  expect(stage.width).toBeGreaterThan(200);
  if (vp.width > PHONE_MAX) {
    // Panel beside the plan, fully on screen.
    expect(panel.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1);
    expect(panel.x + panel.width).toBeLessThanOrEqual(vp.width + 1);
    expect(panel.height).toBeGreaterThan(300);
  } else {
    // Phone: a bottom sheet whose header shows over the plan.
    await expect(page.locator('.sheet-toggle')).toBeVisible();
  }
});

test('categories switch and an item can be added', async ({ page }) => {
  await open(page);
  const vp = page.viewportSize()!;
  await page.locator('#mode-scene').click();
  if (vp.width <= PHONE_MAX) await page.locator('.sheet-toggle').click();
  await page.locator('.tile', { hasText: 'Sofa' }).click();
  await expect(page.locator('.insp-title')).toHaveText('Sofa');
});

test('touch screens get a selection bar', async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, 'touch only');
  await open(page);
  const vp = page.viewportSize()!;
  await page.locator('#mode-scene').click();
  if (vp.width <= PHONE_MAX) await page.locator('.sheet-toggle').click();
  await page.locator('.tile', { hasText: 'Sofa' }).click();
  if (vp.width <= PHONE_MAX) await page.locator('.sheet-toggle').click();
  const bar = page.locator('.selection-bar');
  await expect(bar).toBeVisible();
  await bar.getByLabel('Duplicate').click();
  await bar.getByLabel('Delete').click();
  await expect(bar).toBeHidden();
});
