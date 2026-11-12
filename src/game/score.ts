import { CONFIG } from '../config';
import type { Surfer, SurferEvent } from '../player/surfer';

/** A line of pop-up text for one scored move, e.g. "Backflip +100". */
export interface Popup {
  text: string;
  points: number;
  /** 'move' adds to the combo, 'bank' is a clean finish, 'lost' is a wipeout. */
  kind: 'move' | 'bank' | 'lost';
}

/**
 * Cool points. Moves during a ride go into a combo pot and push the
 * multiplier up. Finishing the ride cleanly banks pot x multiplier.
 * A wipeout loses the pot and a slice of the banked total.
 */
export class Score {
  /** Banked points. This is what the shop will spend. */
  total = 0;
  /** Unbanked points from the current ride, before the multiplier. */
  pot = 0;
  /** Scored moves in the current ride. */
  moves = 0;
  /** Best single banked combo this session. */
  best = 0;
  /** Total banked over the session, ignoring penalties, for measuring points per minute. */
  earned = 0;
  readonly popups: Popup[] = [];
  private fastTime = 0;
  private repeats = new Map<string, number>();

  get multiplier(): number {
    const P = CONFIG.points;
    return Math.min(P.maxMultiplier, 1 + Math.floor(this.moves / P.movesPerMultiplier));
  }

  /** What the combo is worth right now if it were banked. */
  get potValue(): number {
    return Math.round(this.pot) * this.multiplier;
  }

  /** Call every physics step: pays out for riding flat out. */
  update(dt: number, surfer: Surfer): void {
    const P = CONFIG.points;
    if (surfer.state === 'surf' && surfer.carry > 0.5 && surfer.speed > surfer.board.maxSpeed * P.speedFraction) {
      this.fastTime += dt;
      if (this.fastTime >= P.speedEvery) {
        this.fastTime -= P.speedEvery;
        // Speed feeds the pot but does not raise the multiplier.
        this.add('Speed', P.speed, false);
      }
    }
  }

  onEvent(e: SurferEvent): void {
    const P = CONFIG.points;
    switch (e.type) {
      case 'trick': {
        const base = { cutback: P.cutback, snap: P.snap, hangTen: P.hangTen, tailSlide: P.tailSlide, floater: P.floater }[e.key];
        this.add(e.name, base * this.repeat(e.key));
        break;
      }
      case 'trickEnd': {
        const rate = { cutback: 0, snap: 0, hangTen: P.hangTenPerSecond, tailSlide: P.tailSlidePerSecond, floater: P.floaterPerSecond }[e.key];
        // The repeat count went up when the trick was counted, so look one back.
        const falloff = this.falloff((this.repeats.get(e.key) ?? 1) - 1);
        if (rate > 0 && e.time > 0.5) this.add(`${e.name} held ${e.time.toFixed(1)}s`, rate * e.time * falloff, false);
        break;
      }
      case 'barrel':
        this.add(`Barrel ${e.time.toFixed(1)}s`, P.barrelPerSecond * e.time);
        break;
      case 'lipRide':
        this.add(`Lip ride ${e.time.toFixed(1)}s`, P.lipRidePerSecond * e.time);
        break;
      case 'land': {
        if (e.hopped) this.add('Wave hop', P.waveHop);
        const flips = Math.round(Math.abs(e.flip) / (Math.PI * 2));
        if (flips > 0) {
          const name = e.flip > 0 ? 'Frontflip' : 'Backflip';
          this.add(flips > 1 ? `${flips === 2 ? 'Double' : flips === 3 ? 'Triple' : `${flips}x`} ${name.toLowerCase()}` : name, P.flip * flips);
        }
        const halves = Math.round(Math.abs(e.spin) / Math.PI);
        if (halves > 0) this.add(`${halves * 180} spin`, P.spin180 * halves);
        if (e.grab > 0) this.add('Grab', P.grab + P.grabPerSecond * e.grab);
        if (e.kicks > 0) this.add(e.kicks > 1 ? `${e.kicks} air kicks` : 'Air kick', P.airKick * e.kicks, false);
        if (e.seaward && !e.hopped) this.add('Out the back', P.outTheBack);
        if (e.airTime >= P.airMinTime) {
          const big = e.height >= P.bigAirHeight;
          this.add(big ? 'Big air' : 'Air', P.air + P.airPerSecond * e.airTime + (big ? P.bigAir : 0));
        }
        break;
      }
      case 'rideEnd':
        this.bank();
        break;
      case 'wipeout': {
        const lostPot = this.potValue;
        const penalty = Math.round(this.total * P.wipeoutPenalty);
        this.total -= penalty;
        if (lostPot + penalty > 0) this.popups.push({ text: 'Wipeout', points: -(lostPot + penalty), kind: 'lost' });
        this.clearRide();
        break;
      }
      default:
        break;
    }
  }

  /** Bank the combo: pot times multiplier goes into the total. */
  bank(): void {
    const value = this.potValue;
    if (value > 0) {
      this.total += value;
      this.earned += value;
      this.best = Math.max(this.best, value);
      this.popups.push({ text: this.multiplier > 1 ? `Banked x${this.multiplier}` : 'Banked', points: value, kind: 'bank' });
    }
    this.clearRide();
  }

  private clearRide(): void {
    this.pot = 0;
    this.moves = 0;
    this.fastTime = 0;
    this.repeats.clear();
  }

  private falloff(times: number): number {
    const P = CONFIG.points;
    return Math.max(P.repeatFloor, Math.pow(P.repeatFalloff, Math.max(0, times)));
  }

  /** How much a wave trick is worth this time, and count it. */
  private repeat(key: string): number {
    const n = this.repeats.get(key) ?? 0;
    this.repeats.set(key, n + 1);
    return this.falloff(n);
  }

  private add(text: string, points: number, countsAsMove = true): void {
    const p = Math.max(1, Math.round(points));
    this.pot += p;
    if (countsAsMove) this.moves++;
    this.popups.push({ text, points: p, kind: 'move' });
  }
}
