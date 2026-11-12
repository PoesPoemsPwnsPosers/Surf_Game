import * as THREE from 'three';
import { CONFIG } from '../config';
import { smoothstep, type WaveSystem } from './waves';

const STRIPS = 10; // enough for five breaking waves, two sides each
const COLS = 28; // along the wave
const ROWS = 12; // around the curl

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
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.35,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: CONFIG.barrel.lipOpacity,
        depthWrite: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.cFace = new THREE.Color(look.face);
    this.cFoam = new THREE.Color(look.foam).multiplyScalar(1.4);
  }

  update(): void {
    const B = CONFIG.barrel;
    const { positions, colors, cFace, cFoam } = this;
    let strip = 0;
    const t = this.waves.time;
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
          // An arch from the crest, up and over the face, and down in front. It wraps further where it is thickest.
          const spanZ = B.lipReach * w.faceWidth * (0.3 + 0.7 * size);
          const rise = B.lipRise * size;
          const wrap = Math.PI * B.lipWrap * (0.25 + 0.75 * size);
          const crestY = this.waves.height(x, w.crestZ) - 0.2;
          // Ribs along the sheet and a ragged, falling edge.
          const rib = 1 + 0.07 * Math.sin(x * 1.9 + w.id) + 0.05 * Math.sin(x * 4.3 - t * 3);
          const ragged = 0.35 * Math.sin(x * 2.7 + t * 6 + w.id) + 0.25 * Math.sin(x * 6.1 - t * 9);
          for (let r = 0; r <= ROWS; r++) {
            const u = r / ROWS;
            const a = wrap * u + (r === ROWS ? ragged * 0.18 : 0);
            const i = (base + c * (ROWS + 1) + r) * 3;
            positions[i] = x;
            positions[i + 1] = crestY + rise * rib * Math.sin(a) - (r === ROWS ? Math.abs(ragged) * 0.5 * size : 0);
            positions[i + 2] = w.crestZ - 0.5 + spanZ * rib * (1 - Math.cos(a));
            // Glassy green at the root, lighter over the top, white water at the falling edge.
            const k = smoothstep(0.55, 1, u);
            const glow = 0.25 * Math.sin(u * Math.PI);
            colors[i] = cFace.r + glow + (cFoam.r - cFace.r - glow) * k;
            colors[i + 1] = cFace.g + glow + (cFoam.g - cFace.g - glow) * k;
            colors[i + 2] = cFace.b + glow + (cFoam.b - cFace.b - glow) * k;
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
