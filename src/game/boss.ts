import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Input } from '../core/input';
import type { WaterSurface } from '../core/level';
import type { Surfer } from '../player/surfer';

export type Weapon = (typeof CONFIG.shop.weapons)[number];

/** Things that happened in the fight this step. The game turns them into banners, sounds and saves. */
export type BossEvent =
  | { type: 'bossHit'; damage: number }
  | { type: 'phase2' }
  | { type: 'warning' }
  | { type: 'strike'; x: number; z: number }
  | { type: 'playerHit'; heartsLeft: number }
  | { type: 'won' }
  | { type: 'lost' };

export interface Shot {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
}

/** A tail strike on its way: a warning ring on the water, then the hit. */
export interface Strike {
  active: boolean;
  x: number;
  z: number;
  /** Seconds until it lands, and the full warning time. */
  time: number;
  delay: number;
}

const MAX_SHOTS = 64;
const MAX_STRIKES = 6;

/**
 * The Stingray fight: its health and phases, where it flies, its tail
 * strikes, the player's shots and hearts. No drawing in here; fx/bossView.ts
 * draws whatever this holds.
 */
export class BossFight {
  active = false;
  hp = 0;
  phase: 1 | 2 = 1;
  hearts = 0;
  maxHearts = 0;
  /** Counts down after the player is hit; no damage while it runs. */
  invulnerable = 0;
  /** Counts down after the Stingray is hit, for the flash. */
  hurt = 0;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly shots: Shot[] = [];
  readonly strikes: Strike[] = [];
  readonly events: BossEvent[] = [];
  weapon: Weapon | null = null;
  private clock = 0;
  private strikeTimer = 0;
  private cooldown = 0;
  private aim = new THREE.Vector3();
  private want = new THREE.Vector3();
  /** Where the Stingray is relative to the surfer, and how fast that is changing. */
  private off = new THREE.Vector3();
  private offVel = new THREE.Vector3();
  private vy = 0;
  private faceX = 0;
  private faceZ = -1;

