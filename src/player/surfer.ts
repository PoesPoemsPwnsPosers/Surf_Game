import * as THREE from 'three';
import { CONFIG, type BoardTuning } from '../config';
import type { Input } from '../core/input';
import { lipTopAt } from '../ocean/lip';
import { WaveSystem, clamp, smoothstep, type Wave, type WaveSample } from '../ocean/waves';
import { SurferModel } from './surferModel';

export type SurferState = 'paddle' | 'surf' | 'air' | 'wipeout';

/** Things that happened this step. The HUD, effects and (later) scoring listen to these. */
export type SurferEvent =
  | { type: 'popUp' }
  | { type: 'launch'; speed: number; offLip: boolean; seaward: boolean }
  | {
      type: 'land';
      airTime: number;
      spin: number;
      flip: number;
      height: number;
      /** Seconds the grab was held, or 0. */
      grab: number;
      /** Flew out the back toward the ocean. */
      seaward: boolean;
      /** Landed on a different wave from the one it left. */
      hopped: boolean;
      onWave: boolean;
      kicks: number;
    }
  | { type: 'trick'; name: string; key: WaveTrick }
  /** A counted wave trick finished. `time` is how long it was held. */
  | { type: 'trickEnd'; name: string; key: WaveTrick; time: number }
  /** Came out of the barrel after `time` seconds inside. */
  | { type: 'barrel'; time: number }
  /** Came off the top of the curling lip after riding it for `time` seconds. */
  | { type: 'lipRide'; time: number }
  | { type: 'kick' }
  | { type: 'spray'; power: number }
  | { type: 'board'; name: string }
  | { type: 'wipeout'; reason: 'landing' | 'foam' | 'lip' }
  | { type: 'rideEnd'; rideTime: number }
  | { type: 'respawn' };

