import type * as THREE from 'three';
import type { WaveTuning } from '../config';
import type { OceanLook } from '../ocean/oceanMesh';

/** Lets scenery (buoys, boats) float on the water. */
export interface WaterSurface {
  height(x: number, z: number): number;
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
  buildEnvironment(scene: THREE.Scene, water: WaterSurface): LevelEnvironment;
}
