import { expect, test } from '@playwright/test';
import { BASE_URL, BEFORE_LOAD, PAUSE, isGameUrl } from '../mobile/src/bridge';
import { givePoints, mode, openGame, startGame, storedSave, watchErrors } from './helpers';

// The mobile app is a web view around a single HTML file. These tests load that exact file,
// at the address the app gives it and with the scripts the app injects, in a phone-sized
// touch browser. (Android's web view is the same Chromium engine used here.)

test('the single file needs nothing from the network', async ({ page }, info) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  const errors = watchErrors(page);
  await startGame(page, info);
  await page.waitForTimeout(500);
  expect(requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([BASE_URL]);
  expect(errors).toEqual([]);
});

test('the app switches touch controls on, even where the browser reports a mouse', async ({ page }, info) => {
  await openGame(page, info);
  expect(await page.evaluate(() => [window.__SURF_TOUCH, window.__SURF_NATIVE])).toEqual([true, true]);
  await expect(page.locator('body')).toHaveClass(/touch/);
});

test('the app does not try to go fullscreen itself', async ({ page }, info) => {
  await startGame(page, info);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});

test('the pause script pauses a running game and is harmless otherwise', async ({ page }, info) => {
  // Before the game exists.
  await page.goto('about:blank');
  expect(await page.evaluate(PAUSE)).toBe(true);
  // On the start screen: nothing to pause, no error.
  await openGame(page, info);
  expect(await page.evaluate(PAUSE)).toBe(true);
  expect(await mode(page)).toBe('ready');
  // While playing.
  await page.locator('#overlay-button').tap();
  await expect.poll(() => mode(page)).toBe('playing');
  expect(await page.evaluate(PAUSE)).toBe(true);
  expect(await mode(page)).toBe('paused');
  // Twice in a row is fine.
  expect(await page.evaluate(PAUSE)).toBe(true);
  expect(await mode(page)).toBe('paused');
});

test('the start-up script is a valid statement that ends in true', async ({ page }) => {
  await page.goto('about:blank');
  expect(await page.evaluate(BEFORE_LOAD)).toBe(true);
});

test('the save is kept between runs of the app', async ({ page }, info) => {
  await startGame(page, info);
  await givePoints(page, 777);
  await page.evaluate(() => window.__surf.persist());
  expect((await storedSave(page)).points).toBe(777);
  expect(await page.evaluate(() => location.origin)).toBe(new URL(BASE_URL).origin);
  await openGame(page, info);
  expect(await page.evaluate(() => window.__surf.score.total)).toBe(777);
});

test('only the game page may load in the web view', () => {
  expect(isGameUrl(BASE_URL)).toBe(true);
  expect(isGameUrl(`${BASE_URL}#x`)).toBe(true);
  expect(isGameUrl('about:blank')).toBe(true);
  expect(isGameUrl('https://example.com/')).toBe(false);
  expect(isGameUrl('http://surf-game.app.local/')).toBe(false);
  expect(isGameUrl('https://surf-game.app.local.evil.example/')).toBe(false);
  expect(isGameUrl('intent://x')).toBe(false);
});
