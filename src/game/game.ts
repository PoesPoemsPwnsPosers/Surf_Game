import * as THREE from 'three';
import { FollowCamera } from '../camera/followCamera';
import { CONFIG } from '../config';
import { Input } from '../core/input';
import type { LevelDefinition, LevelEnvironment } from '../core/level';
import { SurfEffects } from '../fx/surfEffects';
import { loadLevel, type LevelId } from '../levels';
import { LipMesh } from '../ocean/lipMesh';
import { OceanMesh } from '../ocean/oceanMesh';
import { WaveSystem } from '../ocean/waves';
import { Surfer, type SurferEvent } from '../player/surfer';
import { Hud } from '../ui/hud';
import { ShopPanel } from '../ui/shopPanel';
import { clearSave, loadSave, newSave, writeSave, type SaveData } from './save';
import { Score } from './score';
import { hearts, Shop } from './shop';

type Mode = 'loading' | 'ready' | 'playing' | 'paused' | 'shop';

/**
 * The game loop and the wiring between the parts. Each part does its own job
 * (waves, surfer, score, shop, effects, screens); this class owns the modes
 * (start screen, playing, paused, shop) and passes events between them.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private input: Input;
  private cam: FollowCamera;
  private hud!: Hud;
  private shopPanel!: ShopPanel;
  private waves!: WaveSystem;
  private ocean!: OceanMesh;
  private lip!: LipMesh;
  private surfer!: Surfer;
  private effects!: SurfEffects;
  private env!: LevelEnvironment;
  private level!: LevelDefinition;
  private save: SaveData = loadSave();
  private shop = new Shop(this.save);
  private saved = true;
  readonly score = new Score();
  private mode: Mode = 'loading';
  private last = 0;
  private acc = 0;
  private wantLock = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    // No tone mapping: keeps the cartoon colours bright and the foam pure white.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.input = new Input(canvas);
    this.cam = new FollowCamera(window.innerWidth / window.innerHeight);
    this.score.total = this.save.points;
    this.score.best = this.save.best;

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.cam.camera.aspect = window.innerWidth / window.innerHeight;
      this.cam.camera.updateProjectionMatrix();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.mode === 'shop') this.closeShop();
        else this.togglePause();
      }
      if (e.code === 'KeyF' && this.mode === 'shop' && !e.repeat) this.closeShop();
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && (this.mode === 'ready' || this.mode === 'paused')) this.onOverlayButton();
    });
    // Leaving pointer lock (the browser does this on Esc) pauses the game.
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.mode === 'playing' && this.wantLock) this.pause();
    });
    canvas.addEventListener('click', () => {
      if (this.mode === 'playing') this.lock();
    });
  }

  private lock(): void {
    this.wantLock = true;
    this.input.lockPointer();
  }

  async start(levelId: LevelId): Promise<void> {
    this.level = await loadLevel(levelId);
    const W = CONFIG.world;
    this.waves = new WaveSystem(this.level.waves, W.halfWidth);
    this.ocean = new OceanMesh(this.waves, {
      minX: -W.halfWidth - 60,
      maxX: W.halfWidth + 60,
      minZ: this.level.waves.spawnZ - 10,
      maxZ: W.shoreZ + 4,
      cellX: 2.3,
      cellZ: 1.4,
      look: this.level.ocean,
    });
    this.lip = new LipMesh(this.waves, this.level.ocean);
    this.effects = new SurfEffects(this.waves);
    this.scene.add(this.ocean.farPlane, this.ocean.mesh, this.lip.mesh, this.effects.group);
    this.env = this.level.buildEnvironment(this.scene, this.waves);
    this.surfer = new Surfer(this.waves, this.level.land);
    this.surfer.setBoard(this.save.board);
    this.surfer.events.length = 0;
    this.scene.add(this.surfer.model.root);

    this.hud = new Hud(this.level.waves.wavesPerSet, () => this.onOverlayButton());
    this.shopPanel = new ShopPanel({
      onUse: (id) => this.useShopItem(id),
      onClose: () => this.closeShop(),
      onReset: () => this.resetProgress(),
    });
    this.applyLoadout();
    this.hud.showOverlay(this.level.name, 'Jump off the pier, paddle out to the buoys, catch a wave, then get airborne.', 'SURF');
    this.mode = 'ready';

    this.waves.update(0);
    this.ocean.update();
    this.lip.update();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------------ modes

  private onOverlayButton(): void {
    if (this.mode === 'ready' || this.mode === 'paused') {
      this.mode = 'playing';
      this.hud.hideOverlay();
      this.lock();
    }
  }

  private pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.wantLock = false;
    this.input.unlockPointer();
    this.hud.showOverlay('Paused', this.level.name, 'RESUME');
  }

  private togglePause(): void {
    if (this.mode === 'playing') this.pause();
    else if (this.mode === 'paused') this.onOverlayButton();
  }

  // ------------------------------------------------------------------- shop

  /** Is the player standing at the shop counter? */
  private atShop(): boolean {
    const s = this.surfer;
    const spot = this.level.land.shop;
    return s.state === 'walk' && s.walker.grounded && Math.hypot(s.pos.x - spot.x, s.pos.z - spot.z) < CONFIG.walk.shopReach;
  }

  private openShop(): void {
    this.mode = 'shop';
    this.wantLock = false;
    this.input.unlockPointer();
    this.save.points = this.score.total;
    this.shopPanel.render(this.shop.items(), this.save.points, this.saved);
    this.shopPanel.show();
  }

  private closeShop(): void {
    if (this.mode !== 'shop') return;
    this.shopPanel.hide();
    this.mode = 'playing';
    this.lock();
  }

  private useShopItem(id: string): void {
    if (!this.shop.use(id)) return;
    this.score.total = this.save.points;
    this.applyLoadout();
    this.persist();
    this.shopPanel.render(this.shop.items(), this.save.points, this.saved);
  }

  private resetProgress(): void {
    clearSave();
    Object.assign(this.save, newSave());
    this.score.total = this.save.points;
    this.score.best = 0;
    this.applyLoadout();
    this.shopPanel.render(this.shop.items(), this.save.points, this.saved);
  }

  /** Make the game match the save: the board under the surfer's feet, hearts and weapon on screen. */
  private applyLoadout(): void {
    if (this.surfer.boardTier !== this.save.board) this.surfer.setBoard(this.save.board);
    if (this.surfer.boosterLevel !== this.save.booster) {
      this.surfer.boosterLevel = this.save.booster;
      this.surfer.refillBooster();
    }
    this.surfer.events.length = 0;
    const weapon = CONFIG.shop.weapons.find((w) => w.id === this.save.weapon);
    this.hud.setLoadout(hearts(this.save), weapon ? weapon.name : null);
  }

  private persist(): void {
    this.save.points = this.score.total;
    this.save.best = this.score.best;
    this.saved = writeSave(this.save);
  }

  // ------------------------------------------------------------------- loop

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.mode === 'playing') this.advance(dt);
    this.present(dt);
  };

  /** One fixed physics step. */
  private stepOnce(step: number): void {
    this.waves.update(step);
    if (CONFIG.debug.boardKeys) {
      for (let i = 0; i < CONFIG.boards.length; i++) {
        if (this.input.wasPressed(`Digit${i + 1}`)) this.surfer.setBoard(i);
      }
    }
    if (this.input.wasPressed('KeyF') && this.atShop()) this.openShop();
    this.surfer.step(step, this.input, this.cam.yaw);
    this.score.update(step, this.surfer);
    this.input.consumePresses();
  }

  /** Run the simulation forward by dt in fixed steps. */
  private advance(dt: number): void {
    const step = 1 / CONFIG.physicsHz;
    this.acc += dt;
    let n = 0;
    while (this.acc >= step && n < 16 && this.mode === 'playing') {
      this.stepOnce(step);
      this.acc -= step;
      n++;
    }
    if (n === 16) this.acc = 0;
    this.drainEvents();
  }

  private drainEvents(): void {
    const before = this.score.total;
    for (const e of this.surfer.events) this.onSurferEvent(e);
    this.surfer.events.length = 0;
    // Points are saved whenever the banked total changes.
    if (this.score.total !== before) this.persist();
  }

  private onSurferEvent(e: SurferEvent): void {
    this.score.onEvent(e);
    for (const pop of this.score.popups) this.hud.popup(pop);
    this.score.popups.length = 0;
    const shake = this.effects.onEvent(e, this.surfer);
    if (shake > 0) this.cam.addShake(shake);
    if (e.type === 'land' && e.hopped) this.hud.flash('WAVE HOP!', 'good', 1.6);
    else if (e.type === 'board' && this.mode === 'playing') this.hud.flash(e.name, 'good', 0.9);
    else if (e.type === 'wipeout') this.hud.flash(e.reason === 'lip' ? 'HIT THE LIP!' : 'WIPEOUT!', 'bad', 1.6);
  }

  /** The lowest the camera may go at a point: above the water and above the land. */
  private floorAt = (x: number, z: number): number => Math.max(this.waves.height(x, z), this.level.land.sand(x, z));

  private present(dt: number): void {
    const playing = this.mode === 'playing';
    const live = playing ? dt : 0;
    this.ocean.update();
    this.lip.update();
    this.surfer.updateVisual(live);
    if (playing) this.env.update(dt, this.waves.time);
    this.cam.update(dt, this.surfer, this.input, this.floorAt);
    this.effects.update(live, this.surfer, this.cam.camera.position);
    if (this.mode !== 'loading') {
      this.hud.update(dt, this.surfer, this.waves, this.score, playing && this.atShop() ? 'F: SURF SHOP' : '');
    }
    this.renderer.render(this.scene, this.cam.camera);
    this.input.endFrame();
  }

  // ------------------------------------------------------- automated playtest

  /** Advance the simulation without rendering. Used by scripted playtests. */
  simulate(seconds: number): void {
    if (this.mode !== 'shop') this.mode = 'playing';
    const step = 1 / CONFIG.physicsHz;
    for (let t = 0; t < seconds && this.mode === 'playing'; t += step) {
      this.stepOnce(step);
      this.cam.update(step, this.surfer, this.input, this.floorAt);
      if (++this.simTick % 2 === 0) {
        this.surfer.updateVisual(step * 2);
        this.effects.update(step * 2, this.surfer, this.cam.camera.position);
      }
      this.log.push(...this.surfer.events);
      this.drainEvents();
    }
  }
  readonly log: SurferEvent[] = [];
  private simTick = 0;
  get debug() {
    return {
      config: CONFIG,
      score: this.score,
      save: this.save,
      surfer: this.surfer,
      waves: this.waves,
      input: this.input,
      hud: this.hud,
      cam: this.cam,
      ocean: this.ocean,
      lip: this.lip,
    };
  }
}
