import type { WaveSystem } from '../ocean/waves';
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
  private overlay = el('overlay');
  private overlayTitle = el('overlay-title');
  private overlaySub = el('overlay-sub');
  private overlayButton = el<HTMLButtonElement>('overlay-button');
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

  update(dt: number, surfer: Surfer, waves: WaveSystem): void {
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
    if (surfer.state === 'paddle') {
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
      case 'paddle':
        hint = '<b>WASD</b> paddle · <b>Shift</b> sprint · wait by the buoys, then <b>Space</b> on a wave';
        break;
      case 'surf':
        hint = '<b>A D</b> carve · <b>Shift</b> pump · <b>W</b> lean in · <b>S</b> stall · <b>Space</b> jump';
        break;
      case 'air':
        hint = '<b>Q E</b> spin · <b>W S</b> flip · let go to level out';
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

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
  }
}
