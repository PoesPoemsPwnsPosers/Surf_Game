import type * as THREE from 'three';
import type { WaveTuning } from '../config';
import type { OceanLook } from '../ocean/oceanMesh';

/** Lets scenery (buoys, boats) float on the water. */
export interface WaterSurface {
  height(x: number, z: number): number;
}

/** The walkable land of a beach: sand, boardwalk, pier. */
export interface LandMap {
  /**
   * Height of the ground under a walker at (x, z). `feetY` is how high the walker's feet are now,
   * which decides whether they are on top of something (a pier deck) or underneath it.
   */
  ground(x: number, z: number, feetY: number): number;
  /** Height of the sea bed or sand, ignoring anything built on top. */
  sand(x: number, z: number): number;
  /** Limits of where the player can walk. */
  bounds: { minX: number; maxX: number; maxZ: number };
  /** Where a new game starts, standing. `heading` uses the same convention as the surfer. */
  spawn: { x: number; z: number; heading: number };
  /** Where the shop counter is. F opens the shop from close by. */
  shop: { x: number; z: number };
}

/** Scenery and lighting for one beach. */
export interface LevelEnvironment {
  update(dt: number, time: number): void;
}

/**
 * Everything that makes one beach different from another.
 * Each beach lives in its own folder under src/levels and is loaded on demand.
 */
export interface LevelDefinition {
  id: string;
  name: string;
  waves: WaveTuning;
  ocean: OceanLook;
  land: LandMap;
  buildEnvironment(scene: THREE.Scene, water: WaterSurface): LevelEnvironment;
}
