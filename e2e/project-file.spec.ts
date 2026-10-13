import { expect, test } from '@playwright/test';

test('a project saved to a file opens again as a new project', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'file round trip checked once');
  await page.goto('./');
  await page.locator('#project-btn').click();
  await page.getByLabel('Project name').fill('Kitchen scene');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#save-file').click()]);
  expect(download.suggestedFilename()).toBe('Kitchen scene.floorplan.json');
  const path = await download.path();

  await page.locator('#project-btn').click();
  await page.getByLabel('Project name').fill('Something else');
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.locator('#project-btn .project-name')).toHaveText('Kitchen scene');
  // The other project is still there.
  await page.locator('#project-btn').click();
  await expect(page.getByRole('button', { name: /Something else/ })).toBeVisible();
});
