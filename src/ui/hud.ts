import { CONFIG } from '../config';
import type { WaveSystem } from '../ocean/waves';
import type { Popup, Score } from '../game/score';
import type { Surfer } from '../player/surfer';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** On-screen display: set timer, prompts, speed and banners. Plain DOM over the canvas. */
export class Hud {
  private root = el('hud');
  private setTimer = el('set-timer');
  private setLabel = el('set-label');
  private setFill = el('set-fill');
  private setPips = el('set-pips');
  private prompt = el('prompt');
  private banner = el('banner');
  private speed = el('speed-value');
  private hint = el('hint');
  private boardName = el('board-name');
  private kicks = el('kicks');
  private loadout = el('loadout');
  private lastLoadout = '';
  private lastKicks = '';
  private overlay = el('overlay');
  private overlayTitle = el('overlay-title');
  private overlaySub = el('overlay-sub');
  private overlayButton = el<HTMLButtonElement>('overlay-button');
  private scoreTotal = el('score-total');
  private combo = el('combo');
  private comboMult = el('combo-mult');
  private comboPot = el('combo-pot');
  private popups = el('popups');
  private barrelTag = el('barrel-tag');
  private shownTotal = 0;
  private lastTotalText = '';
  private lastPot = -1;
  private lastTag = '';
  private lastMult = 0;
  private pips: HTMLElement[] = [];
  private bannerTimer = 0;
  private lastLabel = '';
  private lastPrompt = '';
  private lastHint = '';

  constructor(wavesPerSet: number, onButton: () => void) {
    for (let i = 0; i < wavesPerSet; i++) {
      const pip = document.createElement('div');
      pip.className = 'pip';
      this.setPips.appendChild(pip);
      this.pips.push(pip);
    }
    this.overlayButton.addEventListener('click', onButton);
  }

  showOverlay(title: string, sub: string, button: string, enabled = true): void {
    this.overlayTitle.textContent = title;
    this.overlaySub.textContent = sub;
    this.overlayButton.textContent = button;
    this.overlayButton.disabled = !enabled;
    this.overlay.classList.remove('hidden');
  }

  hideOverlay(): void {
    this.overlay.classList.add('hidden');
    this.root.classList.remove('hidden');
  }

  flash(text: string, kind: 'good' | 'bad', seconds = 1.4): void {
    this.banner.textContent = text;
    this.banner.className = `show ${kind}`;
    this.bannerTimer = seconds;
  }

  /** Rising text for one scored move, e.g. "Backflip +100". */
  popup(p: Popup): void {
    const row = document.createElement('div');
    row.className = `popup ${p.kind}`;
    const sign = p.points >= 0 ? '+' : '−';
    row.innerHTML = `${p.text} <b>${sign}${Math.abs(p.points).toLocaleString('en-US')}</b>`;
    this.popups.appendChild(row);
    while (this.popups.childElementCount > 7) this.popups.firstElementChild!.remove();
    row.addEventListener('animationend', () => row.remove());
    if (p.kind === 'bank') this.flash(`BANKED +${p.points.toLocaleString('en-US')}`, 'good', 1.8);
  }

  /** Hearts and the weapon in hand, under the board name. */
  setLoadout(hearts: number, weapon: string | null): void {
    const key = `${hearts}:${weapon}`;
    if (key === this.lastLoadout) return;
    this.lastLoadout = key;
    this.loadout.innerHTML = `<span class="heart">${'♥'.repeat(hearts)}</span>${weapon ? ` · ${weapon}` : ''}`;
  }

