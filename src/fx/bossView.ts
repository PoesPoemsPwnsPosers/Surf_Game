import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WaterSurface } from '../core/level';
import type { BossFight } from '../game/boss';
import { Spray } from './particles';

const SHOT_LOOK: Record<string, { color: number; size: number }> = {
  squirter: { color: 0x6fe3ff, size: 0.28 },
  coconut: { color: 0x7a4a22, size: 0.6 },
  trident: { color: 0xffd23f, size: 0.34 },
};

const BODY = 0x6b4fa3;
const BODY_ANGRY = 0xc23b5a;

/** One wing: a flat triangle hinged along the body, so it can flap. */
function wingGeometry(side: 1 | -1): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // Root front, root back, tip, and a mid point for a little thickness on top.
  const v = [0, 0, 2.2, 0, 0, -1.9, side * 4.6, 0, -0.3, side * 1.4, 0.45, 0.1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(side === 1 ? [0, 2, 3, 3, 2, 1, 0, 3, 1, 0, 1, 2] : [0, 3, 2, 3, 1, 2, 0, 1, 3, 0, 2, 1]);
  g.computeVertexNormals();
  return g;
}

/**
 * Draws the boss fight: the Stingray, the player's shots, the warning rings
 * of its tail strikes and their splashes. Reads everything from BossFight.
 */
export class BossView {
  readonly group = new THREE.Group();
  private ray = new THREE.Group();
  private wings: THREE.Mesh[] = [];
  private tail = new THREE.Group();
  private skin: THREE.MeshStandardMaterial;
  private shots: THREE.InstancedMesh;
  private shotMat: THREE.MeshBasicMaterial;
  private rings: { ring: THREE.Mesh; disc: THREE.Mesh }[] = [];
  private bolts: { mesh: THREE.Mesh; life: number }[] = [];
  private spray = new Spray(260);
  private dummy = new THREE.Object3D();
  private clock = 0;
  private sink = 0;
  private wasActive = false;
  private look = new THREE.Vector3();
  private calm = new THREE.Color(BODY);
  private angry = new THREE.Color(BODY_ANGRY);

