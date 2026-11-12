import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Input } from '../core/input';
import type { WaveSystem } from '../ocean/waves';
import type { Surfer } from '../player/surfer';

const TAU = Math.PI * 2;
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Third-person camera.
 * - Paddling: free mouse look around the surfer.
 * - Surfing: swings in behind the surfer on the beach side of the wave, so
 *   the face is always in view. The mouse still nudges the view.
 *
 * `yaw` is the direction from the surfer to the camera: the camera sits at
 * surfer + (sin yaw, 0, cos yaw) * distance.
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  private pitch = 0.12;
  private mouseYaw = 0;
  private lineDir = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private want = new THREE.Vector3();
  private shake = 0;
  private started = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, aspect, 0.3, 4000);
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt: number, surfer: Surfer, input: Input, waves: WaveSystem): void {
    const C = CONFIG.camera;
    const riding = surfer.state === 'surf' || surfer.state === 'air';
    let dist = C.distance;
    let height = C.height;

    this.pitch = Math.min(0.9, Math.max(-0.12, this.pitch + input.mouseDY * C.mouseSensitivity));

    if (riding) {
      // Which way along the wave are we going? Saturates quickly so the camera commits to a side.
      const along = Math.max(-1, Math.min(1, surfer.forwardX * 1.7));
      this.lineDir += (along - this.lineDir) * (1 - Math.exp(-dt * 3));
      const side = -this.lineDir * C.distance;
      const back = C.shoreBias + (1 - Math.abs(this.lineDir)) * C.distance * 0.8;
      const targetYaw = Math.atan2(side, back);
      dist = Math.hypot(side, back);
      // The mouse offsets the view, then it drifts back.
      this.mouseYaw -= input.mouseDX * C.mouseSensitivity;
      this.mouseYaw *= Math.exp(-dt * 1.2);
      this.mouseYaw = Math.max(-1.2, Math.min(1.2, this.mouseYaw));
      this.yaw += shortestAngle(this.yaw, targetYaw + this.mouseYaw) * (1 - Math.exp(-dt * C.yawFollow));
      if (surfer.state === 'air') dist += C.airPullBack;
    } else {
      this.yaw -= input.mouseDX * C.mouseSensitivity;
      this.mouseYaw = 0;
      this.lineDir *= Math.exp(-dt * 2);
      dist = C.distance * 0.8;
      height = C.height * 0.85;
    }

    const p = surfer.pos;
    this.want.set(
      p.x + Math.sin(this.yaw) * dist,
      p.y + height + this.pitch * 7,
      p.z + Math.cos(this.yaw) * dist,
    );
    const ahead = riding ? C.lookAhead : 0;
    this.lookTarget.set(p.x + surfer.forwardX * ahead * Math.abs(this.lineDir), p.y + 1.3, p.z);

    if (!this.started) {
      this.pos.copy(this.want);
      this.look.copy(this.lookTarget);
      this.started = true;
    }
    const k = 1 - Math.exp(-dt * C.positionFollow);
    this.pos.lerp(this.want, k);
    this.look.lerp(this.lookTarget, 1 - Math.exp(-dt * C.positionFollow * 1.6));

    // Never dip under the water.
    const floor = waves.height(this.pos.x, this.pos.z) + 1.1;
    if (this.pos.y < floor) this.pos.y = floor;

    this.camera.position.copy(this.pos);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 6);
    }
    this.camera.lookAt(this.look);

    const speedT = Math.min(1, surfer.displaySpeed / (CONFIG.surf.pumpMaxSpeed + CONFIG.waves.venice.speed));
    const fov = C.fov + C.speedFov * (riding ? speedT : 0);
    if (Math.abs(fov - this.camera.fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 4));
      this.camera.updateProjectionMatrix();
    }
  }
}