export type WaveTrick = 'cutback' | 'snap' | 'hangTen' | 'tailSlide' | 'floater';
const TRICK_NAMES: Record<WaveTrick, string> = {
  cutback: 'Cutback',
  snap: 'Snap',
  hangTen: 'Hang ten',
  tailSlide: 'Tail slide',
  floater: 'Floater',
};

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

  /** True while flying out the back toward the ocean, false for an air back onto the face. */
  seaward = false;
  private launchWave: Wave | null = null;
  grabbing = false;
  private grabTime = 0;
  private kicksUsed = 0;
  private airYaw = 0;
  private landAssist = 0;
  /** Counts down after a landing while the board skims with little drag. */
  private landGlide = 0;
  /** True while the curling lip is overhead, wherever on the face the board is. */
  underLip = false;
  private landSide = 1;
  /** 1 on a normal stretch of wave, more on a taller bowl section. */
  bowlBoost = 1;
  /** Banked air kicks. Whole numbers are usable; the fraction is progress to the next. */
  kickCharges = CONFIG.air.kickStartCharges;

  // Boards
  boardTier = 0;
  get board(): BoardTuning {
    return CONFIG.boards[this.boardTier];
  }

  // Wave tricks
  trick: WaveTrick | null = null;
  private trickTime = 0;
  private trickSide = 1;
  private trickCounted = false;
  private trickCooldown = 0;
  private trickKey = 'KeyQ';

  /** True while riding on top of the curling lip. */
  onLip = false;
  lipTime = 0;
  /** True while tucked under the curling lip next to the whitewater. */
  inBarrel = false;
  barrelTime = 0;

  private foamTimer = 0;
  private tumble = 0;
  private landSquash = 0;
  private normal = new THREE.Vector3(0, 1, 0);
  private grad = { x: 0, z: 0 };
  private sample: WaveSample = { wave: null as unknown as Wave, ahead: 0, localAmp: 0, foam: 0 };
  readonly events: SurferEvent[] = [];

  constructor(private waves: WaveSystem) {
    this.reset();
    this.setBoard(CONFIG.startingBoardTier);
  }

  /** Switch to another board tier (0 is the starter). */
  setBoard(tier: number): void {
    this.boardTier = clamp(Math.round(tier), 0, CONFIG.boards.length - 1);
    const b = this.board;
    this.model.setBoard(b.scale, b.color, b.stripe);
    this.events.push({ type: 'board', name: b.name });
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

  /** Flight velocity over the water while airborne. */
  get flightVX(): number {
    return this.airVX;
  }
  get flightVZ(): number {
    return this.airVZ + this.airFrame;
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

  /** Is the lip here too big to fly over? Tall peaks and the pitching pocket next to the whitewater are. */
  private lipOverwhelming(ws: WaveSample): boolean {
    const A = CONFIG.air;
    if (ws.localAmp > A.lipOverwhelmHeight) return true;
    const w = ws.wave;
    if (w.brokenHalfWidth >= 0) {
      const fromFoam = Math.abs(this.pos.x - w.peakX) - w.brokenHalfWidth;
      if (fromFoam >= 0 && fromFoam < A.pocketWidth) return true;
    }
    return false;
  }

  private startTrick(t: WaveTrick): void {
    this.trick = t;
    this.trickTime = 0;
    this.trickCounted = false;
    this.trickSide = this.forwardX >= 0 ? 1 : -1;
    this.trickKey = t === 'snap' || t === 'floater' ? 'KeyE' : 'KeyQ';
    if (t === 'hangTen') this.model.setPose('hangTen');
    else if (t === 'tailSlide') this.model.setPose('slide');
    else if (t === 'floater') this.model.setPose('float');
  }

  /** The trick has been held or carried far enough to count: announce it and bank a little air kick. */
  private countTrick(): void {
    if (this.trickCounted || !this.trick) return;
    this.trickCounted = true;
    this.addKick(CONFIG.air.kickPerWaveTrick);
    this.events.push({ type: 'trick', name: TRICK_NAMES[this.trick], key: this.trick });
  }

  private endTrick(): void {
    const K = CONFIG.tricks;
    if (this.trick === 'floater' && this.trickCounted) this.speed += K.floater.speedGain;
    if (this.trick && this.trickCounted) {
      this.events.push({ type: 'trickEnd', name: TRICK_NAMES[this.trick], key: this.trick, time: this.trickTime });
    }
    this.trick = null;
    this.trickCooldown = K.cooldown;
    this.model.boardYaw = 0;
    if (this.state === 'surf') this.model.setPose('stand');
  }

  private endBarrel(): void {
    if (!this.inBarrel) return;
    this.inBarrel = false;
    if (this.barrelTime >= CONFIG.barrel.minTime) this.events.push({ type: 'barrel', time: this.barrelTime });
    this.barrelTime = 0;
  }

  private endLipRide(): void {
    if (!this.onLip) return;
    this.onLip = false;
    if (this.lipTime >= CONFIG.points.lipRideMinTime) this.events.push({ type: 'lipRide', time: this.lipTime });
    this.lipTime = 0;
  }

  /** Height of whatever the board is riding on: the lip when it is up there, otherwise the water. */
  private surfaceHeight(x: number, z: number): number {
    const h = this.waves.height(x, z);
    return this.onLip ? Math.max(h, lipTopAt(this.waves, x, z)) : h;
  }

  private surfaceGradient(x: number, z: number, out: { x: number; z: number }): void {
    if (!this.onLip) {
      this.waves.gradient(x, z, out);
      return;
    }
    const e = 0.35;
    out.x = (this.surfaceHeight(x + e, z) - this.surfaceHeight(x - e, z)) / (2 * e);
    out.z = (this.surfaceHeight(x, z + e) - this.surfaceHeight(x, z - e)) / (2 * e);
  }

  private addKick(amount: number): void {
    this.kickCharges = Math.min(CONFIG.air.kickMaxCharges, this.kickCharges + amount);
  }

  private stepSurf(dt: number, input: Input): void {
    const S = CONFIG.surf;
    const A = CONFIG.air;
    const K = CONFIG.tricks;
    const B = this.board;
    const T = this.waves.tuning;
    this.rideTime += dt;

    const ws = this.waves.waveAt(this.pos.x, this.pos.z, this.sample);
    this.carry = ws ? this.carryAt(ws) : 0;
    const near = ws ? this.nearWave(ws) : 0;

    // ---- Barrel: tucked under the curling lip, just ahead of where the wave is breaking.
    const BR = CONFIG.barrel;
    let tubed = false;
    this.underLip = false;
    if (!this.onLip && ws && this.carry > 0.3 && ws.wave.brokenHalfWidth >= 0 && ws.localAmp > BR.minHeight) {
      const fromFoam = Math.abs(this.pos.x - ws.wave.peakX) - ws.wave.brokenHalfWidth;
      const up = ws.ahead / ws.wave.faceWidth;
      // The lip is overhead from the crest out to where it comes down in front. It thins toward the shoulder.
      this.underLip = fromFoam > BR.inside && fromFoam < BR.width * 0.8 && up > -0.1 && up < BR.maxAhead;
      tubed = this.carry > 0.5 && fromFoam > BR.inside && fromFoam < BR.width && up > BR.minAhead && up < BR.maxAhead;
    }
    if (tubed) {
      this.inBarrel = true;
      this.barrelTime += dt;
    } else if (this.inBarrel) {
      this.endBarrel();
    }

    // ---- Wave tricks: Q cutback, E snap, W+Q hang ten, S+Q tail slide, W+E floater.
    this.trickCooldown = Math.max(0, this.trickCooldown - dt);
    if (!this.trick && this.trickCooldown <= 0 && this.carry > 0.4 && this.stateTime > 0.3) {
      const w = input.isDown('KeyW');
      const s = input.isDown('KeyS');
      if (input.wasPressed('KeyQ')) this.startTrick(w ? 'hangTen' : s ? 'tailSlide' : 'cutback');
      else if (input.wasPressed('KeyE')) this.startTrick(w ? 'floater' : 'snap');
    }
    const trick = this.trick;
    if (trick) this.trickTime += dt;
    const tt = this.trickTime;
    this.landAssist = Math.max(0, this.landAssist - dt);
    const settling = this.landAssist > 0 && !trick;
    const side = trick ? this.trickSide : settling ? this.landSide : this.forwardX > 0 ? 1 : -1;
    const trimHeading = side * (Math.PI / 2);

    // ---- Steering. A turns left, D turns right, as seen from behind the board.
    const steer = trick ? 0 : input.axis('KeyD', 'KeyA');
    let turnTarget = steer * B.turnRate;
    let trimLine = S.trimLine;
    let accelBonus = 0;
    let capBoost = 1;
    let extraDrag = 0;
    let holdOver = false;
    if (trick === 'cutback') {
      const C = K.cutback;
      // Swing down the face and back toward the whitewater, then rebound to the trim line.
      const goal = tt < C.duration * 0.5 ? -side * C.swing : trimHeading;
      turnTarget = clamp(shortestAngle(this.heading, goal) * 9, -C.turnRate, C.turnRate);
      if (tt > C.duration * 0.5) this.countTrick();
      if (tt > C.duration) holdOver = true;
    } else if (trick === 'snap') {
      const N = K.snap;
      if (tt < N.climbTime) {
        turnTarget = clamp(shortestAngle(this.heading, side * (Math.PI / 2 + N.angle)) * 10, -N.climbTurnRate, N.climbTurnRate);
      } else {
        if (!this.trickCounted) {
          this.countTrick();
          this.speed += N.speedGain;
          this.events.push({ type: 'spray', power: 1 });
        }
        turnTarget = clamp(shortestAngle(this.heading, side * (Math.PI / 2 - N.angle)) * 12, -N.whipTurnRate, N.whipTurnRate);
        // The tail whips round further than the board's path does.
        const u = (tt - N.climbTime) / N.whipTime;
        this.model.boardYaw = -side * 0.9 * Math.sin(Math.min(1, u) * Math.PI);
        if (u >= 1) holdOver = true;
      }
    } else if (trick === 'hangTen') {
      const H = K.hangTen;
      accelBonus = H.accel;
      capBoost = H.topSpeedBoost;
      if (tt > H.minTime) this.countTrick();
      if (tt > H.maxTime || !input.isDown(this.trickKey)) holdOver = true;
    } else if (trick === 'tailSlide') {
      const L = K.tailSlide;
      extraDrag = L.drag;
      this.model.boardYaw = side * L.angle * smoothstep(0, 0.18, tt);
      if (tt > L.minTime) this.countTrick();
      if (tt > L.maxTime || !input.isDown(this.trickKey)) holdOver = true;
    } else if (trick === 'floater') {
      const F = K.floater;
      trimLine = F.line;
      if (ws) {
        // Pull the board up onto the crest and hold it there.
        const want = clamp((F.line * ws.wave.faceWidth - ws.ahead) * 5, -F.climbSpeed, F.climbSpeed);
        this.pos.z += want * dt;
        if (Math.abs(ws.ahead - F.line * ws.wave.faceWidth) < 1.2 && tt > F.minTime) this.countTrick();
      }
      if (tt > F.maxTime || !input.isDown(this.trickKey)) holdOver = true;
    }
    // A cutback swings out onto the flat in front of the wave, so it only ends early if the wave is lost.
    if (trick && (holdOver || (trick === 'cutback' ? near < 0.1 : this.carry < 0.15))) this.endTrick();

    const handsOff = steer === 0 && trick !== 'cutback' && trick !== 'snap';
    if (handsOff && near > 0.1 && (settling || Math.abs(this.forwardX) > 0.15)) {
      // Hands off: settle into a trim line along the wave.
      // Aim a little up or down the face to drift back to the sweet spot.
      const off = ws ? clamp((ws.ahead / ws.wave.faceWidth - trimLine) * 0.7, -0.45, 0.45) : 0;
      const along = side * (Math.PI / 2 + off * this.carry);
      const rate = S.autoTrim * (settling ? A.landCarveBoost : 1);
      turnTarget = clamp(shortestAngle(this.heading, along) * 3, -rate, rate) * near;
    }
    const response = trick === 'cutback' || trick === 'snap' ? 22 : S.turnResponse;
    this.turnVel += (turnTarget - this.turnVel) * (1 - Math.exp(-dt * response));
    this.heading += this.turnVel * dt;
    const fx = this.forwardX;
    const fz = this.forwardZ;

    this.surfaceGradient(this.pos.x, this.pos.z, this.grad);
    const gx = this.grad.x;
    const gz = this.grad.z;
    const slopeAlong = gx * fx + gz * fz;
    const slopeMag = Math.hypot(gx, gz);

    this.pumping = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    let accel = -S.slopeGravity * slopeAlong * (slopeAlong > 0 ? S.climbEase : 1);
    accel += B.trimAccel * Math.min(1, slopeMag) * Math.abs(fx) * this.carry * this.bowlBoost * this.bowlBoost;
    if (this.pumping) accel += B.pumpAccel * (0.3 + 0.7 * near);
    if (input.isDown('KeyW') && !trick) accel += S.leanAccel * near;
    accel += accelBonus;
    // Fresh off a landing the board skims across flat water instead of bogging down.
    this.landGlide = Math.max(0, this.landGlide - dt);
    const glide = 1 - (1 - A.landGlideDrag) * Math.min(1, (this.landGlide / A.landGlideTime) * 2);
    let drag = S.drag + (1 - near) * S.offWaveDrag * glide + extraDrag;
    if (input.isDown('KeyS') && !trick) drag += S.brakeDrag;
    accel -= drag * this.speed;
    this.speed = Math.max(0, this.speed + accel * dt);
    // Taller sections of the wave (bowls) are faster: more top speed while the board is on one.
    const bowl = ws ? 1 + S.bowlSpeed * clamp(ws.localAmp / (T.height * (1 + T.peakBonus * 0.5)) - 1, 0, 0.5) * this.carry : 1;
    this.bowlBoost = bowl;
    const cap = (this.pumping ? B.pumpMaxSpeed : B.maxSpeed) * capBoost * bowl;
    if (this.speed > cap) this.speed -= (this.speed - cap) * Math.min(1, 3 * dt);

    // Riding flat out slowly earns an air kick.
    if (this.carry > 0.5 && this.speed > B.maxSpeed * A.kickFastFraction) this.addKick(A.kickPerSecondFast * dt);

    // A stalled board slides down the face and swings its nose downhill.
    if (this.speed < S.slideSpeed && this.carry > 0.3 && slopeMag > 0.05 && !trick) {
      const stall = 1 - this.speed / S.slideSpeed;
      this.pos.x -= gx * S.slideRate * stall * dt;
      this.pos.z -= gz * S.slideRate * stall * dt;
      const downhill = Math.atan2(-gx, -gz);
      this.heading += shortestAngle(this.heading, downhill) * Math.min(1, 1.6 * stall * dt);
    }

    this.pos.x += this.speed * fx * dt;
    this.pos.z += (this.speed * fz + T.speed * this.carry) * dt;

    // Follow the surface, and notice when it drops away faster than gravity.
    const waveY = this.waves.height(this.pos.x, this.pos.z);
    // The curling lip is solid from above: coming at it from the crest, the board rides up onto it.
    const lipY = lipTopAt(this.waves, this.pos.x, this.pos.z);
    const lipHere = lipY > waveY + 0.15;
    if (!this.onLip && lipHere && this.pos.y >= lipY - BR.lipStepUp) {
      this.onLip = true;
      this.lipTime = 0;
      this.inBarrel = false;
      this.barrelTime = 0;
    } else if (this.onLip && !lipHere) {
      // Ran off the end of the lip. If there is a drop, it is a launch.
      this.endLipRide();
      if (this.pos.y - waveY > 0.6) {
        if (this.trick) this.endTrick();
        this.launch(Math.max(this.vy, 0), false, ws);
        return;
      }
    }
    if (this.onLip) this.lipTime += dt;
    const surfaceY = this.onLip ? lipY : waveY;
    const surfaceVY = (surfaceY - this.pos.y) / dt;
    const offLip =
      !this.trick &&
      !this.onLip &&
      this.vy > A.minLaunchSpeed &&
      this.vy - A.gravity * A.lipStick * dt > surfaceVY + 0.1 &&
      this.stateTime > 0.15;
    const jump = input.wasPressed('Space') && this.stateTime > 0.12;
    if ((offLip || jump) && this.underLip) {
      // No way up through a barrel: the lip is in the way.
      this.wipeout('lip');
      return;
    }
    if (offLip || jump) {
      let vy = Math.max(this.vy, 0);
      if (offLip) vy *= A.lipLaunchBoost;
      if (jump) {
        const rise = clamp(surfaceY / (T.height * 0.8), 0, 1);
        vy += A.jumpImpulse + A.jumpSpeedBoost * this.speed * rise;
      }
      vy = Math.min(vy, B.launchPower);
      if (this.trick) this.endTrick();
      this.endBarrel();
      this.endLipRide();
      this.launch(vy, offLip, ws);
      return;
    }
    this.pos.y = surfaceY;
    this.vy = surfaceVY;

    // Sitting in the whitewater at the crest for too long ends badly. A floater is the exception.
    const inFoam =
      ws && ws.foam > 0.6 && ws.localAmp > 0.8 && ws.ahead > -2.5 && ws.ahead < ws.wave.faceWidth * CONFIG.surf.foamZone;
    if (inFoam && this.trick !== 'floater' && !this.onLip) {
      this.foamTimer += dt;
      if (this.foamTimer > B.foamGrace) {
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
    const A = CONFIG.air;
    const T = this.waves.tuning;
    const fx = this.forwardX;
    const fz = this.forwardZ;
    // Pointed out to sea over a lip that is not too big: fly out the back.
    // Otherwise the lip throws the board back toward the beach, onto the face.
    // Guiderails shrink on the better boards: a wider take-off angle counts, and a board with
    // little guidance ignores the big-lip rule. With none at all, any seaward lean flies out.
    const g = this.board.guide;
    this.seaward =
      !!ws && this.carry > 0.3 && fz < -A.seawardAim * g && (g < 0.5 || !this.lipOverwhelming(ws));
    this.launchWave = ws ? ws.wave : null;
    if (this.seaward) {
      // From here on airVX/airVZ are speeds over the water, not relative to the wave.
      this.airVX = this.speed * fx;
      this.airVZ = this.speed * fz * A.seawardFling + T.speed * this.carry * A.seawardCarry;
      this.airFrame = 0;
      this.airWave = null;
    } else {
      this.airVX = this.speed * fx;
      this.airVZ = this.speed * fz;
      this.airFrame = T.speed * this.carry;
      this.airWave = ws && this.carry > 0.3 ? ws.wave : null;
    }
    this.launchSpeed = this.speed;
    this.launchY = this.pos.y;
    this.vy = vy;
    this.spin = 0;
    this.flip = 0;
    this.spinVel = 0;
    this.flipVel = 0;
    this.airTime = 0;
    this.airPeak = 0;
    this.grabTime = 0;
    this.grabbing = false;
    this.kicksUsed = 0;
    this.setState('air');
    this.model.setPose('air');
    this.events.push({ type: 'launch', speed: this.speed, offLip, seaward: this.seaward });
  }

  private stepAir(dt: number, input: Input): void {
    const A = CONFIG.air;
    const B = this.board;
    const T = this.waves.tuning;
    this.airTime += dt;
    this.rideTime += dt;
    this.vy -= A.gravity * dt;
    this.pos.y += this.vy * dt;
    this.airPeak = Math.max(this.airPeak, this.pos.y - this.launchY);
    const shift = input.isDown('ShiftLeft') || input.isDown('ShiftRight');

    // A and D bend the flight path.
    const steer = input.axis('KeyD', 'KeyA');
    if (steer !== 0) {
      const a = steer * B.airSteer * dt;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const vx = this.airVX * c + this.airVZ * s;
      const vz = this.airVZ * c - this.airVX * s;
      this.airVX = vx;
      this.airVZ = vz;
    }
    // Shift + W / S: lean forward or back to stretch or shorten the flight (no flip).
    if (shift) {
      const lean = input.axis('KeyS', 'KeyW');
      const v = Math.hypot(this.airVX, this.airVZ);
      if (lean !== 0 && v > 0.01) {
        const base = Math.max(this.launchSpeed, 6);
        const next = clamp(v + lean * B.airDrift * dt, Math.min(v, base * A.driftMinSpeed), Math.max(v, base * A.driftMaxSpeed));
        this.airVX *= next / v;
        this.airVZ *= next / v;
      }
    }

    // Flying out the back: ease off a flight that would sail past the next wave, so it lands on the face.
    if (this.seaward && !shift && A.hopAssist * B.guide > 0 && this.airVZ < 0) {
      let next: Wave | null = null;
      for (const cand of this.waves.waves) {
        if (cand === this.launchWave || cand.crestZ > this.pos.z + 2 || cand.amp < 1.5) continue;
        if (!next || cand.crestZ > next.crestZ) next = cand;
      }
      if (next) {
        const drop = this.pos.y - next.amp * 0.4;
        const tLand = (this.vy + Math.sqrt(Math.max(0, this.vy * this.vy + 2 * A.gravity * drop))) / A.gravity;
        if (tLand > 0.15) {
          const targetZ = next.crestZ + T.speed * tLand + next.faceWidth * 0.8;
          const need = (targetZ - this.pos.z) / tLand;
          // `need` and airVZ are both negative (out to sea). Only ever slow down.
          if (need > this.airVZ) {
            const nextVZ = Math.min(need, this.airVZ + A.hopAssist * B.guide * dt);
            this.airVZ = Math.min(nextVZ, -0.5);
          }
        }
      }
    }

    // Space: air kick, if one is banked.
    if (input.wasPressed('Space') && this.kickCharges >= 1 && this.airTime > 0.15) {
      this.kickCharges -= 1;
      this.kicksUsed++;
      this.vy = Math.max(this.vy + A.kickUp, A.kickUp * 0.75);
      const v = Math.hypot(this.airVX, this.airVZ);
      if (v > 0.5) {
        this.airVX *= (v + A.kickForward) / v;
        this.airVZ *= (v + A.kickForward) / v;
      }
      this.events.push({ type: 'kick' });
    }

    // Arcade help for airs off a big lip: drift back over the face of the wave we launched from.
    const w = this.airWave;
    if (w && B.guide > 0 && this.waves.waves.includes(w) && w.amp > 0.6) {
      const ahead = this.pos.z - w.crestZ;
      const want = clamp((w.faceWidth * 0.95 - ahead) * A.waveMagnet, -9, 9);
      this.airVZ += (want - this.airVZ) * Math.min(1, 2.5 * B.guide * dt);
      this.airFrame += (T.speed - this.airFrame) * Math.min(1, 4 * B.guide * dt);
    }
    this.pos.x += this.airVX * dt;
    this.pos.z += (this.airVZ + this.airFrame) * dt;

    // Tricks: Q/E spin, W/S flip. Let go and the board levels itself out.
    const spinIn = input.axis('KeyE', 'KeyQ');
    const flipIn = shift ? 0 : input.axis('KeyS', 'KeyW');
    const k = 1 - Math.exp(-dt * A.rotationResponse);
    const spinTarget =
      spinIn !== 0 ? spinIn * A.spinRate : clamp(-offNearest(this.spin, Math.PI) * 5, -A.settleRate, A.settleRate);
    const flipTarget =
      flipIn !== 0 ? flipIn * A.flipRate : clamp(-offNearest(this.flip, TAU) * 5, -A.settleRate, A.settleRate);
    this.spinVel += (spinTarget - this.spinVel) * k;
    this.flipVel += (flipTarget - this.flipVel) * k;
    this.spin += this.spinVel * dt;
    this.flip += this.flipVel * dt;

    // F or the right mouse button: grab the rail.
    const grab = input.isDown('KeyF') || input.rightDown;
    if (grab !== this.grabbing) {
      this.grabbing = grab;
      this.model.setPose(grab ? 'grab' : 'air');
    }
    if (grab) this.grabTime += dt;

    // Coming down onto the top of a curling lip lands on it. From any other direction it is just spray.
    const waveY = this.waves.height(this.pos.x, this.pos.z);
    const lipY = lipTopAt(this.waves, this.pos.x, this.pos.z);
    const ontoLip = lipY > waveY + 0.15 && this.vy < 0 && this.pos.y <= lipY && this.pos.y - this.vy * dt >= lipY - 0.25;
    const surfaceY = ontoLip ? lipY : waveY;
    if (this.pos.y <= surfaceY && this.vy < 0) {
      this.pos.y = surfaceY;
      this.onLip = ontoLip;
      this.lipTime = 0;
      const spinErr = Math.abs(offNearest(this.spin, Math.PI));
      const flipErr = Math.abs(offNearest(this.flip, TAU));
      if (spinErr > B.spinLandTolerance || flipErr > B.flipLandTolerance) {
        this.wipeout('landing');
        return;
      }
      // Clean landing: carry the flight's momentum onto the water. No snapping round.
      const ws = this.waves.waveAt(this.pos.x, this.pos.z, this.sample);
      const landCarry = ws ? this.carryAt(ws) : 0;
      const onWave = landCarry > 0.3;
      const hopped = onWave && this.launchWave !== null && ws!.wave !== this.launchWave;
      // Speed relative to the water the board lands on (a wave face is itself moving toward the beach).
      const wx = this.airVX;
      let wz = this.airVZ + this.airFrame - T.speed * landCarry;
      // Coming down against an oncoming face, the face soaks up part of the speed into it.
      if (onWave && wz < 0) wz *= A.landFaceAbsorb;
      const landed = Math.hypot(wx, wz);
      if (landed > 0.5) this.heading = Math.atan2(wx, wz);
      this.speed = landed * A.landSpeedKeep;
      // For a moment the hands-off autopilot carves harder, to bend the landing into a trim line.
      this.landAssist = A.landCarveTime;
      this.landGlide = A.landGlideTime;
      this.landSide = Math.abs(wx) > 1.5 ? Math.sign(wx) : ws ? Math.sign(this.pos.x - ws.wave.peakX) || 1 : 1;
      const grabbed = this.grabTime >= A.grabMinTime;
      const tricked = Math.abs(this.spin) > Math.PI * 0.75 || Math.abs(this.flip) > Math.PI * 1.5 || grabbed;
      if (tricked) this.addKick(A.kickPerAirTrick);
      this.events.push({
        type: 'land',
        airTime: this.airTime,
        spin: this.spin,
        flip: this.flip,
        height: this.airPeak,
        grab: grabbed ? this.grabTime : 0,
        seaward: this.seaward,
        hopped,
        onWave,
        kicks: this.kicksUsed,
      });
      this.spin = 0;
      this.flip = 0;
      this.vy = 0;
      this.turnVel = 0;
      this.landSquash = 1;
      this.grabbing = false;
      this.seaward = false;
      this.trickCooldown = 0.2;
      this.setState('surf');
      this.model.setPose('stand');
    }
  }

  /**
   * Where the current flight will come down if nothing changes. Used for the
   * landing marker. Returns false when not airborne.
   */
  predictLanding(out: THREE.Vector3): boolean {
    if (this.state !== 'air') return false;
    const g = CONFIG.air.gravity;
    const c = this.waves.tuning.speed;
    const vz = this.airVZ + this.airFrame;
    let x = this.pos.x;
    let y = this.pos.y;
    let z = this.pos.z;
    let vy = this.vy;
    const h = 0.04;
    for (let t = h; t < 6; t += h) {
      vy -= g * h;
      y += vy * h;
      x += this.airVX * h;
      z += vz * h;
      // The waves will have rolled toward the beach by then; look that far back along their path.
      const surface = this.waves.height(x, z - c * t);
      if (y <= surface && vy < 0) {
        out.set(x, surface, z);
        return true;
      }
    }
    out.set(x, 0, z);
    return true;
  }

  // ------------------------------------------------------- wipeout and reset

  private wipeout(reason: 'landing' | 'foam' | 'lip'): void {
    // A wipeout throws away whatever was in progress.
    this.trick = null;
    this.model.boardYaw = 0;
    this.onLip = false;
    this.lipTime = 0;
    this.inBarrel = false;
    this.barrelTime = 0;
    this.setState('wipeout');
    this.model.setPose('tumble');
    this.tumble = 0;
    // Keep a little momentum so the tumble carries forward.
    this.paddleVX = this.speed * this.forwardX * 0.4;
    this.paddleVZ = (this.speed * this.forwardZ + this.carry * this.waves.tuning.speed) * 0.4;
    this.speed = 0;
    this.carry = 0;
    this.seaward = false;
    this.grabbing = false;
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
    if (this.trick) this.endTrick();
    this.endBarrel();
    this.endLipRide();
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
      this.surfaceGradient(this.pos.x, this.pos.z, this.grad);
      this.tmpN.set(-this.grad.x, 1, -this.grad.z).normalize();
    } else {
      this.tmpN.set(0, 1, 0);
    }
    this.normal.lerp(this.tmpN, 1 - Math.exp(-dt * 14)).normalize();

    const leanTarget = this.state === 'surf' ? clamp(this.turnVel / this.board.turnRate, -1.4, 1.4) : 0;
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-dt * 8));
    this.landSquash = Math.max(0, this.landSquash - dt * 3);

    // In the air the board points along the flight, plus any spin.
    let yaw = this.heading + this.spin;
    if (this.state === 'air') {
      const vz = this.airVZ + this.airFrame;
      if (Math.hypot(this.airVX, vz) > 1) {
        this.airYaw += shortestAngle(this.airYaw, Math.atan2(this.airVX, vz)) * (1 - Math.exp(-dt * 6));
      }
      yaw = this.airYaw + this.spin;
    } else {
      // On the water the board follows its heading, eased so a landing never snaps.
      this.airYaw += shortestAngle(this.airYaw, this.heading) * (1 - Math.exp(-dt * 20));
      yaw = this.airYaw;
    }

    this.qAlign.setFromUnitVectors(this.up, this.normal);
    this.euler.set(this.flip, yaw, -this.lean * 0.5, 'YXZ');
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
    const crouch = clamp(
      (this.pumping && this.state === 'surf' ? 0.6 : 0) + (this.inBarrel ? 0.8 : 0) + this.landSquash + Math.abs(this.lean) * 0.3,
      0,
      1,
    );
    this.model.update(dt, paddling, crouch, this.tumble);
  }
}
