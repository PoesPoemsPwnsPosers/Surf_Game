import { CONFIG } from '../config';
import type { Input } from '../core/input';
import type { SurferState } from '../player/surfer';

/** What the touch controls need to know each frame to show the right buttons. */
export interface TouchContext {
  playing: boolean;
  state: SurferState;
  fighting: boolean;
  atShop: boolean;
  hasBooster: boolean;
}

type Show = (c: TouchContext) => string | null;

interface ButtonDef {
  id: string;
  /** Key the button holds down (a `KeyboardEvent.code`), or 'shoot' for the fire button. */
  code: string;
  /** Column from the right edge and row from the bottom, in button-sized steps. */
  col: number;
  row: number;
  /** The label to show now, or null to hide the button. */
  show: Show;
  kind?: 'main' | 'fire';
}

const riding = (c: TouchContext): boolean => c.state === 'surf' || c.state === 'air';

/**
 * One button per action, laid out in a grid at the bottom right. Each maps to the same key the
 * keyboard uses, so the game itself does not know or care that it is being played by touch.
 */
const BUTTONS: ButtonDef[] = [
  {
    id: 'jump',
    code: 'Space',
    col: 0,
    row: 0,
    kind: 'main',
    show: (c) => ({ walk: 'HOP', paddle: 'POP UP', surf: 'JUMP', air: 'KICK', wipeout: null })[c.state],
  },
  {
    id: 'shift',
    code: 'ShiftLeft',
    col: 1,
    row: 0,
    show: (c) =>
      c.state === 'air' ? (c.hasBooster ? 'BOOST' : null) : ({ walk: 'RUN', paddle: 'SPRINT', surf: 'PUMP', wipeout: null })[c.state],
  },
  { id: 'snap', code: 'KeyE', col: 0, row: 1, show: (c) => (c.state === 'surf' ? 'SNAP' : null) },
  { id: 'cut', code: 'KeyQ', col: 1, row: 1, show: (c) => (c.state === 'surf' ? 'CUT' : null) },
  { id: 'spin-right', code: CONFIG.keys.spinRight, col: 0, row: 1, show: (c) => (c.state === 'air' ? 'SPIN ⟳' : null) },
  { id: 'spin-left', code: CONFIG.keys.spinLeft, col: 1, row: 1, show: (c) => (c.state === 'air' ? '⟲ SPIN' : null) },
  { id: 'flip-back', code: CONFIG.keys.flipBack, col: 0, row: 2, show: (c) => (c.state === 'air' ? 'BACK FLIP' : null) },
  { id: 'flip-front', code: CONFIG.keys.flipForward, col: 1, row: 2, show: (c) => (c.state === 'air' ? 'FRONT FLIP' : null) },
  { id: 'grab', code: 'KeyF', col: 2, row: 0, show: (c) => (c.state === 'air' ? 'GRAB' : null) },
  { id: 'shop', code: 'KeyF', col: 2, row: 0, show: (c) => (c.state === 'walk' && c.atShop ? 'SHOP' : null) },
  { id: 'shoot', code: 'shoot', col: 2, row: 1, kind: 'fire', show: (c) => (c.fighting && riding(c) ? 'SHOOT' : null) },
];

/** The four keys the stick drives, and which way each one points (x right, y up). */
const STICK_KEYS: [code: string, x: number, y: number][] = [
  ['KeyW', 0, 1],
  ['KeyS', 0, -1],
  ['KeyA', -1, 0],
  ['KeyD', 1, 0],
];

