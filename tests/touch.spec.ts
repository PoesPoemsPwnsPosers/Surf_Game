import { expect, test, type Page } from '@playwright/test';
import { Fingers, boxes, btn, centre, leaveShop, mode, offScreen, overlapping, shownButtons, sim, snap, startGame, takeLog, toAir, toPaddle, toSurf, waitForWave, watchErrors } from './helpers';

// The game played with fingers: on a phone in the browser, and in the build the app loads.
// Touches go through the browser's real input pipeline (see Fingers in helpers.ts).

const stick = (page: Page) => page.locator('#touch-stick');

/** Push the stick to (dx, dy) as fractions of its reach, x right and y up. */
async function pushStick(page: Page, fingers: Fingers, id: number, dx: number, dy: number): Promise<void> {
  const c = await centre(stick(page));
  await fingers.down(id, c.x, c.y);
  await fingers.move(id, c.x + dx * c.r * 0.9, c.y - dy * c.r * 0.9);
}

test('touch layout is on: stick, buttons and pause, and no keyboard hints', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startGame(page, info);
  await expect(page.locator('body')).toHaveClass(/touch/);
  await expect(stick(page)).toBeVisible();
  await expect(page.locator('#touch-pause')).toBeVisible();
  await expect(page.locator('#hint')).toBeHidden();
  await expect(page.locator('#rotate')).toBeHidden();
  expect(errors).toEqual([]);
});

test('each state shows exactly its own buttons, with the right labels', async ({ page }, info) => {
  await startGame(page, info);
  // The game starts next to the shop counter, so SHOP is on offer straight away.
  await expect.poll(() => shownButtons(page)).toEqual(['jump', 'shift', 'shop']);
  await leaveShop(page);
  await expect.poll(() => shownButtons(page)).toEqual(['jump', 'shift']);
  await expect(btn(page, 'jump')).toHaveText('HOP');
  await expect(btn(page, 'shift')).toHaveText('RUN');

  await toPaddle(page);
  await expect.poll(() => shownButtons(page)).toEqual(['jump', 'shift']);
  await expect(btn(page, 'jump')).toHaveText('POP UP');
  await expect(btn(page, 'shift')).toHaveText('SPRINT');

  await toSurf(page);
  await expect.poll(() => shownButtons(page)).toEqual(['cut', 'jump', 'shift', 'snap']);
  await expect(btn(page, 'jump')).toHaveText('JUMP');
  await expect(btn(page, 'shift')).toHaveText('PUMP');

  await toAir(page);
  await expect.poll(() => shownButtons(page)).toEqual(['flip-back', 'flip-front', 'grab', 'jump', 'spin-left', 'spin-right']);
  await expect(btn(page, 'jump')).toHaveText('KICK');

  // A booster from the shop adds the BOOST button in the air.
  await page.evaluate(() => {
    const s = window.__surf.debug.surfer;
    s.boosterLevel = 1;
    s.refillBooster();
  });
  await expect.poll(() => shownButtons(page)).toEqual(['flip-back', 'flip-front', 'grab', 'jump', 'shift', 'spin-left', 'spin-right']);
  await expect(btn(page, 'shift')).toHaveText('BOOST');
});

test('the stick drives W A S D in all eight directions and lets go when released', async ({ page }, info) => {
  await startGame(page, info);
  const fingers = await Fingers.on(page);
  const cases: [number, number, string[]][] = [
    [0, 1, ['KeyW']],
    [0, -1, ['KeyS']],
    [-1, 0, ['KeyA']],
    [1, 0, ['KeyD']],
    [0.7, 0.7, ['KeyD', 'KeyW']],
    [-0.7, 0.7, ['KeyA', 'KeyW']],
    [0.7, -0.7, ['KeyD', 'KeyS']],
    [-0.7, -0.7, ['KeyA', 'KeyS']],
  ];
  for (const [dx, dy, keys] of cases) {
    await pushStick(page, fingers, 1, dx, dy);
    expect((await snap(page)).keys.sort(), `stick at ${dx},${dy}`).toEqual(keys);
    await fingers.up(1);
    expect((await snap(page)).keys, 'released').toEqual([]);
  }
  // A light touch inside the dead zone does nothing.
  await pushStick(page, fingers, 1, 0.1, 0.1);
  expect((await snap(page)).keys).toEqual([]);
  await fingers.up(1);
  // Sliding from one direction to another swaps the keys without lifting.
  await pushStick(page, fingers, 1, 0, 1);
  const c = await centre(stick(page));
  await fingers.move(1, c.x + c.r * 0.9, c.y);
  expect((await snap(page)).keys).toEqual(['KeyD']);
  // Dragging far outside the stick still works: the finger stays captured.
  await fingers.move(1, c.x + c.r * 4, c.y - c.r * 4);
  expect((await snap(page)).keys.sort()).toEqual(['KeyD', 'KeyW']);
  await fingers.up(1);
  expect((await snap(page)).keys).toEqual([]);
});