  /**
   * @param action a prompt for something the player can do right here (for example open the shop), or ''
   */
  update(dt: number, surfer: Surfer, waves: WaveSystem, score: Score, action = ''): void {
    // Cool points: the banked total counts up to its new value.
    const gap = score.total - this.shownTotal;
    this.shownTotal = Math.abs(gap) < 1 ? score.total : this.shownTotal + gap * Math.min(1, dt * 6);
    const totalText = Math.round(this.shownTotal).toLocaleString('en-US');
    if (totalText !== this.lastTotalText) {
      this.scoreTotal.textContent = totalText;
      this.lastTotalText = totalText;
    }
    const pot = Math.round(score.pot);
    const mult = score.multiplier;
    if (pot !== this.lastPot || mult !== this.lastMult) {
      if (mult > this.lastMult && pot > 0) {
        // Restart the bump animation.
        this.comboMult.classList.remove('bump');
        void this.comboMult.offsetWidth;
        this.comboMult.classList.add('bump');
      }
      this.comboPot.textContent = pot.toLocaleString('en-US');
      this.comboMult.textContent = `x${mult}`;
      this.combo.classList.toggle('on', pot > 0);
      this.lastPot = pot;
      this.lastMult = mult;
    }
    const tag = surfer.onLip && surfer.lipTime > 0.25 ? 'ON THE LIP' : surfer.inBarrel && surfer.barrelTime > 0.25 ? 'IN THE BARREL' : '';
    if (tag !== this.lastTag) {
      if (tag) this.barrelTag.textContent = tag;
      this.barrelTag.classList.toggle('on', tag !== '');
      this.lastTag = tag;
    }

    // Set timer: counts down to the next set reaching the lineup.
    const s = waves.setStatus();
    const label = s.setActive ? 'SET ROLLING IN' : `NEXT SET IN ${Math.ceil(s.secondsToNext)}s`;
    if (label !== this.lastLabel) {
      this.setLabel.textContent = label;
      this.lastLabel = label;
    }
    this.setTimer.classList.toggle('active', s.setActive);
    const interval = waves.tuning.setInterval;
    const fill = s.setActive ? 1 : 1 - Math.min(1, s.secondsToNext / interval);
    this.setFill.style.width = `${(fill * 100).toFixed(1)}%`;
    for (let i = 0; i < this.pips.length; i++) this.pips[i].classList.toggle('on', i < s.wavesArrived);

    // Prompt in the middle of the screen.
    let prompt = '';
    let go = false;
    if (action) {
      prompt = action;
      go = true;
    } else if (surfer.state === 'paddle') {
      if (surfer.canPopUp) {
        prompt = 'SPACE: POP UP!';
        go = true;
      } else if (surfer.waveIncoming) {
        prompt = 'Wave coming. Get ready…';
      }
    }
    if (prompt !== this.lastPrompt) {
      this.prompt.textContent = prompt;
      this.prompt.classList.toggle('go', go);
      this.lastPrompt = prompt;
    }

    // Context controls, bottom left.
    let hint = '';
    switch (surfer.state) {
      case 'walk':
        hint = '<b>WASD</b> walk · <b>Shift</b> run · <b>Space</b> hop · jump off the end of the pier to go surfing · <b>F</b> at the shop';
        break;
      case 'paddle':
        hint = '<b>WASD</b> paddle · <b>Shift</b> sprint · wait by the buoys, then <b>Space</b> on a wave';
        break;
      case 'surf':
        hint =
          '<b>A D</b> carve · <b>Shift</b> pump · <b>S</b> stall for the barrel · <b>Space</b> jump · aim up the face to fly out the back<br>' +
          'Tricks: <b>Q</b> cutback · <b>E</b> snap · <b>W+Q</b> hang ten · <b>S+Q</b> tail slide · <b>W+E</b> floater';
        break;
      case 'air':
        hint =
          '<b>← →</b> spin · <b>↑ ↓</b> flip · <b>F</b> or right mouse grab · <b>A D</b> steer · <b>Space</b> air kick<br>' +
          (surfer.boosterLevel > 0 ? '<b>Shift</b> booster · ' : '') +
          '<b>S</b> air brake · let go of the arrows to level out';
        break;
      case 'wipeout':
        hint = 'Shake it off…';
        break;
    }
    if (hint !== this.lastHint) {
      this.hint.innerHTML = hint;
      this.lastHint = hint;
    }

    this.speed.textContent = String(Math.round(surfer.displaySpeed * 2.237));
    this.boardName.textContent = surfer.board.name;
    // Air kicks: filled pips are ready, the last one shows progress.
    const whole = Math.floor(surfer.kickCharges + 1e-6);
    const part = Math.round((surfer.kickCharges - whole) * 10);
    const key = `${whole}:${part}:${surfer.boosterLevel}`;
    if (key !== this.lastKicks) {
      this.lastKicks = key;
      let html = '';
      if (surfer.boosterLevel > 0) html += 'BOOST <span class="boost"><span id="boost-fill"></span></span> ';
      html += 'AIR KICK ';
      for (let i = 0; i < CONFIG.air.kickMaxCharges; i++) {
        const fill = i < whole ? 100 : i === whole ? part * 10 : 0;
        html += `<span class="kick"><span style="width:${fill}%"></span></span>`;
      }
      this.kicks.innerHTML = html;
    }

    if (surfer.boosterLevel > 0) {
      const fill = document.getElementById('boost-fill');
      if (fill) fill.style.width = `${Math.round((surfer.boostFuel / surfer.boostSeconds) * 100)}%`;
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
  }
}
