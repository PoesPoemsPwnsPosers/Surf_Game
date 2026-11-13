import { CONFIG } from '../../config';
import type { LandMap } from '../../core/level';

/**
 * Where things are at Venice Beach. The scenery is built from these numbers
 * and the walking rules read the same ones, so the two cannot drift apart.
 */
const shoreZ = CONFIG.world.shoreZ;

/** Height of the sand going up the beach, as (z, y) points. Straight lines between them. */
export const SAND_PROFILE: readonly { z: number; y: number }[] = [
  { z: shoreZ - 30, y: -2.6 },
  { z: shoreZ, y: 0.0 },
  { z: shoreZ + 9, y: 0.55 },
  { z: shoreZ + 40, y: 1.9 },
  { z: shoreZ + 75, y: 2.2 },
  { z: shoreZ + 400, y: 2.2 },
];

export const PIER = {
  /** Centre line of the pier, and its width. */
  x: 150,
  width: 9,
  /** Height of the deck above the sea. Clear of the biggest waves. */
  deckY: 7.6,
  /** The deck runs level from the sea end to here, then ramps down to the boardwalk. */
  seaEndZ: -56,
  rampTopZ: shoreZ + 26,
  rampBottomZ: shoreZ + 70,
  /** A wider platform at the sea end, where the shop is. */
  headWidth: 20,
  headLength: 18,
  /** The shop hut sits on the platform, on the side away from the surf. */
  shop: { x: 156.5, z: -47, width: 6, depth: 5 },
};

/** The paved boardwalk along the back of the beach. */
export const BOARDWALK = { nearZ: shoreZ + 66, farZ: shoreZ + 84 };

function sandHeight(z: number): number {
  const p = SAND_PROFILE;
  if (z <= p[0].z) return p[0].y + (z - p[0].z) * 0.09;
  for (let i = 1; i < p.length; i++) {
    if (z <= p[i].z) {
      const t = (z - p[i - 1].z) / (p[i].z - p[i - 1].z);
      return p[i - 1].y + (p[i].y - p[i - 1].y) * t;
    }
  }
  return p[p.length - 1].y;
}

/** Height of the pier's walking surface at (x, z), or -Infinity off the pier. */
export function pierDeckHeight(x: number, z: number): number {
  const P = PIER;
  if (z < P.seaEndZ || z > P.rampBottomZ) return -Infinity;
  const onHead = z < P.seaEndZ + P.headLength;
  const half = (onHead ? P.headWidth : P.width) / 2;
  if (Math.abs(x - P.x) > half) return -Infinity;
  if (z <= P.rampTopZ) return P.deckY;
  const t = (z - P.rampTopZ) / (P.rampBottomZ - P.rampTopZ);
  return P.deckY + (sandHeight(P.rampBottomZ) - P.deckY) * t;
}

export const veniceLand: LandMap = {
  sand: (_x, z) => sandHeight(z),
  ground(x, z, feetY) {
    const sand = sandHeight(z);
    const deck = pierDeckHeight(x, z);
    // On the deck if the feet are at about deck level; otherwise the walker is on the sand underneath.
    return deck > sand && feetY >= deck - CONFIG.walk.stepUp ? deck : sand;
  },
  bounds: { minX: -CONFIG.world.halfWidth, maxX: CONFIG.world.halfWidth, maxZ: BOARDWALK.farZ },
  // Start on the pier next to the shop, looking out at the surf.
  spawn: { x: PIER.x - 2, z: PIER.shop.z + 1, heading: Math.PI },
  // The yellow mat in front of the counter.
  shop: { x: PIER.shop.x - PIER.shop.width / 2 - 2.2, z: PIER.shop.z },
};