test('the stick walks the surfer', async ({ page }, info) => {
  await startGame(page, info);
  const fingers = await Fingers.on(page);
  const a = await snap(page);
  await pushStick(page, fingers, 1, 0, 1);
  await sim(page, 1.5);
  await fingers.up(1);
  const b = await snap(page);
  expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(4);
  await sim(page, 1);
  const c = await snap(page);
  expect(Math.hypot(c.x - b.x, c.z - b.z), 'stops when the stick is released').toBeLessThan(1.5);
});

test('every button holds its key while pressed and releases it after', async ({ page }, info) => {
  await startGame(page, info);
  const fingers = await Fingers.on(page);
  const check = async (id: string, key: string): Promise<void> => {
    await expect(btn(page, id)).toBeVisible();
    await fingers.press(5, btn(page, id));
    expect((await snap(page)).keys, `${id} pressed`).toEqual([key]);
    await expect(btn(page, id)).toHaveClass(/down/);
    await fingers.up(5);
    expect((await snap(page)).keys, `${id} released`).toEqual([]);
    await expect(btn(page, id)).not.toHaveClass(/down/);
  };
  await check('jump', 'Space');
  await check('shift', 'ShiftLeft');
  await toSurf(page);
  await check('cut', 'KeyQ');
  await check('snap', 'KeyE');
  await check('shift', 'ShiftLeft');
  await toAir(page);
  await page.evaluate(() => {
    const s = window.__surf.debug.surfer;
    s.boosterLevel = 2;
    s.refillBooster();
  });
  await check('spin-left', 'ArrowLeft');
  await check('spin-right', 'ArrowRight');
  await check('flip-front', 'ArrowUp');
  await check('flip-back', 'ArrowDown');
  await check('grab', 'KeyF');
  await check('shift', 'ShiftLeft');
  await check('jump', 'Space');
});

test('several fingers at once: stick, two buttons and a look drag', async ({ page }, info) => {
  await startGame(page, info);
  await toSurf(page);
  const fingers = await Fingers.on(page);
  await pushStick(page, fingers, 1, -1, 0);
  await fingers.press(2, btn(page, 'shift'));
  await fingers.press(3, btn(page, 'jump'));
  expect((await snap(page)).keys.sort()).toEqual(['KeyA', 'ShiftLeft', 'Space']);
  const view = page.viewportSize()!;
  await fingers.down(4, view.width / 2, view.height / 2);
  await fingers.move(4, view.width / 2 + 60, view.height / 2);
  expect((await snap(page)).keys.sort(), 'a look drag does not disturb held controls').toEqual(['KeyA', 'ShiftLeft', 'Space']);
  // Lifting one finger leaves the others held.
  await fingers.up(2);
  expect((await snap(page)).keys.sort()).toEqual(['KeyA', 'Space']);
  await fingers.up(1);
  await fingers.up(3);
  await fingers.up(4);
  expect((await snap(page)).keys).toEqual([]);
});

