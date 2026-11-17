import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type CDPSession, type Locator, type Page, type TestInfo } from '@playwright/test';
import { BASE_URL, BEFORE_LOAD } from '../mobile/src/bridge';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The game object the page exposes for playtests. Loosely typed: the tests reach into its internals. */
export type G = any;
declare global {
  interface Window {
    __surf: G;
    __SURF_TOUCH?: boolean;
    __SURF_NATIVE?: boolean;
  }
}

export const isApp = (info: TestInfo): boolean => info.project.name === 'mobile-app';
export const isTouch = (info: TestInfo): boolean => info.project.name !== 'desktop';

/** Everything that went wrong in the page: script errors and console errors. Tests expect it to stay empty. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/**
 * Open the game and wait until it has loaded.
 * In the mobile-app project this is the single-file build, served at the address the Expo app
 * gives it and with the same start-up script the app injects.
 */
export async function openGame(page: Page, info: TestInfo): Promise<void> {
  if (isApp(info)) {
    const html = readFileSync(path.resolve('mobile', 'generated', 'game.html'), 'utf8');
    await page.route(`${BASE_URL}**`, (route) => route.fulfill({ contentType: 'text/html', body: html }));
    await page.addInitScript(BEFORE_LOAD);
    await page.goto(BASE_URL);
  } else {
    await page.goto('./');
  }
  await page.waitForFunction(() => window.__surf?.debug?.surfer && window.__surf.mode === 'ready', null, { timeout: 60_000 });
}

/**
 * Open the game, press the start button and take over the clock: from here the game only moves
 * when a test calls `sim`, so results do not depend on how fast the test machine is.
 */
export async function startGame(page: Page, info: TestInfo, options: { draw?: boolean } = {}): Promise<void> {
  await openGame(page, info);
  // Drawing 3D in software is slow and most tests do not look at the picture, so they skip
  // it. Everything else in a frame (HUD, touch controls, camera) still runs.
  if (!options.draw) {
    await page.evaluate(() => {
      window.__surf.renderer.render = () => {};
    });
  }
  if (isTouch(info)) await page.locator('#overlay-button').tap();
  else await page.locator('#overlay-button').click();
  await expect.poll(() => mode(page)).toBe('playing');
  // In a phone browser the start button also asks for fullscreen. Let that finish first, so
  // the switch does not land in the middle of a test.
  if (info.project.name === 'phone') {
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  }
  await page.evaluate(() => {
    window.__surf.advance = () => {};
  });
}

export const mode = (page: Page): Promise<string> => page.evaluate(() => window.__surf.mode);

/** Run the game forward by `seconds` of game time. */
export const sim = (page: Page, seconds: number): Promise<void> => page.evaluate((s) => window.__surf.simulate(s), seconds);

export interface Snapshot {
  mode: string;
  state: string;
  x: number;
  y: number;
  z: number;
  speed: number;
  trick: string | null;
  total: number;
  pot: number;
  keys: string[];
  mouseDown: boolean;
}

const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'Space', 'ShiftLeft', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export const snap = (page: Page): Promise<Snapshot> =>
  page.evaluate((keys) => {
    const g = window.__surf;
    const d = g.debug;
    const s = d.surfer;
    return {
      mode: g.mode,
      state: s.state,
      x: s.pos.x,
      y: s.pos.y,
      z: s.pos.z,
      speed: s.speed,
      trick: s.trick,
      total: g.score.total,
      pot: g.score.pot,
      keys: keys.filter((k) => d.input.isDown(k)),
      mouseDown: d.input.mouseDown,
    };
  }, KEYS);

/** Names of the events the surfer has produced since the last call (trick, land, wipeout, ...). */
export const takeLog = (page: Page): Promise<any[]> => page.evaluate(() => window.__surf.log.splice(0));

/** Put the surfer in the water at the lineup, lying on the board. */
export const toPaddle = (page: Page): Promise<void> => page.evaluate(() => window.__surf.debug.surfer.placeInWater());

/** Wait (in game time) until a wave can be caught. Returns false if none came. */
export const waitForWave = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const g = window.__surf;
    const s = g.debug.surfer;
    for (let n = 0; n < 900 && !s.canPopUp; n++) g.simulate(0.05);
    if (s.canPopUp) g.simulate(0.25);
    return s.canPopUp;
  });

/** Paddle out, wait for a wave and pop up, using keys set straight on the game's input. */
export async function toSurf(page: Page): Promise<void> {
  await toPaddle(page);
  await page.evaluate(() => {
    const g = window.__surf;
    const i = g.debug.input;
    i.setKey('KeyW', true);
    g.simulate(5.2);
    i.setKey('KeyW', false);
  });
  expect(await waitForWave(page), 'a wave arrives').toBe(true);
  await page.evaluate(() => {
    const g = window.__surf;
    const i = g.debug.input;
    i.setKey('Space', true);
    g.simulate(0.02);
    i.setKey('Space', false);
    g.simulate(1.5);
  });
  expect((await snap(page)).state).toBe('surf');
}

