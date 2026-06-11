import type { Scene } from '../scene';
import type { BattleKind } from '../battle/scene';

export interface MenuConfig {
  onQuickBattle: (kind: BattleKind) => void;
  onNewCampaign: () => void;
  /** Load the named save slot; absent slot disables the button. */
  onLoadCampaign: () => void;
  hasSave: () => boolean;
}

/** Boot scene: plain DOM over a dark backdrop, no GL. Markup lives in #menu-ui. */
export class MenuScene implements Scene {
  private root = document.getElementById('menu-ui')!;
  private ac: AbortController | null = null;

  constructor(private cfg: MenuConfig) {}

  enter() {
    this.root.style.display = 'flex';
    this.ac = new AbortController();
    const { signal } = this.ac;
    this.root.querySelectorAll<HTMLButtonElement>('button[data-battle]').forEach((b) => {
      b.addEventListener('click', () => this.cfg.onQuickBattle(b.dataset.battle as BattleKind), { signal });
    });
    const nc = this.root.querySelector<HTMLButtonElement>('#menu-new-campaign')!;
    nc.addEventListener('click', () => this.cfg.onNewCampaign(), { signal });
    const ls = this.root.querySelector<HTMLButtonElement>('#menu-load-save')!;
    ls.disabled = !this.cfg.hasSave();
    ls.addEventListener('click', () => this.cfg.onLoadCampaign(), { signal });
  }

  exit() {
    this.ac?.abort();
    this.ac = null;
    this.root.style.display = 'none';
  }

  frame() {}
}