test('a whole wave by touch: paddle out, pop up, carve, trick, jump', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startGame(page, info);
  await toPaddle(page);
  const fingers = await Fingers.on(page);

  // Paddle out with the stick.
  const start = await snap(page);
  await pushStick(page, fingers, 1, 0, 1);
  await sim(page, 5.2);
  await fingers.up(1);
  const out = await snap(page);
  expect(Math.hypot(out.x - start.x, out.z - start.z), 'paddled').toBeGreaterThan(5);

  // Pop up with the button when the wave arrives.
  expect(await waitForWave(page)).toBe(true);
  await expect(page.locator('#prompt')).toHaveText('POP UP!');
  await fingers.press(2, btn(page, 'jump'));
  await sim(page, 0.02);
  await fingers.up(2);
  await sim(page, 1.5);
  expect((await snap(page)).state).toBe('surf');

  // Hang ten: stick up and CUT together.
  await takeLog(page);
  await expect(btn(page, 'cut')).toBeVisible();
  await pushStick(page, fingers, 1, 0, 1);
  await fingers.press(2, btn(page, 'cut'));
  await sim(page, 0.6);
  expect((await snap(page)).trick).toBe('hangTen');
  await fingers.up(2);
  await fingers.up(1);
  await sim(page, 0.8);
  expect((await takeLog(page)).some((e) => e.type === 'trick' && e.name === 'Hang ten')).toBe(true);

  // Carve with the stick: the board turns.
  const h0 = await page.evaluate(() => window.__surf.debug.surfer.heading);
  await pushStick(page, fingers, 1, 1, 0);
  await sim(page, 0.4);
  await fingers.up(1);
  const h1 = await page.evaluate(() => window.__surf.debug.surfer.heading);
  expect(Math.abs(h1 - h0)).toBeGreaterThan(0.05);

  // Jump with the button.
  await fingers.press(2, btn(page, 'jump'));
  await sim(page, 0.03);
  await fingers.up(2);
  await sim(page, 0.15);
  expect((await snap(page)).state).toBe('air');
  expect(errors).toEqual([]);
});

test('air tricks by touch: holding BACK FLIP rotates the surfer', async ({ page }, info) => {
  await startGame(page, info);
  await toSurf(page);
  await toAir(page);
  const fingers = await Fingers.on(page);
  await expect(btn(page, 'flip-back')).toBeVisible();
  const f0 = await page.evaluate(() => window.__surf.debug.surfer.flip);
  await fingers.press(1, btn(page, 'flip-back'));
  await sim(page, 0.5);
  await fingers.up(1);
  const f1 = await page.evaluate(() => window.__surf.debug.surfer.flip);
  expect(Math.abs(f1 - f0)).toBeGreaterThan(0.5);
  // And a spin.
  await toAir(page);
  const s0 = await page.evaluate(() => window.__surf.debug.surfer.spin);
  await fingers.press(1, btn(page, 'spin-right'));
  await sim(page, 0.4);
  await fingers.up(1);
  const s1 = await page.evaluate(() => window.__surf.debug.surfer.spin);
  expect(Math.abs(s1 - s0)).toBeGreaterThan(0.5);
});

test('the booster fires from the BOOST button and drains', async ({ page }, info) => {
  await startGame(page, info);
  await toSurf(page);
  await page.evaluate(() => {
    const s = window.__surf.debug.surfer;
    s.boosterLevel = 3;
    s.refillBooster();
  });
  await toAir(page);
  const fingers = await Fingers.on(page);
  await expect(btn(page, 'shift')).toHaveText('BOOST');
  await sim(page, 0.2);
  const fuel0 = await page.evaluate(() => window.__surf.debug.surfer.boostFuel);
  await fingers.press(1, btn(page, 'shift'));
  await sim(page, 0.5);
  const mid = await page.evaluate(() => ({ fuel: window.__surf.debug.surfer.boostFuel, boosting: window.__surf.debug.surfer.boosting }));
  await fingers.up(1);
  expect(mid.boosting).toBe(true);
  expect(mid.fuel).toBeLessThan(fuel0);
});

test('dragging on the view turns the camera, and a tap does not shoot', async ({ page }, info) => {
  await startGame(page, info);
  const fingers = await Fingers.on(page);
  const view = page.viewportSize()!;
  const yaw0 = await page.evaluate(() => window.__surf.debug.cam.yaw);
  await fingers.down(1, view.width * 0.5, view.height * 0.4);
  for (let i = 1; i <= 6; i++) await fingers.move(1, view.width * 0.5 + i * 20, view.height * 0.4);
  expect((await snap(page)).mouseDown, 'a finger on the view is not the fire button').toBe(false);
  await fingers.up(1);
  await expect.poll(() => page.evaluate(() => window.__surf.debug.cam.yaw)).not.toBe(yaw0);
  const turned = await page.evaluate(() => window.__surf.debug.cam.yaw);
  expect(Math.abs(turned - yaw0)).toBeGreaterThan(0.1);
});

