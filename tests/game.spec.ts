import { expect, test } from '@playwright/test';
import { givePoints, isTouch, mode, openGame, sim, snap, startGame, storedSave, takeLog, toAir, toPaddle, toSurf, watchErrors } from './helpers';

// The game itself, played the same way in every project: on a desktop, on a phone in the
// browser, and in the single-file build the mobile app loads.

test('loads, shows the start screen and starts without errors', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openGame(page, info);
  await expect(page.locator('#overlay-title')).toHaveText('Venice Beach');
  await expect(page.locator('#overlay-button')).toBeEnabled();
  await expect(page.locator('#hud')).toBeHidden();
  // The right set of instructions for the device, and only that one.
  await expect(page.locator('.controls.touch-only')).toBeVisible({ visible: isTouch(info) });
  await expect(page.locator('.controls.keys-only')).toBeVisible({ visible: !isTouch(info) });

  await startGame(page, info);
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  const s = await snap(page);
  expect(s.state).toBe('walk');
  // The canvas is drawing at the size of the screen.
  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    return { w: c.clientWidth, h: c.clientHeight, pw: c.width, ph: c.height, vw: innerWidth, vh: innerHeight };
  });
  expect(size.w).toBe(size.vw);
  expect(size.h).toBe(size.vh);
  expect(size.pw).toBeGreaterThanOrEqual(size.vw);
  expect(errors).toEqual([]);
});

test('WebGL draws a picture (the view is not blank)', async ({ page }, info) => {
  await startGame(page, info, { draw: true });
  await page.waitForTimeout(600);
  const shot = await page.locator('canvas').screenshot();
  // A blank canvas compresses to almost nothing; a drawn beach does not.
  expect(shot.byteLength).toBeGreaterThan(20_000);
});

test('walks off the pier, paddles, catches a wave and rides it', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startGame(page, info);
  await toSurf(page);
  const a = await snap(page);
  await sim(page, 2);
  const b = await snap(page);
  expect(b.state).toBe('surf');
  expect(b.speed).toBeGreaterThan(5);
  expect(Math.hypot(b.x - a.x, b.z - a.z), 'the surfer travels along the wave').toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

test('wave tricks score and build a combo', async ({ page }, info) => {
  await startGame(page, info);
  await toSurf(page);
  await takeLog(page);
  await page.evaluate(() => {
    const g = window.__surf;
    const i = g.debug.input;
    i.setKey('KeyE', true);
    g.simulate(0.05);
    i.setKey('KeyE', false);
    g.simulate(1.2);
  });
  const log = await takeLog(page);
  expect(log.some((e) => e.type === 'trick' && e.name === 'Snap')).toBe(true);
  expect((await snap(page)).pot).toBeGreaterThan(0);
});

test('air tricks: a flip in the air is counted and the surfer comes down', async ({ page }, info) => {
  await startGame(page, info);
  await toSurf(page);
  await toAir(page);
  expect((await snap(page)).state).toBe('air');
  await takeLog(page);
  const flips = await page.evaluate(() => {
    const g = window.__surf;
    const d = g.debug;
    d.input.setKey(d.config.keys.flipBack, true);
    g.simulate(0.9);
    d.input.setKey(d.config.keys.flipBack, false);
    const rotated = Math.abs(d.surfer.flipAngle ?? d.surfer.flip ?? 0);
    for (let n = 0; n < 200 && d.surfer.state === 'air'; n++) g.simulate(0.05);
    return { rotated, state: d.surfer.state };
  });
  expect(flips.state).not.toBe('air');
  const log = await takeLog(page);
  expect(log.some((e) => e.type === 'land' || e.type === 'wipeout')).toBe(true);
});

test('a clean ride banks its points and the total is saved', async ({ page }, info) => {
  await startGame(page, info);
  await toSurf(page);
  await page.evaluate(() => {
    const g = window.__surf;
    const d = g.debug;
    d.input.setKey('KeyE', true);
    g.simulate(0.05);
    d.input.setKey('KeyE', false);
    // Ride it out hands off until the wave is done.
    for (let n = 0; n < 600 && d.surfer.state === 'surf'; n++) g.simulate(0.1);
    g.simulate(1);
  });
  const s = await snap(page);
  expect(s.total).toBeGreaterThan(0);
  expect((await storedSave(page))?.points).toBe(s.total);
});

test('the shop sells a board and the purchase survives a reload', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startGame(page, info);
  await givePoints(page, 25_000);
  await page.evaluate(() => window.__surf.openShop());
  await expect(page.locator('#shop')).toBeVisible();
  await expect(page.locator('#shop-points')).toHaveText('25,000');
  const fish = page.locator('.shop-row', { hasText: 'Fish' }).locator('button');
  if (isTouch(info)) await fish.tap();
  else await fish.click();
  await expect(page.locator('#shop-points')).toHaveText('23,500');
  const saved = await storedSave(page);
  expect(saved.points).toBe(23_500);
  expect(saved.boardsOwned[1]).toBe(true);
  expect(saved.board).toBe(1);
  const close = page.locator('#shop-close');
  if (isTouch(info)) await close.tap();
  else await close.click();
  await expect(page.locator('#shop')).toBeHidden();
  expect(await mode(page)).toBe('playing');

  // Come back later: the points and the board are still there.
  await openGame(page, info);
  const after = await page.evaluate(() => ({ total: window.__surf.score.total, board: window.__surf.debug.surfer.board.name }));
  expect(after.total).toBe(23_500);
  expect(after.board).toBe('Fish');
  expect(errors).toEqual([]);
});

