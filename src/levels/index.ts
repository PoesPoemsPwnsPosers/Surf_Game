import type { LevelDefinition } from '../core/level';

/**
 * The beaches. Each one is a separate chunk that is only downloaded when it
 * is played. To add a beach: create src/levels/<name>/index.ts that default
 * exports a LevelDefinition, then add a line here.
 */
export const LEVELS = {
  venice: () => import('./venice'),
  // mavericks: () => import('./mavericks'),
  // pipeline: () => import('./pipeline'),
} satisfies Record<string, () => Promise<{ default: LevelDefinition }>>;

export type LevelId = keyof typeof LEVELS;

export async function loadLevel(id: LevelId): Promise<LevelDefinition> {
  return (await LEVELS[id]()).default;
}