test('the pause button pauses, lets go of everything, and the game resumes', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startGame(page, info);
  const fingers = await Fingers.on(page);
  await pushStick(page, fingers, 1, 0, 1);
  expect((await snap(page)).keys).toEqual(['KeyW']);
  await fingers.tap(2, page.locator('#touch-pause'));
  await expect.poll(() => mode(page)).toBe('paused');
  await expect(page.locator('#overlay-title')).toHaveText('Paused');
  await expect(page.locator('#touch')).toBeHidden();
  await expect.poll(async () => (await snap(page)).keys, { message: 'held controls are dropped' }).toEqual([]);
  await fingers.up(1);
  await page.locator('#overlay-button').tap();
  await expect.poll(() => mode(page)).toBe('playing');
  await expect(stick(page)).toBeVisible();
  // Nothing is stuck after the round trip.
  expect((await snap(page)).keys).toEqual([]);
  expect(errors).toEqual([]);
});

test('the SHOP button appears at the counter, opens the shop, and buying works by tap', async ({ page }, info) => {
  await startGame(page, info);
  await leaveShop(page);
  await expect(btn(page, 'shop')).toBeHidden();
  await page.evaluate(() => {
    const g = window.__surf;
    const spot = g.level.land.shop;
    g.debug.surfer.pos.x = spot.x;
    g.debug.surfer.pos.z = spot.z;
    g.score.total = 9_000;
    g.debug.save.points = 9_000;
  });
  await sim(page, 0.2);
  await expect(btn(page, 'shop')).toBeVisible();
  await expect(page.locator('#prompt')).toContainText('SURF SHOP');
  const fingers = await Fingers.on(page);
  await fingers.press(1, btn(page, 'shop'));
  await sim(page, 0.05);
  await fingers.up(1);
  await expect(page.locator('#shop')).toBeVisible();
  await expect(page.locator('#touch')).toBeHidden();
  expect((await snap(page)).keys, 'the F key is not left held behind the shop').toEqual([]);

  const booster = page.locator('.shop-row', { hasText: 'Booster I' }).first().locator('button');
  await booster.scrollIntoViewIfNeeded();
  await booster.tap();
  await expect(page.locator('#shop-points')).toHaveText('7,000');
  await page.locator('#shop-close').scrollIntoViewIfNeeded();
  await page.locator('#shop-close').tap();
  await expect(page.locator('#shop')).toBeHidden();
  await expect.poll(() => mode(page)).toBe('playing');
  expect(await page.evaluate(() => window.__surf.debug.surfer.boosterLevel)).toBe(1);
});

test('the shop list scrolls under a finger', async ({ page }, info) => {
  await startGame(page, info);
  await page.evaluate(() => window.__surf.openShop());
  const panel = page.locator('#shop .panel');
  await expect(panel).toBeVisible();
  const scrollable = await panel.evaluate((el) => el.scrollHeight > el.clientHeight);
  test.skip(!scrollable, 'the whole shop fits on this screen');
  const box = (await panel.boundingBox())!;
  const fingers = await Fingers.on(page);
  const x = box.x + box.width / 2;
  await fingers.down(1, x, box.y + box.height * 0.8);
  for (let i = 1; i <= 8; i++) await fingers.move(1, x, box.y + box.height * 0.8 - i * 20);
  await fingers.up(1);
  await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(40);
});