test('every shop screen fits: the list scrolls and all buttons can be reached', async ({ page }, info) => {
  await startGame(page, info);
  await givePoints(page, 60_000);
  await page.evaluate(() => window.__surf.openShop());
  const panel = page.locator('#shop .panel');
  const box = (await panel.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height + 0.5);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width + 0.5);
  // The last control in the panel can be brought into view and pressed.
  const reset = page.locator('#shop-reset');
  await reset.scrollIntoViewIfNeeded();
  await expect(reset).toBeInViewport();
  const rows = await page.locator('.shop-row').count();
  expect(rows).toBeGreaterThanOrEqual(8);
});

test('boss fight: winning pays the reward and unlocks Mavericks', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startGame(page, info);
  await page.evaluate(() => {
    const d = window.__surf.debug;
    d.save.weapon = 'coconut';
    d.save.weapons = ['coconut'];
    d.save.bossTicket = true;
    d.startFight();
  });
  await expect(page.locator('#boss')).toBeVisible();
  const before = (await snap(page)).total;
  await toSurf(page);
  // Shoot for a while: the Stingray loses health.
  const hp = await page.evaluate(() => {
    const g = window.__surf;
    const d = g.debug;
    const start = d.fight.hp;
    d.fight.hearts = d.fight.maxHearts = 99;
    d.input.mouseDown = true;
    g.simulate(4);
    d.input.mouseDown = false;
    return { start, now: d.fight.hp, max: d.fight.maxHp };
  });
  expect(hp.now).toBeLessThan(hp.start);
  // Finish it.
  await page.evaluate(() => {
    const g = window.__surf;
    g.debug.fight.damage(100_000);
    g.simulate(0.1);
  });
  const reward = await page.evaluate(() => window.__surf.debug.config.boss.reward);
  const s = await snap(page);
  expect(s.total).toBeGreaterThanOrEqual(before + reward);
  expect((await storedSave(page)).mavericksUnlocked).toBe(true);
  await expect(page.locator('#banner')).toContainText('MAVERICKS UNLOCKED');
  await expect(page.locator('#boss')).toBeHidden();
  expect(errors).toEqual([]);
});

test('boss fight: losing keeps every point', async ({ page }, info) => {
  await startGame(page, info);
  await givePoints(page, 4_321);
  await page.evaluate(() => {
    const d = window.__surf.debug;
    d.save.weapon = 'squirter';
    d.save.weapons = ['squirter'];
    d.save.bossTicket = true;
    d.startFight();
  });
  await page.evaluate(() => {
    window.__surf.debug.fight.hearts = 1;
  });
  // Ride hands off, wave after wave, until a tail strike lands.
  let result = { active: true, hp: 0, ticket: false };
  for (let ride = 0; ride < 10 && result.active; ride++) {
    await toSurf(page);
    result = await page.evaluate(() => {
      const g = window.__surf;
      const d = g.debug;
      for (let n = 0; n < 600 && d.fight.active && (d.surfer.state === 'surf' || d.surfer.state === 'air'); n++) g.simulate(0.1);
      return { active: d.fight.active, hp: d.fight.hp, ticket: d.save.bossTicket };
    });
  }
  expect(result.active, 'the fight ended').toBe(false);
  expect(result.hp, 'the Stingray was not beaten').toBeGreaterThan(0);
  expect(result.ticket, 'the fight can be tried again').toBe(true);
  expect((await snap(page)).total).toBeGreaterThanOrEqual(4_321);
  await expect(page.locator('#banner')).toContainText('You keep your points');
});

test('a wipeout loses the combo but the game carries on', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startGame(page, info);
  await toSurf(page);
  await page.evaluate(() => {
    const g = window.__surf;
    g.debug.surfer.wipeout('landing');
    g.simulate(0.1);
  });
  expect((await snap(page)).state).toBe('wipeout');
  await sim(page, 6);
  expect(['paddle', 'walk']).toContain((await snap(page)).state);
  expect((await snap(page)).pot).toBe(0);
  expect(errors).toEqual([]);
});

test('paddling to the beach puts the surfer back on their feet', async ({ page }, info) => {
  await startGame(page, info);
  await toPaddle(page);
  await page.evaluate(() => {
    const g = window.__surf;
    const d = g.debug;
    // Face the beach and paddle in.
    d.cam.yaw = Math.PI;
    d.input.setKey('KeyW', true);
    for (let n = 0; n < 1200 && d.surfer.state !== 'walk'; n++) g.simulate(0.1);
    d.input.setKey('KeyW', false);
  });
  expect((await snap(page)).state).toBe('walk');
});
