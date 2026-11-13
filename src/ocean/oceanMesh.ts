import * as THREE from 'three';
import { WaveSystem, smoothstep, type SurfaceSample } from './waves';

export interface OceanLook {
  deep: THREE.ColorRepresentation;
  shallow: THREE.ColorRepresentation;
  face: THREE.ColorRepresentation;
  foam: THREE.ColorRepresentation;
}

/**
 * The low-poly ocean. A grid whose vertices are moved on the CPU every frame
 * from the same WaveSystem the physics uses.
 */
export class OceanMesh {
  readonly mesh: THREE.Mesh;
  readonly farPlane: THREE.Mesh;
  private positions: Float32Array;
  private colors: Float32Array;
  private baseX: Float32Array;
  private baseZ: Float32Array;
  private count: number;
  private nx: number;
  private nz: number;
  /** Per-column wave amp and foam, for even and odd rows. Refilled every frame. */
  private pre = new Float32Array(0);
  private colN = new Float32Array(0);
  private rowN = new Float32Array(0);
  private rowZ: Float32Array;
  private base: Float32Array;
  private sampleOut: SurfaceSample = { height: 0, foam: 0, curl: 0, rise: 0, bowl: 0 };
  private cDeep: THREE.Color;
  private cShallow: THREE.Color;
  private cFace: THREE.Color;
  private cFoam: THREE.Color;

