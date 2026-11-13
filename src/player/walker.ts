import type * as THREE from 'three';
import { CONFIG } from '../config';
import type { Input } from '../core/input';
import type { LandMap, WaterSurface } from '../core/level';

const TAU = Math.PI * 2;
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** What a step on foot ended as. */
export type WalkResult = 'walking' | 'swim' | 'splash';

/**
 * Moving around on foot: the sand, the boardwalk and the pier. It knows
 * nothing about surfing. The surfer hands over to it on land and takes back
 * control when the walker ends up in water deep enough to paddle.
 */
export class Walker {
  heading = Math.PI;
  /** Horizontal speed, for the walk animation. */
  speed = 0;
  vy = 0;
  grounded = true;
  private vx = 0;
  private vz = 0;

  constructor(
    private land: LandMap,
    private water: WaterSurface,
  ) {}

  /**
   * Is this spot land, or shallow enough to stand in? `depth` is how deep counts as standing;
   * coming in from the sea uses a shallower depth than wading out, so the two do not flip-flop.
   */
  canStand(x: number, z: number, depth = CONFIG.walk.swimDepth): boolean {
    return this.land.sand(x, z) > this.water.height(x, z) - depth;
  }

  /** Put the walker down at a spot, on top of whatever is there. */
  place(pos: THREE.Vector3, x: number, z: number, heading: number): void {
    pos.set(x, this.land.ground(x, z, Infinity), z);
    this.heading = heading;
    this.vx = this.vz = this.vy = 0;
    this.speed = 0;
    this.grounded = true;
  }

  /** Carry on from paddling speed when the board runs up the sand. */
  arrive(pos: THREE.Vector3, heading: number): void {
    pos.y = Math.max(pos.y, this.land.ground(pos.x, pos.z, pos.y));
    this.heading = heading;
    this.vx = this.vz = this.vy = 0;
    this.grounded = true;
  }

  step(dt: number, input: Input, cameraYaw: number, pos: THREE.Vector3): WalkResult {
    const K = CONFIG.walk;
    const ix = input.axis('KeyA', 'KeyD');
    const iz = input.axis('KeyS', 'KeyW');
    // Camera-relative: W walks away from the camera.
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    let mx = fx * iz - fz * ix;
    let mz = fz * iz + fx * ix;
    const len = Math.hypot(mx, mz);
    const top = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? K.runSpeed : K.speed;
    if (len > 0) {
      mx = (mx / len) * top;
      mz = (mz / len) * top;
      this.heading += shortestAngle(this.heading, Math.atan2(mx, mz)) * (1 - Math.exp(-dt * K.turnRate));
    }
    // Less control in the air.
    const k = 1 - Math.exp(-dt * K.accel * (this.grounded ? 1 : 0.25));
    this.vx += (mx - this.vx) * k;
    this.vz += (mz - this.vz) * k;
    this.speed = Math.hypot(this.vx, this.vz);

    const B = this.land.bounds;
    const nx = Math.min(B.maxX, Math.max(B.minX, pos.x + this.vx * dt));
    const nz = Math.min(B.maxZ, pos.z + this.vz * dt);
    const ground = this.land.ground(nx, nz, pos.y);
    // A wall too tall to step up (the side of the pier ramp) stops the walker.
    if (this.grounded && ground > pos.y + K.stepUp) {
      this.vx = this.vz = 0;
    } else {
      pos.x = nx;
      pos.z = nz;
    }

    const floor = this.land.ground(pos.x, pos.z, pos.y);
    if (this.grounded) {
      if (input.wasPressed('Space')) {
        this.vy = K.jump;
        this.grounded = false;
      } else if (pos.y - floor > 0.4) {
        // Walked off an edge.
        this.grounded = false;
        this.vy = 0;
      } else {
        pos.y = floor;
      }
    }
    if (!this.grounded) {
      this.vy -= K.gravity * dt;
      pos.y += this.vy * dt;
      const surface = this.water.height(pos.x, pos.z);
      // Over deep water with nothing underfoot: into the sea.
      const deep = floor < surface - CONFIG.walk.swimDepth;
      if (deep && pos.y <= surface) {
        pos.y = surface;
        return 'splash';
      }
      if (!deep && pos.y <= floor && this.vy <= 0) {
        pos.y = floor;
        this.vy = 0;
        this.grounded = true;
      }
      return 'walking';
    }
    // Waded in deep enough to paddle. (Standing on the pier over deep water does not count.)
    return floor > this.water.height(pos.x, pos.z) - CONFIG.walk.swimDepth ? 'walking' : 'swim';
  }
}
