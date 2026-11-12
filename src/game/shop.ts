import { CONFIG } from '../config';
import type { SaveData } from './save';

/** One row in the shop. */
export interface ShopItem {
  id: string;
  group: 'Boards' | 'Health' | 'Weapons' | 'Boss fight';
  name: string;
  blurb: string;
  price: number;
  /** 'buy' can be bought now, 'poor' costs too much, 'owned' can be equipped, 'equipped' is in use, 'done' has nothing left to do. */
  status: 'buy' | 'poor' | 'owned' | 'equipped' | 'done';
}

/** Hearts the player has for the boss fight. */
export function hearts(save: SaveData): number {
  return CONFIG.shop.baseHearts + save.health;
}

/**
 * The shop's rules: what is for sale, what it costs and what buying does.
 * It only changes the save data; the game applies the result (new board, new total).
 */
export class Shop {
  constructor(private save: SaveData) {}

  items(): ShopItem[] {
    const S = CONFIG.shop;
    const s = this.save;
    const afford = (price: number): 'buy' | 'poor' => (s.points >= price ? 'buy' : 'poor');
    const list: ShopItem[] = [];
    CONFIG.boards.forEach((b, i) => {
      list.push({
        id: `board:${i}`,
        group: 'Boards',
        name: b.name,
        blurb: b.blurb,
        price: S.boardPrices[i] ?? 0,
        status: s.board === i ? 'equipped' : s.boardsOwned[i] ? 'owned' : afford(S.boardPrices[i] ?? 0),
      });
    });
    const maxed = s.health >= S.healthPrices.length;
    list.push({
      id: 'health',
      group: 'Health',
      name: maxed ? `Hearts: ${hearts(s)} (max)` : `Extra heart (${hearts(s)} → ${hearts(s) + 1})`,
      blurb: 'One more hit you can take from the Stingray.',
      price: maxed ? 0 : S.healthPrices[s.health],
      status: maxed ? 'done' : afford(S.healthPrices[s.health]),
    });
    for (const w of S.weapons) {
      list.push({
        id: `weapon:${w.id}`,
        group: 'Weapons',
        name: w.name,
        blurb: w.blurb,
        price: w.price,
        status: s.weapon === w.id ? 'equipped' : s.weapons.includes(w.id) ? 'owned' : afford(w.price),
      });
    }
    list.push({
      id: 'boss',
      group: 'Boss fight',
      name: S.boss.name,
      blurb: s.bossTicket ? 'Bought. The fight itself arrives in the next update.' : S.boss.blurb,
      price: S.boss.price,
      status: s.bossTicket ? 'done' : afford(S.boss.price),
    });
    return list;
  }

  /** Buy or equip an item. Returns true if anything changed. */
  use(id: string): boolean {
    const item = this.items().find((it) => it.id === id);
    if (!item) return false;
    const s = this.save;
    const [kind, arg] = id.split(':');
    if (item.status === 'owned') {
      if (kind === 'board') s.board = Number(arg);
      else if (kind === 'weapon') s.weapon = arg;
      return true;
    }
    if (item.status !== 'buy') return false;
    s.points -= item.price;
    if (kind === 'board') {
      s.boardsOwned[Number(arg)] = true;
      s.board = Number(arg);
    } else if (kind === 'health') {
      s.health++;
    } else if (kind === 'weapon') {
      s.weapons.push(arg);
      s.weapon = arg;
    } else if (kind === 'boss') {
      s.bossTicket = true;
    }
    return true;
  }
}
