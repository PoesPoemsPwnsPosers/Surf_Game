import * as THREE from 'three';
import { CONFIG } from './config';
import { Input } from './core/input';
import type { LevelDefinition, LevelEnvironment } from './core/level';
import { FollowCamera } from './camera/followCamera';
import { Spray } from './fx/particles';
import { loadLevel, type LevelId } from './levels';
import { OceanMesh } from './ocean/oceanMesh';
import { WaveSystem } from './ocean/waves';
import { Surfer, type SurferEvent } from './player/surfer';
import { Hud } from './ui/hud';

type Mode = 'loading' | 'ready' | 'playing' | 'paused';

class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private input: Input;
  private cam: FollowCamera;
  private hud!: Hud;
  private waves!: WaveSystem;
  private ocean!: OceanMesh;
  private surfer!: Surfer;
  private spray = new Spray(600);
  private env!: LevelEnvironment;
  private level!: LevelDefinition;
  private mode: Mode = 'loading';
  private last = 0;
  private acc = 0;
  private sprayAcc = 0;
  private shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x06304d, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  private landRing = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 2.0, 6).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  private landPoint = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    // No tone mapping: keeps the cartoon colours bright and the foam pure white.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.input = new Input(canvas);
    this.cam = new FollowCamera(window.innerWidth / window.innerHeight);

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.cam.camera.aspect = window.innerWidth / window.innerHeight;
      this.cam.camera.updateProjectionMatrix();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.togglePause();
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

  private wantLock = false;
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
      cellX: 2.6,
      cellZ: 1.55,
      look: this.level.ocean,
    });
    this.scene.add(this.ocean.farPlane, this.ocean.mesh, this.spray.mesh);
    this.env = this.level.buildEnvironment(this.scene, this.waves);
    this.surfer = new Surfer(this.waves);
    this.scene.add(this.surfer.model.root, this.shadow, this.landRing);
    this.shadow.visible = false;
    this.landRing.visible = false;
    this.surfer.events.length = 0;

    this.hud = new Hud(this.level.waves.wavesPerSet, () => this.onOverlayButton());
    this.hud.showOverlay(this.level.name, 'Paddle out to the buoys, catch a wave, then get airborne.', 'SURF');
    this.mode = 'ready';

    this.waves.update(0);
    this.ocean.update();
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

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

  // ------------------------------------------------------------------- loop

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.mode === 'playing') this.advance(dt);
    this.present(dt);
  };

  /** Run the simulation forward by dt in fixed steps. */
  private advance(dt: number): void {
    const step = 1 / CONFIG.physicsHz;
    this.acc += dt;
    let n = 0;
    while (this.acc >= step && n < 16) {
      this.waves.update(step);
      this.debugKeys();
      this.surfer.step(step, this.input, this.cam.yaw);
      this.input.consumePresses();
      this.acc -= step;
      n++;
    }
    if (n === 16) this.acc = 0;
    for (const e of this.surfer.events) this.onSurferEvent(e);
    this.surfer.events.length = 0;
  }

  private present(dt: number): void {
    const playing = this.mode === 'playing';
    this.ocean.update();
    this.surfer.updateVisual(playing ? dt : 0);
    if (playing) {
      this.emitSpray(dt);
      this.spray.update(dt);
      this.env.update(dt, this.waves.time);
    }
    this.updateMarkers();
    this.cam.update(dt, this.surfer, this.input, this.waves);
    if (this.mode !== 'loading') this.hud.update(dt, this.surfer, this.waves);
    this.renderer.render(this.scene, this.cam.camera);
    this.input.endFrame();
  }

  /** Test keys until the shop exists: 1 to 4 swap boards. */
  private debugKeys(): void {
    for (let i = 0; i < CONFIG.boards.length; i++) {
      if (this.input.wasPressed(`Digit${i + 1}`)) this.surfer.setBoard(i);
    }
  }

  /** A shadow under the surfer and a ring where the flight will come down. */
  private updateMarkers(): void {
    const s = this.surfer;
    const airborne = s.state === 'air';
    this.shadow.visible = airborne;
    this.landRing.visible = airborne;
    if (!airborne) return;
    const y = this.waves.height(s.pos.x, s.pos.z);
    const alt = Math.max(0, s.pos.y - y);
    this.shadow.position.set(s.pos.x, y + 0.12, s.pos.z);
    this.shadow.scale.setScalar(1 + alt * 0.12);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.42 - alt * 0.02);
    if (s.predictLanding(this.landPoint)) {
      this.landRing.position.set(this.landPoint.x, this.waves.height(this.landPoint.x, this.landPoint.z) + 0.3, this.landPoint.z);
      this.landRing.rotation.y += 0.05;
      this.landRing.visible = alt > 1.2;
    }
  }

  // ---------------------------------------------------------------- effects

  private onSurferEvent(e: SurferEvent): void {
    const p = this.surfer.pos;
    switch (e.type) {
      case 'popUp':
        this.spray.burst(p.x, p.y, p.z, 14, 3.5);
        break;
      case 'launch':
        this.spray.burst(p.x, p.y, p.z, e.offLip ? 26 : 14, e.offLip ? 6 : 4);
        break;
      case 'land': {
        this.spray.burst(p.x, p.y, p.z, 30, 6);
        this.cam.addShake(0.25);
        // Milestone 2 turns these into points.
        const spins = Math.round(Math.abs(e.spin) / Math.PI) * 180;
        const flips = Math.round(Math.abs(e.flip) / (Math.PI * 2));
        const parts: string[] = [];
        if (e.hopped) parts.push('WAVE HOP');
        if (flips > 0) parts.push(`${flips > 1 ? `${flips}x ` : ''}${e.flip > 0 ? 'Front' : 'Back'}flip`);
        if (spins > 0) parts.push(`${spins} spin`);
        if (e.grab > 0) parts.push('Grab');
        if (parts.length === 0 && e.airTime > 0.9) parts.push(e.seaward ? 'Out the back' : 'Big air');
        if (parts.length > 0) this.hud.flash(`${parts.join(' + ')}!`, 'good', e.hopped ? 2 : 1.4);
        break;
      }
      case 'trick':
        this.hud.flash(`${e.name}!`, 'good', 1.1);
        break;
      case 'spray':
        // A fan of spray thrown out to sea off the top of the wave.
        for (let i = 0; i < 46; i++) {
          const a = (Math.random() - 0.5) * 1.6;
          const v = 5 + Math.random() * 7 * e.power;
          this.spray.emit(p.x, p.y + 0.2, p.z, Math.sin(a) * v, 3 + Math.random() * 6, -Math.cos(a) * v, 0.5 + Math.random() * 0.5, 0.9 + Math.random() * 1.4);
        }
        break;
      case 'kick':
        this.spray.burst(p.x, p.y, p.z, 18, 4);
        this.cam.addShake(0.18);
        this.hud.flash('Air kick!', 'good', 0.8);
        break;
      case 'board':
        if (this.mode === 'playing') this.hud.flash(e.name, 'good', 0.9);
        break;
      case 'wipeout':
        this.spray.burst(p.x, p.y, p.z, 50, 8);
        this.cam.addShake(0.9);
        this.hud.flash('WIPEOUT!', 'bad', 1.6);
        break;
      case 'rideEnd':
      case 'respawn':
        break;
    }
  }

  private emitSpray(dt: number): void {
    const s = this.surfer;
    const T = this.waves.tuning;
    // Rooster tail behind the board.
    if (s.state === 'surf' && s.speed > 3) {
      const showy = s.trick === 'tailSlide' ? 90 : s.trick === 'cutback' ? 50 : s.trick === 'floater' ? 40 : 0;
      this.sprayAcc += dt * (6 + s.speed * 2.2 + Math.abs(s.lean) * 40 + showy);
      while (this.sprayAcc >= 1) {
        this.sprayAcc -= 1;
        const side = (Math.random() - 0.5) * 2;
        const bx = s.pos.x - s.forwardX * 1.0;
        const bz = s.pos.z - s.forwardZ * 1.0;
        this.spray.emit(
          bx,
          s.pos.y + 0.1,
          bz,
          -s.forwardX * s.speed * 0.25 + s.forwardZ * side * 2.5 - s.lean * s.forwardZ * 4,
          1.5 + Math.random() * 2.5 + Math.abs(s.lean) * 4,
          -s.forwardZ * s.speed * 0.25 - s.forwardX * side * 2.5 + s.lean * s.forwardX * 4 + T.speed * s.carry * 0.6,
          0.35 + Math.random() * 0.4,
          0.6 + Math.random() * 0.9,
        );
      }
    }
    // Spray thrown off the lip where each wave is peeling.
    for (const w of this.waves.waves) {
      if (w.brokenHalfWidth < 0 || w.amp < 1) continue;
      if (Math.random() > dt * 40) continue;
      const sideSign = Math.random() < 0.5 ? -1 : 1;
      const edge = Math.random() < 0.6;
      const x = w.peakX + sideSign * (edge ? w.brokenHalfWidth + Math.random() * 3 : Math.random() * w.brokenHalfWidth);
      if (Math.abs(x) > CONFIG.world.halfWidth) continue;
      const z = w.crestZ + 1 + Math.random() * 2;
      const y = this.waves.height(x, z);
      this.spray.emit(x, y, z, (Math.random() - 0.5) * 3, 2 + Math.random() * 4, T.speed + Math.random() * 3, 0.5 + Math.random() * 0.5, 0.9 + Math.random() * 1.4);
    }
  }

  // ------------------------------------------------------- automated playtest

  /** Advance the simulation without rendering. Used by scripted playtests. */
  simulate(seconds: number): void {
    this.mode = 'playing';
    const step = 1 / CONFIG.physicsHz;
    for (let t = 0; t < seconds; t += step) {
      this.waves.update(step);
      this.debugKeys();
      this.surfer.step(step, this.input, this.cam.yaw);
      this.input.consumePresses();
      this.cam.update(step, this.surfer, this.input, this.waves);
      for (const e of this.surfer.events) this.onSurferEvent(e);
      this.log.push(...this.surfer.events);
      this.surfer.events.length = 0;
    }
  }
  readonly log: SurferEvent[] = [];
  get debug() {
    return { surfer: this.surfer, waves: this.waves, input: this.input, hud: this.hud, cam: this.cam };
  }
}

const game = new Game(document.getElementById('game') as HTMLCanvasElement);
(window as unknown as { __surf: Game }).__surf = game;
game.start('venice').catch((err) => {
  console.error(err);
  const sub = document.getElementById('overlay-sub');
  if (sub) sub.textContent = `Could not start the game: ${err}`;
});
