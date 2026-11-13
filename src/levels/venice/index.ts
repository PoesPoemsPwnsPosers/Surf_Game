import { CONFIG } from '../../config';
import type { LevelDefinition } from '../../core/level';
import { buildVeniceEnvironment } from './environment';
import { veniceLand } from './layout';

const venice: LevelDefinition = {
  id: 'venice',
  name: 'Venice Beach',
  waves: CONFIG.waves.venice,
  ocean: {
    deep: 0x1b86d6,
    shallow: 0x3ad6cc,
    face: 0x58ead8,
    foam: 0xffffff,
  },
  land: veniceLand,
  buildEnvironment: buildVeniceEnvironment,
};

export default venice;