  constructor(
    private waves: WaveSystem,
    opts: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      cellX: number;
      cellZ: number;
      look: OceanLook;
    },
  ) {
    const nx = Math.round((opts.maxX - opts.minX) / opts.cellX) + 1;
    const nz = Math.round((opts.maxZ - opts.minZ) / opts.cellZ) + 1;
    this.count = nx * nz;
    this.nx = nx;
    this.nz = nz;
    this.positions = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.baseX = new Float32Array(this.count);
    this.baseZ = new Float32Array(this.count);

    let i = 0;
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        // Nudge alternate rows so the triangles look less like a perfect grid.
        const jitter = iz % 2 === 0 ? 0 : opts.cellX * 0.5;
        this.baseX[i] = opts.minX + ix * opts.cellX + (ix > 0 && ix < nx - 1 ? jitter : 0);
        this.baseZ[i] = opts.minZ + iz * opts.cellZ;
        i++;
      }
    }

    this.rowZ = new Float32Array(nz);
    for (let iz = 0; iz < nz; iz++) this.rowZ[iz] = opts.minZ + iz * opts.cellZ;
    this.base = new Float32Array(this.count);

    const index: number[] = [];
    for (let iz = 0; iz < nz - 1; iz++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        const a = iz * nx + ix;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        if (iz % 2 === 0) index.push(a, c, b, b, c, d);
        else index.push(a, c, d, a, d, b);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setIndex(index);
    geo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3((opts.minX + opts.maxX) / 2, 0, (opts.minZ + opts.maxZ) / 2),
      Math.hypot(opts.maxX - opts.minX, opts.maxZ - opts.minZ),
    );

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.3,
      metalness: 0.05,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;

    this.cDeep = new THREE.Color(opts.look.deep);
    this.cShallow = new THREE.Color(opts.look.shallow);
    this.cFace = new THREE.Color(opts.look.face);
    this.cFoam = new THREE.Color(opts.look.foam);

    // Flat water out to the horizon, beyond the animated grid.
    const far = new THREE.PlaneGeometry(4000, 4000, 1, 1);
    far.rotateX(-Math.PI / 2);
    this.farPlane = new THREE.Mesh(
      far,
      new THREE.MeshStandardMaterial({ color: this.cDeep, roughness: 0.5, metalness: 0.05 }),
    );
    // It sits just under the animated grid and is wide enough to cover its sides too.
    this.farPlane.position.set(0, -0.35, -800);
  }

  update(): void {
    const { positions, colors, baseX, baseZ, count, waves } = this;
    const s = this.sampleOut;
    const { cDeep, cShallow, cFace, cFoam } = this;
    const shoreStart = waves.tuning.endZ - 55;
    const shoreEnd = waves.tuning.endZ + 4;
    const t = waves.time;
    // Wave height along the shore only depends on X, so work it out once per
    // column (even and odd rows are offset, hence two sets) rather than per vertex.
    const { nx, nz } = this;
    const list = waves.waves;
    const stride = list.length * 3;
    if (this.pre.length < nx * 2 * stride) this.pre = new Float32Array(nx * 2 * Math.max(stride, 18));
    if (this.colN.length < nx * 4) this.colN = new Float32Array(nx * 4);
    if (this.rowN.length < nz * 2) this.rowN = new Float32Array(nz * 2);
    const { colN, rowN } = this;
    for (let iz = 0; iz < nz; iz++) {
      const z = this.rowZ[iz];
      rowN[iz * 2] = Math.sin(z * 0.43 + t * 0.4);
      rowN[iz * 2 + 1] = Math.cos(z * 0.27 - t * 0.25);
    }
    const pre = this.pre;
    for (let parity = 0; parity < 2 && nz > parity; parity++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = baseX[parity * nx + ix];
        const at = (parity * nx + ix) * stride;
        colN[(parity * nx + ix) * 2] = Math.sin(x * 0.61);
        colN[(parity * nx + ix) * 2 + 1] = Math.sin(x * 0.19 + 1.3);
        for (let w = 0; w < list.length; w++) {
          const a = waves.alongShore(list[w], x);
          pre[at + w * 3] = a.amp;
          pre[at + w * 3 + 1] = a.foam;
          pre[at + w * 3 + 2] = waves.rib(list[w], x);
        }
      }
    }

    const base = this.base;
    waves.chopGrid(baseX, this.rowZ, nx, nz, base);

    for (let i = 0; i < count; i++) {
      const x = baseX[i];
      const z = baseZ[i];
      const iz = (i / nx) | 0;
      const col = (iz & 1) * nx + (i - iz * nx);
      waves.sample(x, z, s, pre, col * stride, base[i]);
      const p = i * 3;
      positions[p] = x;
      positions[p + 1] = s.height;
      positions[p + 2] = z + s.curl;

      // Deep blue offshore, turquoise near the beach, brighter up the face, white foam.
      const sh = smoothstep(shoreStart, shoreEnd, z);
      let r = cDeep.r + (cShallow.r - cDeep.r) * sh;
      let g = cDeep.g + (cShallow.g - cDeep.g) * sh;
      let b = cDeep.b + (cShallow.b - cDeep.b) * sh;
      // Streaks and patches so the face is not one flat colour.
      const n = colN[col * 2] * rowN[iz * 2] * 0.6 + colN[col * 2 + 1] * rowN[iz * 2 + 1] * 0.6;
      const f = Math.min(1, s.rise * (0.85 + 0.22 * n));
      r += (cFace.r - r) * f;
      g += (cFace.g - g) * f;
      b += (cFace.b - b) * f;
      // Bowl sections glow a sunlit green so the fast parts of a wave can be read from a distance.
      if (s.bowl > 0.01) {
        const k = s.bowl * 0.55;
        r += (0.75 - r) * k;
        g += (1.0 - g) * k;
        b += (0.72 - b) * k;
      }
      // A ragged, lacy edge to the whitewater.
      const w = smoothstep(0.3, 0.62, s.foam + 0.14 * n * Math.min(1, s.foam * 4));
      // Foam is pushed past 1.0 so it stays bright white even on shaded facets.
      r += (cFoam.r * 1.5 - r) * w;
      g += (cFoam.g * 1.5 - g) * w;
      b += (cFoam.b * 1.5 - b) * w;
      colors[p] = r;
      colors[p + 1] = g;
      colors[p + 2] = b;
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}
