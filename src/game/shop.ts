import { CONFIG } from '../config';
import type { SaveData } from './save';

/** One row in the shop. */
export interface ShopItem {
  id: string;
  group: 'Boards' | 'Booster' | 'Health' | 'Weapons' | 'Boss fight';
  name: string;
  blurb: string;
  price: number;
  /** 'buy' can be bought now, 'poor' costs too much, 'owned' can be equipped, 'equipped' is in use, 'done' has nothing left to do. */
  status: 'buy' | 'poor' | 'owned' | 'equipped' | 'done' | 'locked';
  /** Button text, when the usual one for the status does not fit. */
  label?: string;
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
    const nextBoost = CONFIG.booster[s.booster];
    list.push({
      id: 'booster',
      group: 'Booster',
      name: nextBoost ? nextBoost.name : `${CONFIG.booster[s.booster - 1].name} (max)`,
      blurb: nextBoost
        ? `Hold Shift in the air to boost for ${nextBoost.seconds} seconds. Refills when you touch down.`
        : 'The longest, strongest boost there is.',
      price: nextBoost ? nextBoost.price : 0,
      status: nextBoost ? afford(nextBoost.price) : 'done',
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
      blurb: !s.bossTicket
        ? S.boss.blurb
        : !s.weapon
          ? 'You need a weapon before you can fight.'
          : s.mavericksUnlocked
            ? 'Beaten. Mavericks is unlocked. Fight again for the reward.'
            : 'Shoot it while you surf. Losing costs nothing.',
      price: S.boss.price,
      status: !s.bossTicket ? afford(S.boss.price) : s.weapon ? 'owned' : 'locked',
      label: s.bossTicket ? (s.weapon ? 'Fight!' : 'No weapon') : undefined,
    });
    list.push({
      id: 'mavericks',
      group: 'Boss fight',
      name: 'Mavericks',
      blurb: s.mavericksUnlocked ? 'Unlocked. The beach itself is still being built.' : 'The next beach. Beat the Stingray to unlock it.',
      price: 0,
      status: 'locked',
      label: s.mavericksUnlocked ? 'Unlocked' : 'Locked',
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
      // The boss row starts the fight; the game handles that.
      return kind !== 'boss';
    }
    if (item.status !== 'buy') return false;
    s.points -= item.price;
    if (kind === 'board') {
      s.boardsOwned[Number(arg)] = true;
      s.board = Number(arg);
    } else if (kind === 'health') {
      s.health++;
    } else if (kind === 'booster') {
      s.booster++;
    } else if (kind === 'weapon') {
      s.weapons.push(arg);
      s.weapon = arg;
    } else if (kind === 'boss') {
      s.bossTicket = true;
    }
    return true;
  }
}
