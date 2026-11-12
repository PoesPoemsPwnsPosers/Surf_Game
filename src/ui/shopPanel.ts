import type { ShopItem } from '../game/shop';

const fmt = (n: number): string => n.toLocaleString('en-US');

/** The shop screen. It only draws rows and reports clicks; the rules live in game/shop.ts. */
export class ShopPanel {
  private root = document.getElementById('shop') as HTMLElement;
  private list = document.getElementById('shop-list') as HTMLElement;
  private points = document.getElementById('shop-points') as HTMLElement;
  private note = document.getElementById('shop-note') as HTMLElement;
  private reset = document.getElementById('shop-reset') as HTMLButtonElement;
  private resetArmed = false;

  constructor(handlers: { onUse(id: string): void; onClose(): void; onReset(): void }) {
    this.list.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-id]') as HTMLButtonElement | null;
      if (btn && !btn.disabled) handlers.onUse(btn.dataset.id!);
    });
    (document.getElementById('shop-close') as HTMLButtonElement).addEventListener('click', handlers.onClose);
    // Wiping progress takes two clicks.
    this.reset.addEventListener('click', () => {
      if (this.resetArmed) {
        handlers.onReset();
        this.disarm();
      } else {
        this.resetArmed = true;
        this.reset.textContent = 'Click again to wipe everything';
      }
    });
  }

  private disarm(): void {
    this.resetArmed = false;
    this.reset.textContent = 'Reset progress';
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(): void {
    this.disarm();
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  render(items: ShopItem[], points: number, saved: boolean): void {
    this.points.textContent = fmt(points);
    this.note.textContent = saved ? 'Progress is saved in this browser.' : 'This browser is not letting the game save, so progress lasts until the page closes.';
    let html = '';
    let group = '';
    for (const it of items) {
      if (it.group !== group) {
        group = it.group;
        html += `<div class="shop-group">${group}</div>`;
      }
      const label =
        it.status === 'equipped' ? 'In use' : it.status === 'owned' ? 'Use' : it.status === 'done' ? 'Done' : it.price === 0 ? 'Free' : `Buy · ${fmt(it.price)}`;
      const short = it.status === 'poor' ? `<span class="short">${fmt(it.price - points)} more needed</span>` : '';
      const off = it.status === 'equipped' || it.status === 'done' || it.status === 'poor';
      html +=
        `<div class="shop-row ${it.status}"><div class="shop-text"><b>${it.name}</b><span>${it.blurb}</span>${short}</div>` +
        `<button data-id="${it.id}"${off ? ' disabled' : ''}>${label}</button></div>`;
    }
    this.list.innerHTML = html;
  }
}