/** Throw the surfer into the air from wherever they are. */
export const toAir = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const s = window.__surf.debug.surfer;
    const fx = s.forwardX;
    const fz = s.forwardZ;
    const v = Math.max(s.speed, 10);
    s.pos.y += 4;
    s.setState('air');
    s.vy = 14;
    s.airVX = fx * v;
    s.airVZ = fz * v;
  });

/** Walk-state only: step well away from the shop counter (the game starts right next to it). */
export const leaveShop = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const g = window.__surf;
    const land = g.level.land;
    const s = g.debug.surfer;
    // Straight on from the shop through the spawn point, which stays on the pier deck.
    s.pos.x = land.spawn.x + (land.spawn.x - land.shop.x) * 2.5;
    s.pos.z = land.spawn.z + (land.spawn.z - land.shop.z) * 2.5;
    g.simulate(0.2);
  });

/** Give the player points, in the score and in the save. */
export const givePoints = (page: Page, points: number): Promise<void> =>
  page.evaluate((p) => {
    const g = window.__surf;
    g.score.total = p;
    g.debug.save.points = p;
  }, points);

/** The save as the browser has stored it, or null. */
export const storedSave = (page: Page): Promise<any | null> =>
  page.evaluate(() => {
    const raw = localStorage.getItem('surf-game.save.v1');
    return raw ? JSON.parse(raw) : null;
  });

// ---------------------------------------------------------------------------------- touch

/**
 * Real multi-touch, sent through the browser's own input pipeline, so the page sees exactly
 * what it would from fingers on glass: touch events and the pointer events made from them.
 */
export class Fingers {
  private points = new Map<number, { x: number; y: number }>();
  private constructor(private cdp: CDPSession) {}

  static async on(page: Page): Promise<Fingers> {
    return new Fingers(await page.context().newCDPSession(page));
  }

  private send(type: 'touchStart' | 'touchMove'): Promise<unknown> {
    const touchPoints = [...this.points].map(([id, p]) => ({ id, x: Math.round(p.x), y: Math.round(p.y) }));
    return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }

  async down(id: number, x: number, y: number): Promise<void> {
    this.points.set(id, { x, y });
    await this.send('touchStart');
  }

  async move(id: number, x: number, y: number): Promise<void> {
    this.points.set(id, { x, y });
    await this.send('touchMove');
  }

  async up(id: number): Promise<void> {
    const p = this.points.get(id);
    if (!p) return;
    this.points.delete(id);
    // An "end" names the finger that lifted; the others stay down.
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id, x: Math.round(p.x), y: Math.round(p.y) }] });
  }

  /** Put a finger on the middle of an element and leave it there. */
  async press(id: number, target: Locator): Promise<void> {
    const c = await centre(target);
    await this.down(id, c.x, c.y);
  }

  async tap(id: number, target: Locator): Promise<void> {
    await this.press(id, target);
    await this.up(id);
  }
}

export async function centre(target: Locator): Promise<{ x: number; y: number; r: number }> {
  const box = await target.boundingBox();
  if (!box) {
    const why = await target.page().evaluate(() => ({ mode: window.__surf?.mode, w: innerWidth, h: innerHeight, fs: !!document.fullscreenElement, hidden: document.hidden, touchClass: document.getElementById('touch')?.className }));
    throw new Error(`element is not on screen: ${JSON.stringify(why)}`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, r: box.width / 2 };
}

export const btn = (page: Page, id: string): Locator => page.locator(`.touch-btn[data-btn="${id}"]`);

/** The labels of the action buttons showing right now, sorted. */
export const shownButtons = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#touch:not(.hidden) .touch-btn[data-btn]:not(.hidden)')].map((b) => b.dataset.btn!).sort(),
  );

export interface Box {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** On-screen rectangles of every visible element matching the selectors. */
export const boxes = (page: Page, selectors: string[]): Promise<Box[]> =>
  page.evaluate((sels) => {
    const out: Box[] = [];
    for (const sel of sels) {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
        if (el.closest('.hidden')) continue;
        out.push({ name: el.dataset.btn ? `${sel}:${el.dataset.btn}` : sel, x: r.x, y: r.y, width: r.width, height: r.height });
      }
    }
    return out;
  }, selectors);

export const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Every pair of boxes that overlap, as "a / b" strings. Empty is good. */
export function overlapping(list: Box[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (overlaps(list[i], list[j])) out.push(`${list[i].name} / ${list[j].name}`);
  return out;
}

/** Boxes that stick out of the screen. Empty is good. */
export function offScreen(list: Box[], width: number, height: number): string[] {
  return list.filter((b) => b.x < 0 || b.y < 0 || b.x + b.width > width + 0.5 || b.y + b.height > height + 0.5).map((b) => b.name);
}
