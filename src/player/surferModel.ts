import * as THREE from 'three';

/**
 * Placeholder low-poly surfer and board built from primitives.
 * Board axes: +Z is the nose, +Y is up.
 */
export type Pose = 'prone' | 'stand' | 'air' | 'tumble' | 'hangTen' | 'slide' | 'float' | 'grab';

interface PoseTargets {
  bodyY: number;
  bodyPitch: number; // lying down = PI / 2
  bodyYaw: number; // sideways stance
  torsoLean: number;
  legSpread: number;
  kneeTuck: number;
  armRaise: number;
  headPitch: number;
  headYaw: number;
  /** How far along the board the rider stands (positive is toward the nose). */
  riderZ: number;
}

const POSES: Record<Pose, PoseTargets> = {
  prone: {
    bodyY: 0.2,
    bodyPitch: Math.PI / 2,
    bodyYaw: 0,
    torsoLean: -0.12,
    legSpread: 0.08,
    kneeTuck: 0,
    armRaise: 0.25,
    headPitch: -0.75,
    headYaw: 0,
    riderZ: 0,
  },
  stand: {
    bodyY: 0.62,
    bodyPitch: 0,
    bodyYaw: Math.PI / 2,
    torsoLean: 0.28,
    legSpread: 0.62,
    kneeTuck: 0,
    armRaise: 1.15,
    headPitch: 0,
    headYaw: -1.0,
    riderZ: 0,
  },
  air: {
    bodyY: 0.5,
    bodyPitch: 0,
    bodyYaw: Math.PI / 2,
    torsoLean: 0.55,
    legSpread: 0.85,
    kneeTuck: 0.3,
    armRaise: 0.5,
    headPitch: 0.1,
    headYaw: -1.0,
    riderZ: 0,
  },
  tumble: {
    bodyY: 0.9,
    bodyPitch: 0.4,
    bodyYaw: 0.6,
    torsoLean: -0.3,
    legSpread: 0.9,
    kneeTuck: 0.4,
    armRaise: 2.4,
    headPitch: -0.3,
    headYaw: 0,
    riderZ: 0,
  },
  // Standing tall on the nose, facing forward, arms spread.
  hangTen: {
    bodyY: 0.74,
    bodyPitch: 0,
    bodyYaw: 0,
    torsoLean: -0.18,
    legSpread: 0.1,
    kneeTuck: 0,
    armRaise: 1.45,
    headPitch: -0.1,
    headYaw: 0,
    riderZ: 0.78,
  },
  // Low over the back foot with the tail kicked out.
  slide: {
    bodyY: 0.46,
    bodyPitch: 0,
    bodyYaw: Math.PI / 2,
    torsoLean: 0.6,
    legSpread: 0.9,
    kneeTuck: 0.1,
    armRaise: 0.75,
    headPitch: 0,
    headYaw: -1.0,
    riderZ: -0.3,
  },
  // Light on the feet, arms wide for balance on top of the foam.
  float: {
    bodyY: 0.56,
    bodyPitch: 0,
    bodyYaw: Math.PI / 2,
    torsoLean: 0.15,
    legSpread: 0.7,
    kneeTuck: 0,
    armRaise: 1.5,
    headPitch: 0.1,
    headYaw: -1.0,
    riderZ: 0,
  },
  // Tucked right down with a hand on the rail.
  grab: {
    bodyY: 0.34,
    bodyPitch: 0,
    bodyYaw: Math.PI / 2,
    torsoLean: 1.0,
    legSpread: 1.0,
    kneeTuck: 0.55,
    armRaise: 0.12,
    headPitch: -0.5,
    headYaw: -1.0,
    riderZ: 0,
  },
};

function makeBoard(): { board: THREE.Mesh; stripe: THREE.Mesh } {
  const geo = new THREE.BoxGeometry(0.62, 0.09, 2.3, 2, 1, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = z / 1.15; // -1 tail .. 1 nose
    // Pointed nose, slightly squared tail.
    const width = t > 0 ? Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.6))) : 1 - 0.45 * Math.pow(-t, 3);
    pos.setX(i, pos.getX(i) * Math.max(0.04, width));
    // Nose rocker.
    pos.setY(i, pos.getY(i) + (t > 0 ? 0.16 * t * t : 0.04 * t * t));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, flatShading: true, roughness: 0.5 });
  const board = new THREE.Mesh(geo, mat);
  // A racing stripe and a fin so the board's direction reads at a glance.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.02, 1.7),
    new THREE.MeshStandardMaterial({ color: 0xff4f6d, flatShading: true }),
  );
  stripe.position.set(0, 0.055, -0.1);
  board.add(stripe);
  const fin = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.28, 4),
    new THREE.MeshStandardMaterial({ color: 0x1f3b63, flatShading: true }),
  );
  fin.rotation.x = Math.PI;
  fin.scale.set(0.35, 1, 1.4);
  fin.position.set(0, -0.16, -0.9);
  board.add(fin);
  board.castShadow = true;
  return { board, stripe };
}

export class SurferModel {
  readonly root = new THREE.Group();
  /** Rotates with the board (heading, flips, lean). */
  readonly boardPivot = new THREE.Group();
  /** Sits between the board and the rider so the rider can stay upright on a tilted board. */
  readonly mount = new THREE.Group();
  private board: THREE.Mesh;
  private stripe: THREE.Mesh;
  /** Scales the board for its tier and yaws it for slides, without moving the rider. */
  private boardSize = new THREE.Group();
  /** Extra yaw of the board under the rider's feet (tail slides, snaps). */
  boardYaw = 0;
  private rider = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private pose: Pose = 'prone';
  private cur: PoseTargets = { ...POSES.prone };
  private clock = 0;

