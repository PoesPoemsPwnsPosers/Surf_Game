import * as THREE from 'three';
import { CONFIG } from '../config';
import { smoothstep, type WaveSystem } from './waves';

const STRIPS = 10; // enough for five breaking waves, two sides each
const COLS = 14; // along the wave
const ROWS = 7; // around the curl

/**
 * The curling lip: a sheet of water thrown forward off the crest, just ahead
 * of where each wave is breaking. Visual only. The barrel rule in the surfer
 * uses the same numbers from CONFIG.barrel, so what you see is what scores.
 */
export class LipMesh {
  readonly mesh: THREE.Mesh;
  private positions: Float32Array;
  private colors: Float32Array;
  private cFace: THREE.Color;
  private cFoam: THREE.Color;

  constructor(private waves: WaveSystem, look: { face: THREE.ColorRepresentation; foam: THREE.ColorRepresentation }) {
    const verts = STRIPS * (COLS + 1) * (ROWS + 1);
    this.positions = new Float32Array(verts * 3);
    this.colors = new Float32Array(verts * 3);
    const index: number[] = [];
    for (let s = 0; s < STRIPS; s++) {
      const base = s * (COLS + 1) * (ROWS + 1);
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const a = base + c * (ROWS + 1) + r;
          const b = a + ROWS + 1;
          index.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, side: THREE.DoubleSide }),
    );
    this.mesh.frustumCulled = false;
    this.cFace = new THREE.Color(look.face);
    this.cFoam = new THREE.Color(look.foam).multiplyScalar(1.4);
  }

  update(): void {
    const B = CONFIG.barrel;
    const { positions, colors, cFace, cFoam } = this;
    let strip = 0;
    for (const w of this.waves.waves) {
      if (w.brokenHalfWidth < 0 || w.amp < B.minHeight * 0.6) continue;
      for (const side of [-1, 1]) {
        if (strip >= STRIPS) break;
        const base = strip * (COLS + 1) * (ROWS + 1);
        strip++;
        for (let c = 0; c <= COLS; c++) {
          // From a little inside the whitewater out to the end of the pocket.
          const fromFoam = B.inside + (B.width + 2 - B.inside) * (c / COLS);
          const x = w.peakX + side * (w.brokenHalfWidth + fromFoam);
          const { amp } = this.waves.alongShore(w, x);
          // Thickest at the whitewater edge, thinning to nothing at the shoulder; fades out on small waves.
          const size =
            smoothstep(B.inside, 0.5, fromFoam) *
            Math.pow(1 - smoothstep(0, B.width + 2, fromFoam), 0.8) *
            smoothstep(B.minHeight * 0.7, B.minHeight * 1.3, amp);
          const reach = B.lipReach * w.faceWidth * size;
          const crestY = this.waves.height(x, w.crestZ);
          for (let r = 0; r <= ROWS; r++) {
            const u = r / ROWS;
            const i = (base + c * (ROWS + 1) + r) * 3;
            positions[i] = x;
            // Up and over: rises off the crest, then falls away at the tip.
            positions[i + 1] = crestY - 0.15 + size * (B.lipRise * Math.sin(u * Math.PI * 0.85) - B.lipDrop * u * u);
            positions[i + 2] = w.crestZ - 0.4 + reach * u;
            const t = u * u;
            colors[i] = cFace.r + (cFoam.r - cFace.r) * t;
            colors[i + 1] = cFace.g + (cFoam.g - cFace.g) * t;
            colors[i + 2] = cFace.b + (cFoam.b - cFace.b) * t;
          }
        }
      }
    }
    // Park the unused strips out of sight.
    const used = strip * (COLS + 1) * (ROWS + 1) * 3;
    positions.fill(0, used);
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}