/** True when the game should start with touch controls showing. */
export function wantsTouch(): boolean {
  const w = window as unknown as { __SURF_TOUCH?: boolean };
  if (w.__SURF_TOUCH) return true;
  const q = new URLSearchParams(location.search).get('touch');
  if (q !== null) return q !== '0';
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/**
 * On-screen controls for phones and tablets: a stick on the left, action buttons on the right,
 * drag anywhere else to look around, and a pause button. Everything is turned into the same
 * key presses and look movement the keyboard and mouse produce.
 */
export class TouchControls {
  enabled = false;
  private root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickPointer: number | null = null;
  private stickHeld = new Set<string>();
  private lookPointer: number | null = null;
  private lookX = 0;
  private lookY = 0;
  private buttons: { def: ButtonDef; el: HTMLElement; pointer: number | null; label: string | null }[] = [];
  private shootHeld = false;
  private active = false;

  constructor(
    private input: Input,
    canvas: HTMLCanvasElement,
    onPause: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.className = 'hidden';

    this.stick = document.createElement('div');
    this.stick.id = 'touch-stick';
    this.knob = document.createElement('div');
    this.knob.id = 'touch-knob';
    this.stick.appendChild(this.knob);
    this.root.appendChild(this.stick);

    const pause = document.createElement('div');
    pause.id = 'touch-pause';
    pause.className = 'touch-btn';
    pause.textContent = 'II';
    pause.setAttribute('role', 'button');
    pause.setAttribute('aria-label', 'Pause');
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPause();
    });
    this.root.appendChild(pause);

    for (const def of BUTTONS) {
      const el = document.createElement('div');
      el.className = `touch-btn hidden${def.kind ? ` ${def.kind}` : ''}`;
      el.dataset.btn = def.id;
      el.style.setProperty('--col', String(def.col));
      el.style.setProperty('--row', String(def.row));
      el.setAttribute('role', 'button');
      const entry = { def, el, pointer: null as number | null, label: null as string | null };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (entry.pointer !== null) return;
        entry.pointer = e.pointerId;
        this.capture(el, e.pointerId);
        this.press(entry.def, true);
        el.classList.add('down');
      });
      const up = (e: PointerEvent): void => {
        if (entry.pointer !== e.pointerId) return;
        this.release(entry);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      this.buttons.push(entry);
      this.root.appendChild(el);
    }
    document.body.appendChild(this.root);

    // ---- Stick.
    this.stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.stickPointer !== null) return;
      this.stickPointer = e.pointerId;
      this.capture(this.stick, e.pointerId);
      this.moveStick(e);
    });
    this.stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickPointer) this.moveStick(e);
    });
    const stickUp = (e: PointerEvent): void => {
      if (e.pointerId === this.stickPointer) this.centreStick();
    };
    this.stick.addEventListener('pointerup', stickUp);
    this.stick.addEventListener('pointercancel', stickUp);
    this.stick.addEventListener('lostpointercapture', stickUp);

    // ---- Look: drag a finger on the game view itself.
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.pointerType === 'mouse' || this.lookPointer !== null) return;
      this.lookPointer = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookPointer) return;
      const k = CONFIG.touch.lookScale;
      this.input.addLook((e.clientX - this.lookX) * k, (e.clientY - this.lookY) * k);
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    });
    const lookUp = (e: PointerEvent): void => {
      if (e.pointerId === this.lookPointer) this.lookPointer = null;
    };
    canvas.addEventListener('pointerup', lookUp);
    canvas.addEventListener('pointercancel', lookUp);
    // Stop the browser turning touches into scrolls, zooms, text selection or a long-press menu.
    for (const type of ['touchstart', 'touchmove'] as const) {
      canvas.addEventListener(type, (e) => this.enabled && e.preventDefault(), { passive: false });
      this.root.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll());

    if (wantsTouch()) this.enable();
    // A touch on a device we took for a desktop (a laptop with a touch screen) switches them on.
    else window.addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

  /** Show the touch controls and switch the page to its touch layout. */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add('touch');
  }

  /** Show the buttons that apply right now. Call once a frame. */
  update(c: TouchContext): void {
    if (!this.enabled) return;
    if (c.playing !== this.active) {
      this.active = c.playing;
      this.root.classList.toggle('hidden', !c.playing);
      if (!c.playing) this.releaseAll();
    }
    if (!c.playing) return;
    for (const b of this.buttons) {
      const label = b.def.show(c);
      if (label === b.label) continue;
      b.label = label;
      if (label === null) {
        if (b.pointer !== null) this.release(b);
        b.el.classList.add('hidden');
      } else {
        b.el.textContent = label;
        b.el.classList.remove('hidden');
      }
    }
  }

  private capture(el: HTMLElement, pointerId: number): void {
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* The pointer is already gone. The up handlers still run. */
    }
  }

  private press(def: ButtonDef, down: boolean): void {
    if (def.code === 'shoot') {
      this.shootHeld = down;
      this.input.mouseDown = down;
    } else {
      this.input.setKey(def.code, down);
    }
  }

  private release(b: { def: ButtonDef; el: HTMLElement; pointer: number | null }): void {
    if (b.pointer === null) return;
    b.pointer = null;
    b.el.classList.remove('down');
    // Two buttons can share a key (grab and shop are both F): only let go when neither is held.
    const shared = this.buttons.some((o) => o !== b && o.pointer !== null && o.def.code === b.def.code);
    if (!shared) this.press(b.def, false);
  }

  private moveStick(e: PointerEvent): void {
    const r = this.stick.getBoundingClientRect();
    const reach = r.width / 2;
    let x = (e.clientX - (r.left + reach)) / reach;
    let y = -(e.clientY - (r.top + reach)) / reach;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.knob.style.transform = `translate(${(x * reach * 0.62).toFixed(1)}px, ${(-y * reach * 0.62).toFixed(1)}px)`;
    this.stick.classList.add('down');
    const dead = CONFIG.touch.stickDeadzone;
    for (const [code, kx, ky] of STICK_KEYS) this.holdStickKey(code, x * kx + y * ky > dead);
  }

  private holdStickKey(code: string, down: boolean): void {
    if (down === this.stickHeld.has(code)) return;
    if (down) this.stickHeld.add(code);
    else this.stickHeld.delete(code);
    this.input.setKey(code, down);
  }

  private centreStick(): void {
    this.stickPointer = null;
    this.knob.style.transform = '';
    this.stick.classList.remove('down');
    for (const [code] of STICK_KEYS) this.holdStickKey(code, false);
  }

  /** Let go of everything: used when the game pauses or the page loses focus. */
  releaseAll(): void {
    this.centreStick();
    for (const b of this.buttons) this.release(b);
    if (this.shootHeld) {
      this.shootHeld = false;
      this.input.mouseDown = false;
    }
    this.lookPointer = null;
  }
}