test('boss fight by touch: SHOOT appears while riding and damages the Stingray', async ({ page }, info) => {
  await startGame(page, info);
  await page.evaluate(() => {
    const d = window.__surf.debug;
    d.save.weapon = 'trident';
    d.save.weapons = ['trident'];
    d.save.bossTicket = true;
    d.startFight();
    d.fight.hearts = d.fight.maxHearts = 99;
  });
  // Not while paddling.
  await expect.poll(() => shownButtons(page)).toEqual(['jump', 'shift']);
  await toSurf(page);
  await expect(btn(page, 'shoot')).toBeVisible();
  const fingers = await Fingers.on(page);
  const hp0 = await page.evaluate(() => window.__surf.debug.fight.hp);
  await fingers.press(1, btn(page, 'shoot'));
  expect((await snap(page)).mouseDown).toBe(true);
  await sim(page, 3);
  await fingers.up(1);
  expect((await snap(page)).mouseDown).toBe(false);
  expect(await page.evaluate(() => window.__surf.debug.fight.hp)).toBeLessThan(hp0);
  // The fight ends: the button goes away.
  await page.evaluate(() => {
    window.__surf.debug.fight.damage(100_000);
    window.__surf.simulate(0.1);
  });
  await expect(btn(page, 'shoot')).toBeHidden();
});

test('a button that disappears while held lets go of its key', async ({ page }, info) => {
  await startGame(page, info);
  await toSurf(page);
  const fingers = await Fingers.on(page);
  await fingers.press(1, btn(page, 'cut'));
  expect((await snap(page)).keys).toEqual(['KeyQ']);
  // Thrown into the air with the finger still down: CUT is replaced by SPIN.
  await toAir(page);
  await expect(btn(page, 'cut')).toBeHidden();
  await expect.poll(async () => (await snap(page)).keys).toEqual([]);
  await fingers.up(1);
});

test('held upright: asks for a turn and pauses; turned back, it plays', async ({ page }, info) => {
  await startGame(page, info);
  const view = page.viewportSize()!;
  // (The test browser cannot resize a fullscreen window, so leave fullscreen first.)
  if (info.project.name === 'phone') {
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  }
  await page.setViewportSize({ width: view.height, height: view.width });
  await expect(page.locator('#rotate')).toBeVisible();
  await expect.poll(() => mode(page)).toBe('paused');
  await page.setViewportSize(view);
  await expect(page.locator('#rotate')).toBeHidden();
  await page.locator('#overlay-button').tap();
  await expect.poll(() => mode(page)).toBe('playing');
  const size = await page.evaluate(() => ({ w: document.querySelector('canvas')!.clientWidth, vw: innerWidth }));
  expect(size.w).toBe(size.vw);
});

// Nothing on screen may sit on top of anything else, on small phones, big phones and tablets.
const SCREENS = [
  { name: 'small phone 667x375', width: 667, height: 375 },
  { name: 'phone 844x390', width: 844, height: 390 },
  { name: 'large phone 932x430', width: 932, height: 430 },
  { name: 'narrow tall phone 915x412', width: 915, height: 412 },
  { name: 'tablet 1180x820', width: 1180, height: 820 },
];
const HUD = ['#set-timer', '#score', '#speed', '#board', '#touch-pause', '#touch-stick', '.touch-btn[data-btn]', '#boss.on'];

for (const screen of SCREENS) {
  test(`layout on a ${screen.name}: controls and readouts do not overlap or leave the screen`, async ({ page }, info) => {
    await page.setViewportSize(screen);
    await startGame(page, info);
    await page.evaluate(() => {
      const d = window.__surf.debug;
      d.save.weapon = 'trident';
      d.save.weapons = ['trident'];
      d.save.bossTicket = true;
      d.save.health = 3;
      d.surfer.boosterLevel = 3;
      d.surfer.refillBooster();
      d.startFight();
      d.fight.hearts = d.fight.maxHearts = 99;
    });
    const check = async (label: string, count: number): Promise<void> => {
      await expect.poll(async () => (await shownButtons(page)).length, { message: label }).toBe(count);
      const list = await boxes(page, HUD);
      expect(overlapping(list), `${label}: overlapping`).toEqual([]);
      expect(offScreen(list, screen.width, screen.height), `${label}: off screen`).toEqual([]);
      // Buttons are big enough for a thumb.
      for (const b of list.filter((x) => x.name.startsWith('.touch-btn'))) expect(b.width, b.name).toBeGreaterThanOrEqual(44);
    };
    await check('paddling', 2);
    await toSurf(page);
    await check('surfing', 5);
    await toAir(page);
    await check('in the air', 8);
  });
}

test('in a phone browser, starting the game asks for fullscreen', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-app', 'the app is already fullscreen and must not ask');
  await startGame(page, info);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
});