  constructor(private water: WaterSurface) {
    this.skin = new THREE.MeshStandardMaterial({ color: BODY, flatShading: true, roughness: 0.75 });
    const belly = new THREE.MeshStandardMaterial({ color: 0xe9e2f5, flatShading: true, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a1c44, flatShading: true });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffe14d });

    // Body: a squashed diamond, nose toward +Z.
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), this.skin);
    body.scale.set(1.9, 0.7, 2.6);
    const under = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), belly);
    under.scale.set(1.7, 0.45, 2.4);
    under.position.y = -0.22;
    this.ray.add(body, under);
    for (const side of [1, -1] as const) {
      const wing = new THREE.Mesh(wingGeometry(side), this.skin);
      wing.position.set(side * 0.9, 0.05, 0);
      this.wings.push(wing);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), glow);
      eye.position.set(side * 0.75, 0.42, 1.5);
      this.ray.add(wing, eye);
    }
    // Tail: three thin segments and a barb, swung by updateTail.
    let parent: THREE.Object3D = this.tail;
    this.tail.position.set(0, 0, -2.3);
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.04, 0.22 - i * 0.04, 2.2, 5), dark);
      seg.rotation.x = Math.PI / 2;
      seg.position.z = -1.1;
      const joint = new THREE.Group();
      joint.position.z = i === 0 ? 0 : -2.2;
      joint.add(seg);
      parent.add(joint);
      parent = joint;
    }
    const barb = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.2, 4), glow);
    barb.rotation.x = -Math.PI / 2;
    barb.position.z = -2.7;
    parent.add(barb);
    this.ray.add(this.tail);
    this.ray.visible = false;
    this.ray.scale.setScalar(1.25);
    this.group.add(this.ray);

    this.shotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.shots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), this.shotMat, 64);
    this.shots.frustumCulled = false;
    this.shots.count = 0;
    this.group.add(this.shots);

    const ringGeo = new THREE.RingGeometry(0.9, 1, 28);
    const discGeo = new THREE.CircleGeometry(1, 28);
    for (let i = 0; i < 6; i++) {
      // Drawn through the water, so a wave face cannot hide part of the warning.
      const mat = (opacity: number) =>
        new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, mat(0.95));
      const disc = new THREE.Mesh(discGeo, mat(0.35));
      ring.rotation.x = disc.rotation.x = -Math.PI / 2;
      ring.visible = disc.visible = false;
      ring.renderOrder = disc.renderOrder = 3;
      this.rings.push({ ring, disc });
      this.group.add(ring, disc);
    }
    const boltGeo = new THREE.CylinderGeometry(0.25, 0.9, 1, 6, 1, true);
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.8, depthWrite: false }));
      mesh.visible = false;
      this.bolts.push({ mesh, life: 0 });
      this.group.add(mesh);
    }
    this.group.add(this.spray.mesh);
  }

  /** A tail strike just landed at (x, z): a bolt from the sky and a splash. */
  strike(x: number, z: number): void {
    const y = this.water.height(x, z);
    const bolt = this.bolts.find((b) => b.life <= 0) ?? this.bolts[0];
    bolt.life = 0.3;
    bolt.mesh.visible = true;
    bolt.mesh.position.set(x, y + 7, z);
    bolt.mesh.scale.set(1, 14, 1);
    this.spray.burst(x, y, z, 26, 7);
  }

  /** Spray where a shot hit the Stingray. */
  hit(fight: BossFight): void {
    this.spray.burst(fight.pos.x, fight.pos.y - 0.4, fight.pos.z, 3, 3);
  }

  update(dt: number, fight: BossFight, targetX: number, targetY: number, targetZ: number): void {
    this.clock += dt;
    const B = CONFIG.boss;

    // ---- The Stingray. When the fight ends it sinks (beaten) or flies off (won the fight).
    if (fight.active) {
      this.wasActive = true;
      this.sink = 0;
      this.ray.visible = true;
      this.ray.position.copy(fight.pos);
    } else if (this.wasActive) {
      this.sink += dt;
      const beaten = fight.hp <= 0;
      this.ray.position.y += (beaten ? -6 : 9) * dt;
      if (beaten) this.ray.rotation.z += dt * 3;
      if (this.sink > 3) {
        this.wasActive = false;
        this.ray.visible = false;
      }
    }
    if (this.ray.visible) {
      const p2 = fight.phase === 2;
      if (fight.active) {
        this.look.set(targetX, Math.max(targetY, fight.pos.y - 6), targetZ);
        this.ray.lookAt(this.look);
        // Tipped nose down, so the player sees its back and tail and not just a thin edge.
        this.ray.rotateX(0.6);
      }
      const flap = Math.sin(this.clock * (p2 ? 7 : 4.2)) * (p2 ? 0.55 : 0.4);
      this.wings[0].rotation.z = flap;
      this.wings[1].rotation.z = -flap;
      // The tail whips up just before a strike lands.
      let wind = 0;
      for (const s of fight.strikes) if (s.active) wind = Math.max(wind, 1 - s.time / s.delay);
      let joint: THREE.Object3D = this.tail;
      for (let i = 0; i < 3; i++) {
        joint = i === 0 ? this.tail.children[0] : joint.children[1];
        joint.rotation.x = wind * 0.75 + Math.sin(this.clock * 3 - i) * 0.12;
        joint.rotation.y = Math.sin(this.clock * 2.2 - i * 0.9) * 0.25;
      }
      this.skin.color.copy(p2 ? this.angry : this.calm);
      this.skin.emissive.setScalar(fight.hurt > 0 ? 0.85 : 0);
    }

    // ---- Shots.
    const look = SHOT_LOOK[fight.weapon?.id ?? 'squirter'] ?? SHOT_LOOK.squirter;
    this.shotMat.color.setHex(look.color);
    let n = 0;
    for (const s of fight.shots) {
      if (!s.alive) continue;
      this.dummy.position.copy(s.pos);
      this.dummy.scale.setScalar(look.size);
      this.dummy.updateMatrix();
      this.shots.setMatrixAt(n++, this.dummy.matrix);
    }
    this.shots.count = n;
    this.shots.instanceMatrix.needsUpdate = true;

    // ---- Warning rings: the ring shows the size, the disc fills as the strike gets close.
    for (let i = 0; i < this.rings.length; i++) {
      const s = fight.strikes[i];
      const { ring, disc } = this.rings[i];
      ring.visible = disc.visible = s.active;
      if (!s.active) continue;
      const y = this.water.height(s.x, s.z) + 0.3;
      const t = 1 - Math.max(0, s.time) / s.delay;
      ring.position.set(s.x, y, s.z);
      disc.position.set(s.x, y - 0.05, s.z);
      ring.scale.setScalar(B.strikeRadius * (1 + Math.sin(this.clock * 18) * 0.04));
      disc.scale.setScalar(B.strikeRadius * Math.max(0.05, t));
    }
    for (const b of this.bolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.mesh.visible = b.life > 0;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, b.life / 0.3) * 0.8;
    }
    this.spray.update(dt);
  }
}