  constructor() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8a877, flatShading: true, roughness: 0.8 });
    const shorts = new THREE.MeshStandardMaterial({ color: 0xff6b35, flatShading: true, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x25c2a0, flatShading: true, roughness: 0.8 });
    const hair = new THREE.MeshStandardMaterial({ color: 0xf4d35e, flatShading: true, roughness: 0.9 });

    const made = makeBoard();
    this.board = made.board;
    this.stripe = made.stripe;
    this.boardSize.add(this.board);
    this.boardPivot.add(this.boardSize);
    this.boardPivot.add(this.mount);
    this.mount.add(this.rider);
    this.root.add(this.boardPivot);
    this.rider.add(this.body);

    const box = (w: number, h: number, d: number, m: THREE.Material, y: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.y = y;
      mesh.castShadow = true;
      return mesh;
    };

    // Legs hang from the hips.
    for (const [leg, x] of [
      [this.legL, 0.12],
      [this.legR, -0.12],
    ] as const) {
      leg.position.set(x, 0, 0);
      leg.add(box(0.17, 0.36, 0.2, shorts, -0.16));
      leg.add(box(0.14, 0.42, 0.16, skin, -0.53));
      this.body.add(leg);
    }

    this.body.add(this.torso);
    this.torso.add(box(0.44, 0.58, 0.25, shirt, 0.31));

    this.head.position.y = 0.76;
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), skin);
    skull.castShadow = true;
    this.head.add(skull);
    const mop = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), hair);
    mop.position.set(0, 0.06, -0.04);
    mop.scale.set(1.05, 0.8, 1.05);
    this.head.add(mop);
    this.torso.add(this.head);

    for (const [arm, x] of [
      [this.armL, 0.29],
      [this.armR, -0.29],
    ] as const) {
      arm.position.set(x, 0.54, 0);
      arm.add(box(0.12, 0.56, 0.12, skin, -0.26));
      this.torso.add(arm);
    }
  }

  /** Resize and recolour the board for a tier. */
  setBoard(scale: number, color: number, stripe: number): void {
    this.boardSize.scale.setScalar(scale);
    (this.board.material as THREE.MeshStandardMaterial).color.setHex(color);
    (this.stripe.material as THREE.MeshStandardMaterial).color.setHex(stripe);
  }

  setPose(pose: Pose): void {
    this.pose = pose;
  }

  /**
   * @param paddling 0 to 1, how hard the arms are stroking (prone only)
   * @param crouch 0 to 1, extra crouch while standing (pumping, landing)
   * @param tumble radians of rider tumble (wipeout only)
   */
  update(dt: number, paddling: number, crouch: number, tumble: number): void {
    this.clock += dt * (4 + paddling * 6);
    const target = POSES[this.pose];
    const k = 1 - Math.exp(-dt * (this.pose === 'prone' || this.pose === 'tumble' ? 12 : 9));
    const c = this.cur;
    for (const key of Object.keys(c) as (keyof PoseTargets)[]) {
      c[key] += (target[key] - c[key]) * k;
    }

    const crouchY = this.pose === 'stand' ? crouch * 0.16 : 0;
    this.body.position.z = c.riderZ * this.boardSize.scale.x;
    this.boardSize.rotation.y += (this.boardYaw - this.boardSize.rotation.y) * (1 - Math.exp(-dt * 16));
    this.body.position.y = c.bodyY - crouchY;
    this.body.rotation.set(c.bodyPitch, c.bodyYaw, 0, 'YXZ');
    this.torso.rotation.x = c.torsoLean + crouch * 0.25;
    this.head.rotation.set(c.headPitch, c.headYaw, 0, 'YXZ');

    this.legL.rotation.set(-c.kneeTuck, 0, c.legSpread + crouch * 0.15);
    this.legR.rotation.set(-c.kneeTuck, 0, -c.legSpread - crouch * 0.15);

    if (this.pose === 'prone') {
      // Alternating paddle strokes.
      const a = Math.sin(this.clock) * (0.35 + paddling * 0.9);
      this.armL.rotation.set(Math.PI + a, 0, c.armRaise);
      this.armR.rotation.set(Math.PI - a, 0, -c.armRaise);
    } else {
      const wobble = Math.sin(this.clock * 0.7) * 0.06;
      this.armL.rotation.set(0, 0, c.armRaise + wobble);
      this.armR.rotation.set(0, 0, -c.armRaise + wobble);
    }

    if (this.pose === 'tumble') {
      this.rider.rotation.set(tumble * 1.3, tumble * 0.7, tumble);
      this.rider.position.set(0.6 * Math.sin(tumble), 0.4 + 0.5 * Math.abs(Math.sin(tumble * 0.6)), -0.5);
      this.board.rotation.set(tumble * 0.9, 0, tumble * 1.6);
      this.board.position.set(-0.8, 0.2, 0.6);
    } else {
      const r = 1 - Math.exp(-dt * 10);
      this.rider.rotation.x += (0 - this.rider.rotation.x) * r;
      this.rider.rotation.y += (0 - this.rider.rotation.y) * r;
      this.rider.rotation.z += (0 - this.rider.rotation.z) * r;
      this.rider.position.multiplyScalar(1 - r);
      this.board.rotation.set(0, 0, 0);
      this.board.position.multiplyScalar(1 - r);
    }
  }
}
