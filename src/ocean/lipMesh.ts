import * as THREE from 'three';
import { CONFIG } from '../config';
import { lipPoint, lipSectionAt, makeLipSection } from './lip';
import { smoothstep, type WaveSystem } from './waves';

const STRIPS = 10; // enough for five breaking waves, two sides each
const COLS = 28; // along the wave
const ROWS = 12; // around the curl

/**
 * The curling lip: a sheet of water thrown forward off the crest, just ahead
 * of where each wave is breaking. The shape comes from ./lip, which the surfer
 * also uses to ride on top of it, so what you see is what the physics uses.
 */
export class LipMesh {
  readonly mesh: THREE.Mesh;
  private positions: Float32Array;
  private colors: Float32Array;
  private cFace: THREE.Color;
  private cFoam: THREE.Color;
  private section = makeLipSection();
  private point = { y: 0, z: 0 };

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
    const { positions, colors, cFace, cFoam, section, point } = this;
    const B = CONFIG.barrel;
    const t = this.waves.time;
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
          const has = lipSectionAt(this.waves, w, x, section);
          // A ragged, falling edge. The rest of the sheet follows the shared shape exactly.
          const ragged = 0.35 * Math.sin(x * 2.7 + t * 6 + w.id) + 0.25 * Math.sin(x * 6.1 - t * 9);
          for (let r = 0; r <= ROWS; r++) {
            const u = r / ROWS;
            const i = (base + c * (ROWS + 1) + r) * 3;
            if (has) {
              lipPoint(section, section.wrap * u + (r === ROWS ? ragged * 0.18 : 0), point);
              positions[i] = x;
              positions[i + 1] = point.y - (r === ROWS ? Math.abs(ragged) * 0.5 * section.size : 0);
              positions[i + 2] = point.z;
            } else {
              // No lip here: fold the strip flat onto the crest line.
              positions[i] = x;
              positions[i + 1] = this.waves.height(x, w.crestZ) - 0.3;
              positions[i + 2] = w.crestZ - 0.5;
            }
            // Glassy green at the root, lighter over the top, white water at the falling edge.
            const k = smoothstep(0.55, 1, u);
            const glow = 0.25 * Math.sin(u * Math.PI) + 0.06 * Math.sin(x * 1.9 + w.id);
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
