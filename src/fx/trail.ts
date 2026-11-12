import * as THREE from 'three';
import { CONFIG } from '../config';

const POINTS = 56;

/**
 * One glowing streak that follows a point and fades out behind it, like a
 * tail light in a long-exposure photo. The ribbon always turns to face the camera.
 */
class Streak {
  readonly mesh: THREE.Mesh;
  /** The same ribbon drawn again with additive blending, for the glow. */
  readonly glow: THREE.Mesh;
  private px = new Float32Array(POINTS);
  private py = new Float32Array(POINTS);
  private pz = new Float32Array(POINTS);
  private age = new Float32Array(POINTS).fill(1e9);
  private power = new Float32Array(POINTS);
  /** A break in the trail: the point after it is not joined to it. */
  private gap = new Uint8Array(POINTS);
  private head = 0;
  private positions = new Float32Array(POINTS * 2 * 3);
  private colors = new Float32Array(POINTS * 2 * 4);
  private near = new THREE.Color(CONFIG.trail.color);
  private far = new THREE.Color(CONFIG.trail.fadeColor);

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    const index: number[] = [];
    for (let i = 0; i < POINTS - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.glow = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        opacity: CONFIG.trail.glow,
      }),
    );
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 6;
  }

  /** Add the newest point. `power` 0 to 1 sets how bright it is; `breakBefore` starts a new piece. */
  push(x: number, y: number, z: number, power: number, breakBefore: boolean): void {
    this.head = (this.head + 1) % POINTS;
    const i = this.head;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.age[i] = 0;
    this.power[i] = power;
    this.gap[i] = breakBefore ? 1 : 0;
  }

  /** Move the newest point without adding another. */
  moveHead(x: number, y: number, z: number): void {
    const i = this.head;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
  }

  update(dt: number, camera: THREE.Vector3, surface: (x: number, z: number) => number): void {
    const T = CONFIG.trail;
    const { positions, colors, near, far } = this;
    // Walk from the newest point back to the oldest.
    for (let n = 0; n < POINTS; n++) {
      const i = (this.head - n + POINTS) % POINTS;
      this.age[i] += dt;
      // Waves roll through under the trail: keep live points riding on top of the water.
      if (this.age[i] < T.life) this.py[i] = Math.max(this.py[i], surface(this.px[i], this.pz[i]) + 0.12);
      const prev = (i - 1 + POINTS) % POINTS;
      const next = (i + 1) % POINTS;
      // Direction along the trail at this point.
      const dx = this.px[n === 0 ? i : next] - this.px[n === POINTS - 1 ? i : prev];
      const dy = this.py[n === 0 ? i : next] - this.py[n === POINTS - 1 ? i : prev];
      const dz = this.pz[n === 0 ? i : next] - this.pz[n === POINTS - 1 ? i : prev];
      // Sideways = along the trail crossed with the line to the camera.
      const cx = camera.x - this.px[i];
      const cy = camera.y - this.py[i];
      const cz = camera.z - this.pz[i];
      let sx = dy * cz - dz * cy;
      let sy = dz * cx - dx * cz;
      let sz = dx * cy - dy * cx;
      const len = Math.hypot(sx, sy, sz) || 1;
      const life = Math.max(0, 1 - this.age[i] / T.life);
      // Taper toward the tail.
      const w = (T.width * 0.5 * (0.35 + 0.65 * life)) / len;
      sx *= w;
      sy *= w;
      sz *= w;
      const v = n * 6;
      positions[v] = this.px[i] + sx;
      positions[v + 1] = this.py[i] + sy;
      positions[v + 2] = this.pz[i] + sz;
      positions[v + 3] = this.px[i] - sx;
      positions[v + 4] = this.py[i] - sy;
      positions[v + 5] = this.pz[i] - sz;
      // A point that starts a new piece, or the one before it, is invisible so pieces do not join up.
      const broken = this.gap[i] === 1 || (n > 0 && this.gap[next] === 1);
      const a = broken ? 0 : Math.pow(life, 1.4) * this.power[i] * T.strength;
      const c = n * 8;
      const r = far.r + (near.r - far.r) * life;
      const g = far.g + (near.g - far.g) * life;
      const b = far.b + (near.b - far.b) * life;
      colors[c] = r;
      colors[c + 1] = g;
      colors[c + 2] = b;
      colors[c + 3] = a;
      colors[c + 4] = r;
      colors[c + 5] = g;
      colors[c + 6] = b;
      colors[c + 7] = a;
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}

/** Two tail-light streaks, one from each side of the board's tail. */
export class LightTrail {
  readonly group = new THREE.Group();
  private left = new Streak();
  private right = new Streak();
  private wasOn = false;
  private sinceDrop = 0;

  constructor() {
    this.group.add(this.left.mesh, this.right.mesh, this.left.glow, this.right.glow);
  }

  /**
   * @param on whether the board is laying down trail this frame
   * @param tailL, tailR world positions of the two tail corners
   * @param power 0 to 1 brightness
   * @param surface water height at a point, so the trail floats on passing waves
   */
  update(dt: number, on: boolean, tailL: THREE.Vector3, tailR: THREE.Vector3, power: number, camera: THREE.Vector3, surface: (x: number, z: number) => number): void {
    if (on) {
      const fresh = !this.wasOn;
      this.sinceDrop += dt;
      // Drop points at a steady rate whatever the frame rate; in between, the newest point rides with the board.
      if (fresh || this.sinceDrop >= (CONFIG.trail.life / POINTS) * 1.15) {
        this.sinceDrop = 0;
        this.left.push(tailL.x, tailL.y, tailL.z, power, fresh);
        this.right.push(tailR.x, tailR.y, tailR.z, power, fresh);
      } else {
        this.left.moveHead(tailL.x, tailL.y, tailL.z);
        this.right.moveHead(tailR.x, tailR.y, tailR.z);
      }
    }
    this.wasOn = on;
    this.left.update(dt, camera, surface);
    this.right.update(dt, camera, surface);
  }
}
