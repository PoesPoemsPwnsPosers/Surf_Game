import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WaveSystem } from '../ocean/waves';
import type { Surfer, SurferEvent } from '../player/surfer';
import { Spray } from './particles';
import { LightTrail } from './trail';

/**
 * Everything that reacts to the surfer without changing the game: spray, the
 * tail light trail, and the shadow and landing ring shown during a flight.
 */
export class SurfEffects {
  readonly group = new THREE.Group();
  private spray = new Spray(600);
  private trail = new LightTrail();
  private tailL = new THREE.Vector3();
  private tailR = new THREE.Vector3();
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
  private surfaceAt = (x: number, z: number): number => this.waves.height(x, z);

  constructor(private waves: WaveSystem) {
    this.shadow.visible = false;
    this.landRing.visible = false;
    this.group.add(this.spray.mesh, this.shadow, this.landRing, this.trail.group);
  }

  /** Spray bursts for things that just happened. Returns how hard to shake the camera. */
  onEvent(e: SurferEvent, surfer: Surfer): number {
    const p = surfer.pos;
    switch (e.type) {
      case 'popUp':
        this.spray.burst(p.x, p.y, p.z, 14, 3.5);
        return 0;
      case 'launch':
        this.spray.burst(p.x, p.y, p.z, e.offLip ? 26 : 14, e.offLip ? 6 : 4);
        return 0;
      case 'land':
        this.spray.burst(p.x, p.y, p.z, 30, 6);
        return 0.25;
      case 'spray':
        // A fan of spray thrown out to sea off the top of the wave.
        for (let i = 0; i < 46; i++) {
          const a = (Math.random() - 0.5) * 1.6;
          const v = 5 + Math.random() * 7 * e.power;
          this.spray.emit(p.x, p.y + 0.2, p.z, Math.sin(a) * v, 3 + Math.random() * 6, -Math.cos(a) * v, 0.5 + Math.random() * 0.5, 0.9 + Math.random() * 1.4);
        }
        return 0;
      case 'kick':
        this.spray.burst(p.x, p.y, p.z, 18, 4);
        return 0.18;
      case 'wipeout':
        this.spray.burst(p.x, p.y, p.z, 50, 8);
        return 0.9;
      case 'splash':
        this.spray.burst(p.x, p.y, p.z, 20 + Math.min(40, e.height * 5), 4 + Math.min(5, e.height * 0.5));
        return Math.min(0.6, e.height * 0.06);
      case 'wadeIn':
        this.spray.burst(p.x, p.y, p.z, 10, 2.5);
        return 0;
      default:
        return 0;
    }
  }

  /** Call once per rendered frame. `dt` is 0 while the game is paused. */
  update(dt: number, surfer: Surfer, cameraPos: THREE.Vector3): void {
    if (dt > 0) {
      this.emitSpray(dt, surfer);
      this.spray.update(dt);
    }
    this.updateMarkers(surfer);
    this.updateTrail(dt, surfer, cameraPos);
  }

  private emitSpray(dt: number, s: Surfer): void {
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

  /** Tail lights: two glowing streaks off the back of the board that fade like a long exposure. */
  private updateTrail(dt: number, s: Surfer, cameraPos: THREE.Vector3): void {
    const b = s.board;
    const pivot = s.model.boardPivot;
    pivot.updateWorldMatrix(true, false);
    this.tailL.set(0.2 * b.scale, 0.1, -1.05 * b.scale).applyMatrix4(pivot.matrixWorld);
    this.tailR.set(-0.2 * b.scale, 0.1, -1.05 * b.scale).applyMatrix4(pivot.matrixWorld);
    const T = CONFIG.trail;
    const riding = s.state === 'surf' || s.state === 'air';
    // Barely there at cruising speed; it only really lights up when the board is flying.
    const from = b.maxSpeed * T.startFraction;
    const lin = Math.min(1, Math.max(0, (s.displaySpeed - from) / (b.maxSpeed * T.fullFraction - from)));
    const power = lin * lin;
    this.trail.update(dt, riding && power > 0.01, this.tailL, this.tailR, power, cameraPos, this.surfaceAt);
  }

  /** A shadow under the surfer and a ring where the flight will come down. */
  private updateMarkers(s: Surfer): void {
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
}
