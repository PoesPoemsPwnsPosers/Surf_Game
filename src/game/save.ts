import { CONFIG } from '../config';

/** Everything that is kept between visits. */
export interface SaveData {
  version: 1;
  /** Banked cool points. */
  points: number;
  /** Best single banked combo. */
  best: number;
  /** Which board tiers are owned, in the order of CONFIG.boards, and which one is in use. */
  boardsOwned: boolean[];
  board: number;
  /** Health upgrades bought (0 to the number of health prices). */
  health: number;
  /** Ids of weapons owned, and the one in hand. */
  weapons: string[];
  weapon: string | null;
  /** The boss fight has been bought. */
  bossTicket: boolean;
}

const KEY = 'surf-game.save.v1';

export function newSave(): SaveData {
  return {
    version: 1,
    points: CONFIG.debug.startPoints,
    best: 0,
    boardsOwned: CONFIG.boards.map((_, i) => i <= CONFIG.startingBoardTier),
    board: CONFIG.startingBoardTier,
    health: 0,
    weapons: [],
    weapon: null,
    bossTicket: false,
  };
}

/** Read the save from the browser. Anything missing or broken falls back to a fresh game. */
export function loadSave(): SaveData {
  const fresh = newSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (d.version !== 1) return fresh;
    const boardsOwned = fresh.boardsOwned.map((own, i) => own || d.boardsOwned?.[i] === true);
    const board = typeof d.board === 'number' && boardsOwned[d.board] ? d.board : fresh.board;
    const ids = new Set<string>(CONFIG.shop.weapons.map((w) => w.id));
    const weapons = Array.isArray(d.weapons) ? d.weapons.filter((id) => ids.has(id)) : [];
    return {
      version: 1,
      points: Math.max(0, Math.round(Number(d.points) || 0)),
      best: Math.max(0, Math.round(Number(d.best) || 0)),
      boardsOwned,
      board,
      health: Math.min(CONFIG.shop.healthPrices.length, Math.max(0, Math.round(Number(d.health) || 0))),
      weapons,
      weapon: d.weapon && weapons.includes(d.weapon) ? d.weapon : (weapons[0] ?? null),
      bossTicket: d.bossTicket === true,
    };
  } catch {
    // Storage can be blocked (private windows, embedded pages). The game still works, it just forgets.
    return fresh;
  }
}

/** Returns false when the browser would not store it. */
export function writeSave(data: SaveData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
