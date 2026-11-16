import { CONFIG } from '../config';
import { smoothstep, type Wave, type WaveSystem } from './waves';

/**
 * The curling lip: a sheet of water that arches off the crest, over the face
 * and down in front, just ahead of where a wave is breaking.
 *
 * This file is the one description of its shape. The mesh draws it and the
 * surfer rides on top of it (or gets barrelled underneath), so what you see
 * is what the physics uses.
 */

/** The lip's cross-section at one X along a wave. */
export interface LipSection {
  /** 0 where there is no lip, 1 where it is thickest (at the whitewater edge). */
  size: number;
  /** Z where the lip leaves the crest, and the height there. */
  rootZ: number;
  rootY: number;
  /** Half the distance the arch covers toward the beach. */
  spanZ: number;
  /** Height of the top of the arch above its root. */
  rise: number;
  /** How far round the arch goes, in radians. Past pi it hangs down in front. */
  wrap: number;
}

export function makeLipSection(): LipSection {
  return { size: 0, rootZ: 0, rootY: 0, spanZ: 0, rise: 0, wrap: 0 };
}

/** Fill `out` with the lip's cross-section at X on wave `w`. Returns false when there is no lip there. */
export function lipSectionAt(waves: WaveSystem, w: Wave, x: number, out: LipSection): boolean {
  const B = CONFIG.barrel;
  out.size = 0;
  if (w.brokenHalfWidth < 0 || w.amp < B.minHeight * 0.6) return false;
  const fromFoam = Math.abs(x - w.peakX) - w.brokenHalfWidth;
  if (fromFoam <= B.inside || fromFoam >= B.width + 2) return false;
  const { amp } = waves.alongShore(w, x);
  // Thickest at the whitewater edge, thinning to nothing at the shoulder; fades out on small waves.
  const size =
    smoothstep(B.inside, 0.5, fromFoam) *
    Math.pow(1 - smoothstep(0, B.width + 2, fromFoam), 0.8) *
    smoothstep(B.minHeight * 0.7, B.minHeight * 1.3, amp);
  if (size <= 0.001) return false;
  out.size = size;
  out.rootZ = w.crestZ - 0.5;
  out.rootY = waves.height(x, w.crestZ) - 0.2;
  out.spanZ = B.lipReach * w.faceWidth * (0.3 + 0.7 * size);
  out.rise = B.lipRise * size;
  out.wrap = Math.PI * B.lipWrap * (0.25 + 0.75 * size);
  return true;
}

/** A point on the arch, `angle` radians round from the root. Writes [y, z] into `out`. */
export function lipPoint(s: LipSection, angle: number, out: { y: number; z: number }): void {
  const sin = Math.sin(angle);
  // The power rounds off the root so the lip leaves the crest as a ramp, not a wall.
  out.y = s.rootY + s.rise * Math.sign(sin) * Math.pow(Math.abs(sin), CONFIG.barrel.lipRootEase);
  out.z = s.rootZ + s.spanZ * (1 - Math.cos(angle));
}

const scratch = makeLipSection();
const point = { y: 0, z: 0 };

/**
 * Height of the top of the lip at a point, or -Infinity where there is no lip
 * solid enough to stand on. This is what the surfer rides.
 */
export function lipTopAt(waves: WaveSystem, x: number, z: number): number {
  const B = CONFIG.barrel;
  let top = -Infinity;
  for (const w of waves.waves) {
    if (w.brokenHalfWidth < 0) continue;
    const d = z - (w.crestZ - 0.5);
    if (d < 0 || d > B.lipReach * w.faceWidth * 2) continue;
    if (!lipSectionAt(waves, w, x, scratch) || scratch.size < B.lipSolidSize) continue;
    const c = 1 - d / scratch.spanZ;
    if (c < -1) continue;
    const angle = Math.acos(c);
    if (angle > scratch.wrap) continue;
    lipPoint(scratch, angle, point);
    top = Math.max(top, point.y);
  }
  return top;
}