  constructor(private water: WaterSurface) {
    for (let i = 0; i < MAX_SHOTS; i++) {
      this.shots.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, damage: 0 });
    }
    for (let i = 0; i < MAX_STRIKES; i++) this.strikes.push({ active: false, x: 0, z: 0, time: 0, delay: 1 });
  }

  get maxHp(): number {
    return CONFIG.boss.hp;
  }

  start(hearts: number, weapon: Weapon, surfer: Surfer): void {
    const B = CONFIG.boss;
    this.active = true;
    this.hp = B.hp;
    this.phase = 1;
    this.hearts = this.maxHearts = hearts;
    this.weapon = weapon;
    this.invulnerable = 0;
    this.hurt = 0;
    this.clock = 0;
    this.cooldown = 0;
    this.strikeTimer = B.strikeEvery * 1.5;
    for (const s of this.shots) s.alive = false;
    for (const s of this.strikes) s.active = false;
    // Rises out of the sea well ahead of the surfer.
    this.faceX = surfer.forwardX;
    this.faceZ = surfer.forwardZ;
    this.off.set(this.faceX * B.distance * 1.6, 0, this.faceZ * B.distance * 1.6);
    this.offVel.set(0, 0, 0);
    this.vy = 0;
    this.pos.set(surfer.pos.x + this.off.x, -4, surfer.pos.z + this.off.z);
    this.vel.set(0, 0, 0);
  }

  /** Stop the fight without a result (for example when progress is reset). */
  cancel(): void {
    this.active = false;
    for (const s of this.shots) s.alive = false;
    for (const s of this.strikes) s.active = false;
  }

  step(dt: number, surfer: Surfer, input: Input): void {
    if (!this.active) return;
    const B = CONFIG.boss;
    this.clock += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    const riding = surfer.state === 'surf' || surfer.state === 'air';
    const p2 = this.phase === 2;

    // ---- Flight: hover ahead of the surfer, where the camera looks, weaving from side to side.
    // The spot is kept relative to the surfer, so a fast ride does not leave the Stingray behind.
    const turn = 1 - Math.exp(-dt * 1.2);
    this.faceX += (surfer.forwardX - this.faceX) * turn;
    this.faceZ += (surfer.forwardZ - this.faceZ) * turn;
    const fl = Math.hypot(this.faceX, this.faceZ) || 1;
    const fx = this.faceX / fl;
    const fz = this.faceZ / fl;
    const dist = p2 ? B.distance2 : B.distance;
    const weave = Math.sin(this.clock * (p2 ? 1.1 : 0.7)) * B.weave;
    const bob = Math.sin(this.clock * 1.7) * 1.2;
    const k = p2 ? B.follow2 : B.follow;
    // A soft spring toward the spot, so it glides and overshoots a little.
    this.offVel.x += ((fx * dist + fz * weave - this.off.x) * k * k - this.offVel.x * 2 * k * 0.8) * dt;
    this.offVel.z += ((fz * dist - fx * weave - this.off.z) * k * k - this.offVel.z * 2 * k * 0.8) * dt;
    this.off.addScaledVector(this.offVel, dt);
    this.want.copy(this.pos);
    this.pos.x = surfer.pos.x + this.off.x;
    this.pos.z = surfer.pos.z + this.off.z;
    const wantY = Math.max(this.water.height(this.pos.x, this.pos.z), 0) + B.height + bob;
    this.vy += ((wantY - this.pos.y) * 9 - this.vy * 5) * dt;
    this.pos.y += this.vy * dt;
    // Its real speed over the water, which the shots lead.
    if (dt > 0) this.vel.copy(this.pos).sub(this.want).divideScalar(dt);

    // ---- The player's shots. Only while riding or in the air.
    this.cooldown = Math.max(0, this.cooldown - dt);
    const w = this.weapon;
    if (w && riding && input.mouseDown && this.cooldown <= 0) {
      this.cooldown = 1 / w.shotsPerSecond;
      const pellets = w.id === 'trident' ? 3 : 1;
      for (let i = 0; i < pellets; i++) this.fire(surfer, w, pellets === 3 ? (i - 1) * B.tridentSpread : 0);
    }
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.pos.addScaledVector(s.vel, dt);
      s.life -= dt;
      if (s.life <= 0) {
        s.alive = false;
      } else if (s.pos.distanceToSquared(this.pos) < B.hitRadius * B.hitRadius) {
        s.alive = false;
        this.damage(s.damage);
        if (!this.active) return;
      }
    }

    // ---- Tail strikes. It only attacks a surfer who is up and riding.
    if (riding) this.strikeTimer -= dt;
    if (this.strikeTimer <= 0) {
      this.strikeTimer = p2 ? B.strikeEvery2 : B.strikeEvery;
      const delay = p2 ? B.strikeDelay2 : B.strikeDelay;
      // Aim a little ahead of where the surfer is going.
      const T = 8.5;
      const leadX = surfer.pos.x + surfer.speed * surfer.forwardX * delay * 0.75;
      const leadZ = surfer.pos.z + (surfer.speed * surfer.forwardZ + surfer.carry * T) * delay * 0.75;
      this.addStrike(leadX, leadZ, delay);
      if (p2) {
        const side = surfer.forwardX >= 0 ? 1 : -1;
        this.addStrike(leadX + side * B.strikeSpread2, leadZ, delay + 0.15);
        this.addStrike(leadX - side * B.strikeSpread2, leadZ, delay + 0.3);
      }
      this.events.push({ type: 'warning' });
    }
    for (const s of this.strikes) {
      if (!s.active) continue;
      s.time -= dt;
      if (s.time > 0) continue;
      s.active = false;
      this.events.push({ type: 'strike', x: s.x, z: s.z });
      const near = Math.hypot(surfer.pos.x - s.x, surfer.pos.z - s.z) < B.strikeRadius;
      const low = surfer.pos.y - this.water.height(surfer.pos.x, surfer.pos.z) < B.safeHeight;
      const exposed = surfer.state === 'surf' || surfer.state === 'paddle' || surfer.state === 'air';
      if (near && low && exposed && this.invulnerable <= 0) {
        this.hearts--;
        this.invulnerable = B.invulnerable;
        this.events.push({ type: 'playerHit', heartsLeft: this.hearts });
        if (this.hearts <= 0) {
          this.active = false;
          this.events.push({ type: 'lost' });
          return;
        }
      }
    }
  }

  private fire(surfer: Surfer, w: Weapon, spread: number): void {
    const B = CONFIG.boss;
    const shot = this.shots.find((s) => !s.alive);
    if (!shot) return;
    shot.pos.set(surfer.pos.x, surfer.pos.y + 1.2, surfer.pos.z);
    // Lead the target: aim where the Stingray will be when the shot gets there.
    const t = shot.pos.distanceTo(this.pos) / B.shotSpeed;
    this.aim.copy(this.pos).addScaledVector(this.vel, t).sub(shot.pos).normalize();
    const yaw = spread + (Math.random() - 0.5) * 2 * B.shotScatter;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const ax = this.aim.x * c + this.aim.z * s;
    const az = this.aim.z * c - this.aim.x * s;
    shot.vel.set(ax, this.aim.y + (Math.random() - 0.5) * 2 * B.shotScatter, az).multiplyScalar(B.shotSpeed);
    shot.life = 1.6;
    shot.damage = w.damage * (surfer.state === 'air' ? B.airDamageBonus : 1);
    shot.alive = true;
  }

  private addStrike(x: number, z: number, delay: number): void {
    const s = this.strikes.find((k) => !k.active);
    if (!s) return;
    s.active = true;
    s.x = THREE.MathUtils.clamp(x, -CONFIG.world.halfWidth, CONFIG.world.halfWidth);
    s.z = z;
    s.time = s.delay = delay;
  }

  /** Take health off the Stingray. Public so scripted playtests can end a fight quickly. */
  damage(amount: number): void {
    if (!this.active) return;
    const B = CONFIG.boss;
    this.hp = Math.max(0, this.hp - amount);
    this.hurt = 0.18;
    this.events.push({ type: 'bossHit', damage: amount });
    if (this.phase === 1 && this.hp <= B.hp * B.phase2At && this.hp > 0) {
      this.phase = 2;
      this.strikeTimer = 1.5;
      this.events.push({ type: 'phase2' });
    }
    if (this.hp <= 0) {
      this.active = false;
      for (const s of this.strikes) s.active = false;
      this.events.push({ type: 'won' });
    }
  }
}
