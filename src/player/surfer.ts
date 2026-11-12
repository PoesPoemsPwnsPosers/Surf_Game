import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Input } from '../core/input';
import { WaveSystem, clamp, smoothstep, type Wave, type WaveSample } from '../ocean/waves';
import { SurferModel } from './surferModel';

export type SurferState = 'paddle' | 'surf' | 'air' | 'wipeout';

/** Things that happened this step. The HUD, effects and (later) scoring listen to these. */
export type SurferEvent =
  | { type: 'popUp' }
  | { type: 'launch'; speed: number; offLip: boolean }
  | { type: 'land'; airTime: number; spin: number; flip: number; height: number }
  | { type: 'wipeout'; reason: 'landing' | 'foam' }
  | { type: 'rideEnd'; rideTime: number }
  | { type: 'respawn' };

const TAU = Math.PI * 2;

/** Signed distance from `angle` to the nearest multiple of `step`. */
function offNearest(angle: number, step: number): number {
  return angle - Math.round(angle / step) * step;
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * The surfer: paddling, popping up, riding, flying and wiping out.
 *
 * Riding uses a "moving half-pipe" model. The wave face carries the board
 * toward the beach, and the board rolls along it like a skateboard: it speeds
 * up going down the face, slows going up, and flies off the lip if it reaches
 * the top with enough speed.
 */
export class Surfer {
  readonly model = new SurferModel();
  readonly pos = new THREE.Vector3();
  state: SurferState = 'paddle';
  /** Direction the board points. Forward is (sin heading, 0, cos heading). */
  heading = Math.PI;
  /** Speed along the board, measured relative to the wave while surfing. */
  speed = 0;
  /** Vertical speed. */
  vy = 0;
  /** How much of the wave's speed the board is being carried with, 0 to 1. */
  carry = 0;
  /** Current turn rate and the smoothed lean that follows it (-1 to 1). */
  turnVel = 0;
  lean = 0;
  pumping = false;
  /** Seconds in the current state. */
  stateTime = 0;
  rideTime = 0;

  // Paddling
  private paddleVX = 0;
  private paddleVZ = 0;
  /** True when Space would pop up right now. */
  canPopUp = false;
  /** True when a wave is a moment away, so the player can get ready. */
  waveIncoming = false;

  // Airborne
  private airVX = 0;
  private airVZ = 0;
  private airFrame = 0;
  private airWave: Wave | null = null;
  private launchSpeed = 0;
  private launchY = 0;
  spin = 0;
  flip = 0;
  private spinVel = 0;
  private flipVel = 0;
  airTime = 0;
  airPeak = 0;

  private foamTimer = 0;
  private tumble = 0;
  private landSquash = 0;
  private normal = new THREE.Vector3(0, 1, 0);
  private grad = { x: 0, z: 0 };
  private sample: WaveSample = { wave: null as unknown as Wave, ahead: 0, localAmp: 0, foam: 0 };
  readonly events: SurferEvent[] = [];

  constructor(private waves: WaveSystem) {
    this.reset();
  }

  reset(): void {
    this.pos.set(CONFIG.world.startX, 0, CONFIG.world.startZ);
    this.state = 'paddle';
    this.heading = Math.PI;
    this.speed = 0;
    this.vy = 0;
    this.stateTime = 0;
    this.model.setPose('prone');
  }

  /** Board forward direction on the water plane. */
  get forwardX(): number {
    return Math.sin(this.heading);
  }
  get forwardZ(): number {
    return Math.cos(this.heading);
  }

  /** Speed over the water, for the HUD. */
  get displaySpeed(): number {
    if (this.state === 'surf') {
      return Math.hypot(this.speed * this.forwardX, this.speed * this.forwardZ + this.carry * this.waves.tuning.speed);
    }
    if (this.state === 'air') return Math.hypot(this.airVX, this.airVZ + this.airFrame);
    if (this.state === 'paddle') return Math.hypot(this.paddleVX, this.paddleVZ);
    return 0;
  }

  step(dt: number, input: Input, cameraYaw: number): void {
    this.stateTime += dt;
    switch (this.state) {
      case 'paddle':
        this.stepPaddle(dt, input, cameraYaw);
        break;
      case 'surf':
        this.stepSurf(dt, input);
        break;
      case 'air':
        this.stepAir(dt, input);
        break;
      case 'wipeout':
        this.stepWipeout(dt);
        break;
    }
    const W = CONFIG.world;
    this.pos.x = clamp(this.pos.x, -W.halfWidth, W.halfWidth);
    this.pos.z = clamp(this.pos.z, W.seaLimitZ, W.shoreZ - 3);
  }

  private setState(s: SurferState): void {
    this.state = s;
    this.stateTime = 0;
  }

  // ---------------------------------------------------------------- paddling

  private stepPaddle(dt: number, input: Input, cameraYaw: number): void {
    const P = CONFIG.paddle;
    const ix = input.axis('KeyA', 'KeyD');
    const iz = input.axis('KeyS', 'KeyW');
    // Camera-relative movement: W paddles away from the camera.
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = -fz;
    const rz = fx;
    let mx = fx * iz + rx * ix;
    let mz = fz * iz + rz * ix;
    const len = Math.hypot(mx, mz);
    const top = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? P.sprintSpeed : P.speed;
    if (len > 0) {
      mx = (mx / len) * top;
      mz = (mz / len) * top;
    }
    const k = 1 - Math.exp(-dt * P.accel);
    this.paddleVX += (mx - this.paddleVX) * k;
    this.paddleVZ += (mz - this.paddleVZ) * k;
    this.pos.x += this.paddleVX * dt;
    this.pos.z += this.paddleVZ * dt;
    this.speed = Math.hypot(this.paddleVX, this.paddleVZ);
    if (len > 0) {
      const want = Math.atan2(mx, mz);
      this.heading += shortestAngle(this.heading, want) * (1 - Math.exp(-dt * P.turnRate));
    }
    this.pos.y = this.waves.height(this.pos.x, this.pos.z) + 0.04;
    this.vy = 0;
    this.carry = 0;

    // Can we catch a wave here?
    const U = CONFIG.popUp;
    const ws = this.waves.waveAt(this.pos.x, this.pos.z, this.sample);
    this.canPopUp = false;
    this.waveIncoming = false;
    if (ws) {
      const rel = ws.ahead / ws.wave.faceWidth;
      this.canPopUp = ws.localAmp >= U.minWaveHeight && rel >= U.minAhead && rel <= U.maxAhead;
    }
    if (!this.canPopUp && this.pos.z < this.waves.tuning.decayStartZ) {
      for (const w of this.waves.waves) {
        const d = this.pos.z - w.crestZ;
        if (d > 0 && d < this.waves.tuning.speed * 3 + w.faceWidth * U.maxAhead && w.amp > U.minWaveHeight) {
          this.waveIncoming = true;
        }
      }
    }

    if (this.canPopUp && ws && input.wasPressed('Space')) {
      // Ride away from the peak unless the player is holding a direction.
      const steer = rx * ix;
      let dir = Math.sign(steer);
      if (dir === 0) dir = Math.sign(this.pos.x - ws.wave.peakX) || 1;
      this.heading = Math.atan2(dir * 0.9, 0.44);
      this.speed = U.startSpeed;
      this.turnVel = 0;
      this.foamTimer = 0;
      this.rideTime = 0;
      this.setState('surf');
      this.model.setPose('stand');
      this.events.push({ type: 'popUp' });
    }
  }

  // ----------------------------------------------------------------- surfing

  /** How strongly a wave carries a board at `ahead` metres in front of its crest. */
  private carryAt(ws: WaveSample): number {
    const wf = ws.wave.faceWidth;
    const back = this.waves.tuning.backWidth;
    const front = 1 - smoothstep(1.0 * wf, 2.0 * wf, ws.ahead);
    const rear = smoothstep(-back * 0.9, -back * 0.2, ws.ahead);
    return front * rear * smoothstep(0.3, 1.0, ws.localAmp);
  }

  /** 0 to 1: is the board on the wave or on the flat water just in front of it? */
  private nearWave(ws: WaveSample): number {
    const wf = ws.wave.faceWidth;
    const back = this.waves.tuning.backWidth;
    const front = 1 - smoothstep(2.6 * wf, 3.5 * wf, ws.ahead);
    const rear = smoothstep(-back * 0.9, -back * 0.2, ws.ahead);
    return front * rear * smoothstep(0.3, 1.0, ws.localAmp);
  }

  private stepSurf(dt: number, input: Input): void {
    const S = CONFIG.surf;
    const A = CONFIG.air;
    const T = this.waves.tuning;
    this.rideTime += dt;

    const ws = this.waves.waveAt(this.pos.x, this.pos.z, this.sample);
    this.carry = ws ? this.carryAt(ws) : 0;
    const near = ws ? this.nearWave(ws) : 0;

    // Steering. A turns left, D turns right, as seen from behind the board.
    const steer = input.axis('KeyD', 'KeyA');
    let turnTarget = steer * S.turnRate;
    if (steer === 0 && near > 0.1 && Math.abs(this.forwardX) > 0.15) {
      // Hands off: settle into a trim line along the wave.
      // Aim a little up or down the face to drift back to the sweet spot.
      const side = this.forwardX > 0 ? 1 : -1;
      const off = ws ? clamp((ws.ahead / ws.wave.faceWidth - S.trimLine) * 0.7, -0.45, 0.45) : 0;
      const along = side * (Math.PI / 2 + off * this.carry);
      turnTarget = clamp(shortestAngle(this.heading, along) * 3, -S.autoTrim, S.autoTrim) * near;
    }
    this.turnVel += (turnTarget - this.turnVel) * (1 - Math.exp(-dt * S.turnResponse));
    this.heading += this.turnVel * dt;
    const fx = this.forwardX;
    const fz = this.forwardZ;

    this.waves.gradient(this.pos.x, this.pos.z, this.grad);
    const gx = this.grad.x;
    const gz = this.grad.z;
    const slopeAlong = gx * fx + gz * fz;
    const slopeMag = Math.hypot(gx, gz);

    this.pumping = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    let accel = -S.slopeGravity * slopeAlong * (slopeAlong > 0 ? S.climbEase : 1);
    accel += S.trimAccel * Math.min(1, slopeMag) * Math.abs(fx) * this.carry;
    if (this.pumping) accel += S.pumpAccel * (0.3 + 0.7 * near);
    if (input.isDown('KeyW')) accel += S.leanAccel * near;
    let drag = S.drag + (1 - near) * S.offWaveDrag;
    if (input.isDown('KeyS')) drag += S.brakeDrag;
    accel -= drag * this.speed;
    this.speed = Math.max(0, this.speed + accel * dt);
    const cap = this.pumping ? S.pumpMaxSpeed : S.maxSpeed;
    if (this.speed > cap) this.speed -= (this.speed - cap) * Math.min(1, 3 * dt);

    // A stalled board slides down the face and swings its nose downhill.
    if (this.speed < S.slideSpeed && this.carry > 0.3 && slopeMag > 0.05) {
      const stall = 1 - this.speed / S.slideSpeed;
      this.pos.x -= gx * S.slideRate * stall * dt;
      this.pos.z -= gz * S.slideRate * stall * dt;
      const downhill = Math.atan2(-gx, -gz);
      this.heading += shortestAngle(this.heading, downhill) * Math.min(1, 1.6 * stall * dt);
    }

    this.pos.x += this.speed * fx * dt;
    this.pos.z += (this.speed * fz + T.speed * this.carry) * dt;

    // Follow the surface, and notice when it drops away faster than gravity.
    const surfaceY = this.waves.height(this.pos.x, this.pos.z);
    const surfaceVY = (surfaceY - this.pos.y) / dt;
    const offLip =
      this.vy > A.minLaunchSpeed && this.vy - A.gravity * A.lipStick * dt > surfaceVY + 0.1 && this.stateTime > 0.15;
    const jump = input.wasPressed('Space') && this.stateTime > 0.12;
    if (offLip || jump) {
      let vy = Math.max(this.vy, 0);
      if (offLip) vy *= A.lipLaunchBoost;
      if (jump) {
        const rise = clamp(surfaceY / (T.height * 0.8), 0, 1);
        vy += A.jumpImpulse + A.jumpSpeedBoost * this.speed * rise;
      }
      vy = Math.min(vy, A.maxLaunchSpeed);
      this.launch(vy, offLip, ws);
      return;
    }
    this.pos.y = surfaceY;
    this.vy = surfaceVY;

    // Sitting in the whitewater at the crest for too long ends badly.
    if (ws && ws.foam > 0.6 && ws.localAmp > 0.8 && ws.ahead > -2.5 && ws.ahead < ws.wave.faceWidth * 0.8) {
      this.foamTimer += dt;
      if (this.foamTimer > S.foamGrace) {
        this.wipeout('foam');
        return;
      }
    } else {
      this.foamTimer = Math.max(0, this.foamTimer - dt * 2);
    }

    // The ride is over once the wave has gone and the board has slowed, or at the beach.
    const atBeach = this.pos.z > CONFIG.world.shoreZ - 6;
    if ((near < 0.05 && this.speed < S.endSpeed) || atBeach) {
      this.endRide();
    }
  }

  private launch(vy: number, offLip: boolean, ws: WaveSample | null): void {
    this.airVX = this.speed * this.forwardX;
    this.airVZ = this.speed * this.forwardZ;
    this.airFrame = this.waves.tuning.speed * this.carry;
    this.airWave = ws && this.carry > 0.3 ? ws.wave : null;
    this.launchSpeed = this.speed;
    this.launchY = this.pos.y;
    this.vy = vy;
    this.spin = 0;
    this.flip = 0;
    this.spinVel = 0;
    this.flipVel = 0;
    this.airTime = 0;
    this.airPeak = 0;
    this.setState('air');
    this.model.setPose('air');
    this.events.push({ type: 'launch', speed: this.speed, offLip });
  }

  private stepAir(dt: number, input: Input): void {
    const A = CONFIG.air;
    const T = this.waves.tuning;
    this.airTime += dt;
    this.rideTime += dt;
    this.vy -= A.gravity * dt;
    this.pos.y += this.vy * dt;
    this.airPeak = Math.max(this.airPeak, this.pos.y - this.launchY);

    // Arcade help: drift back over the face of the wave we launched from.
    const w = this.airWave;
    if (w && this.waves.waves.includes(w) && w.amp > 0.6) {
      const ahead = this.pos.z - w.crestZ;
      const want = clamp((w.faceWidth * 0.95 - ahead) * A.waveMagnet, -9, 9);
      this.airVZ += (want - this.airVZ) * Math.min(1, 2.5 * dt);
      this.airFrame += (T.speed - this.airFrame) * Math.min(1, 4 * dt);
    }
    this.pos.x += this.airVX * dt;
    this.pos.z += (this.airVZ + this.airFrame) * dt;

    // Tricks: Q/E spin, W/S flip. Let go and the board levels itself out.
    const spinIn = input.axis('KeyE', 'KeyQ');
    const flipIn = input.axis('KeyS', 'KeyW');
    const k = 1 - Math.exp(-dt * A.rotationResponse);
    const spinTarget =
      spinIn !== 0 ? spinIn * A.spinRate : clamp(-offNearest(this.spin, Math.PI) * 5, -A.settleRate, A.settleRate);
    const flipTarget =
      flipIn !== 0 ? flipIn * A.flipRate : clamp(-offNearest(this.flip, TAU) * 5, -A.settleRate, A.settleRate);
    this.spinVel += (spinTarget - this.spinVel) * k;
    this.flipVel += (flipTarget - this.flipVel) * k;
    this.spin += this.spinVel * dt;
    this.flip += this.flipVel * dt;

    const surfaceY = this.waves.height(this.pos.x, this.pos.z);
    if (this.pos.y <= surfaceY && this.vy < 0) {
      this.pos.y = surfaceY;
      const spinErr = Math.abs(offNearest(this.spin, Math.PI));
      const flipErr = Math.abs(offNearest(this.flip, TAU));
      if (spinErr > A.spinLandTolerance || flipErr > A.flipLandTolerance) {
        this.wipeout('landing');
        return;
      }
      // Clean landing: point back down the face and keep the speed.
      const vx = this.airVX;
      const vz = Math.max(Math.abs(this.airVZ), Math.abs(vx) * 0.3, 2);
      this.heading = Math.atan2(vx, vz);
      this.speed = Math.max(Math.hypot(this.airVX, this.airVZ), this.launchSpeed) * A.landSpeedKeep;
      this.events.push({
        type: 'land',
        airTime: this.airTime,
        spin: this.spin,
        flip: this.flip,
        height: this.airPeak,
      });
      this.spin = 0;
      this.flip = 0;
      this.vy = 0;
      this.turnVel = 0;
      this.landSquash = 1;
      this.setState('surf');
      this.model.setPose('stand');
    }
  }

  // ------------------------------------------------------- wipeout and reset

  private wipeout(reason: 'landing' | 'foam'): void {
    this.setState('wipeout');
    this.model.setPose('tumble');
    this.tumble = 0;
    // Keep a little momentum so the tumble carries forward.
    this.paddleVX = this.speed * this.forwardX * 0.4;
    this.paddleVZ = (this.speed * this.forwardZ + this.carry * this.waves.tuning.speed) * 0.4;
    this.speed = 0;
    this.carry = 0;
    this.events.push({ type: 'wipeout', reason });
  }

  private stepWipeout(dt: number): void {
    this.tumble += dt * 9;
    const k = Math.exp(-dt * 2.2);
    this.paddleVX *= k;
    this.paddleVZ *= k;
    this.pos.x += this.paddleVX * dt;
    this.pos.z += this.paddleVZ * dt;
    const surfaceY = this.waves.height(this.pos.x, this.pos.z);
    this.vy -= CONFIG.air.gravity * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y < surfaceY - 0.25) {
      this.pos.y = surfaceY - 0.25;
      this.vy = 0;
    }
    if (this.stateTime >= CONFIG.wipeout.duration) {
      this.paddleVX = 0;
      this.paddleVZ = 0;
      this.heading = Math.PI;
      this.spin = 0;
      this.flip = 0;
      this.setState('paddle');
      this.model.setPose('prone');
      this.events.push({ type: 'respawn' });
    }
  }

  private endRide(): void {
    this.paddleVX = this.speed * this.forwardX;
    this.paddleVZ = this.speed * this.forwardZ;
    this.carry = 0;
    this.setState('paddle');
    this.model.setPose('prone');
    this.events.push({ type: 'rideEnd', rideTime: this.rideTime });
  }

  // ------------------------------------------------------------------ visual

  private qAlign = new THREE.Quaternion();
  private qLocal = new THREE.Quaternion();
  private qUpright = new THREE.Quaternion();
  private qInv = new THREE.Quaternion();
  private qMount = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private up = new THREE.Vector3(0, 1, 0);
  private tmpN = new THREE.Vector3();

  /** Move the model to match the physics. Call once per rendered frame. */
  updateVisual(dt: number): void {
    const grounded = this.state === 'surf' || this.state === 'paddle';
    if (grounded) {
      this.waves.gradient(this.pos.x, this.pos.z, this.grad);
      this.tmpN.set(-this.grad.x, 1, -this.grad.z).normalize();
    } else {
      this.tmpN.set(0, 1, 0);
    }
    this.normal.lerp(this.tmpN, 1 - Math.exp(-dt * 14)).normalize();

    const leanTarget = this.state === 'surf' ? this.turnVel / CONFIG.surf.turnRate : 0;
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-dt * 8));
    this.landSquash = Math.max(0, this.landSquash - dt * 3);

    this.qAlign.setFromUnitVectors(this.up, this.normal);
    this.euler.set(this.flip, this.heading + this.spin, -this.lean * 0.5, 'YXZ');
    this.qLocal.setFromEuler(this.euler);
    this.model.boardPivot.quaternion.copy(this.qAlign).multiply(this.qLocal);
    // The board tilts with the wave face, but a standing rider stays closer to upright.
    if (this.state === 'surf') {
      this.qUpright.setFromEuler(this.euler.set(0, this.heading, -this.lean * 0.5, 'YXZ'));
      this.qUpright.slerp(this.model.boardPivot.quaternion, 0.45);
      this.qInv.copy(this.model.boardPivot.quaternion).invert();
      this.qMount.copy(this.qInv).multiply(this.qUpright);
    } else {
      this.qMount.identity();
    }
    this.model.mount.quaternion.slerp(this.qMount, 1 - Math.exp(-dt * 12));
    this.model.root.position.copy(this.pos);
    this.model.root.position.y += 0.06;

    const paddling = this.state === 'paddle' ? clamp(this.speed / CONFIG.paddle.speed, 0, 1.4) : 0;
    const crouch = clamp((this.pumping && this.state === 'surf' ? 0.6 : 0) + this.landSquash + Math.abs(this.lean) * 0.3, 0, 1);
    this.model.update(dt, paddling, crouch, this.tumble);
  }
}
