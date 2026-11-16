import * as THREE from 'three';

/** A pool of small low-poly white chunks for spray and splashes. */
export class Spray {
  readonly mesh: THREE.InstancedMesh;
  private max: number;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private next = 0;
  private dummy = new THREE.Object3D();

  constructor(max = 500) {
    this.max = max;
    const geo = new THREE.TetrahedronGeometry(0.22, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.6 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.px = new Float32Array(max);
    this.py = new Float32Array(max);
    this.pz = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.vz = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
  }

  /** A ring of spray, for landings, pop-ups and wipeouts. */
  burst(x: number, y: number, z: number, count: number, power: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = power * (0.4 + Math.random() * 0.6);
      this.emit(
        x + Math.cos(a) * 0.4,
        y + 0.1,
        z + Math.sin(a) * 0.4,
        Math.cos(a) * r,
        power * (0.6 + Math.random() * 0.9),
        Math.sin(a) * r,
        0.5 + Math.random() * 0.5,
        0.7 + Math.random() * 1.1,
      );
    }
  }

  update(dt: number): void {
    const d = this.dummy;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        d.scale.setScalar(0);
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
        continue;
      }
      this.vy[i] -= 14 * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      d.position.set(this.px[i], this.py[i], this.pz[i]);
      d.rotation.set(t * 5 + i, t * 3, i);
      d.scale.setScalar(this.size[i] * Math.min(1, t * 2.2));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
