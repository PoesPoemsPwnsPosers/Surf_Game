import { expect, test } from '@playwright/test';
import { mode, openGame, sim, snap, startGame, watchErrors } from './helpers';

// Keyboard and mouse. The touch work must not change how the desktop game plays.

test('no touch controls on a desktop', async ({ page }, info) => {
  await startGame(page, info);
  await expect(page.locator('body')).not.toHaveClass(/touch/);
  await expect(page.locator('#touch')).toBeHidden();
  await expect(page.locator('#hint')).toBeVisible();
  await expect(page.locator('#rotate')).toBeHidden();
});

test('Enter starts the game, Esc pauses and resumes', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openGame(page, info);
  await page.keyboard.press('Enter');
  await expect.poll(() => mode(page)).toBe('playing');
  await page.keyboard.press('Escape');
  await expect.poll(() => mode(page)).toBe('paused');
  await expect(page.locator('#overlay-title')).toHaveText('Paused');
  await page.keyboard.press('Escape');
  await expect.poll(() => mode(page)).toBe('playing');
  expect(errors).toEqual([]);
});

test('real key presses walk the surfer and are released again', async ({ page }, info) => {
  await startGame(page, info);
  const a = await snap(page);
  await page.keyboard.down('KeyW');
  expect((await snap(page)).keys).toEqual(['KeyW']);
  await sim(page, 1);
  await page.keyboard.up('KeyW');
  const b = await snap(page);
  expect(b.keys).toEqual([]);
  expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(3);
});

test('F at the shop counter opens the shop and Esc closes it', async ({ page }, info) => {
  await startGame(page, info);
  await page.evaluate(() => {
    const d = window.__surf.debug;
    const spot = window.__surf.level.land.shop;
    d.surfer.pos.x = spot.x;
    d.surfer.pos.z = spot.z;
  });
  await sim(page, 0.2);
  await expect(page.locator('#prompt')).toHaveText('F: SURF SHOP');
  await page.keyboard.down('KeyF');
  await sim(page, 0.05);
  await page.keyboard.up('KeyF');
  await expect(page.locator('#shop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#shop')).toBeHidden();
});

test('a narrow desktop window is not told to rotate', async ({ page }, info) => {
  await startGame(page, info);
  await page.setViewportSize({ width: 500, height: 800 });
  await expect(page.locator('#rotate')).toBeHidden();
  expect(await mode(page)).toBe('playing');
});
