import type { Scene } from '../scene';
import type { BattleKind } from '../battle/scene';

export interface MenuConfig {
  onQuickBattle: (kind: BattleKind) => void;
  // CAMPAIGN HOOK: when the campaign scene lands, add
  //   onNewCampaign: () => void;
  // wire it to #menu-new-campaign below, and drop the `disabled` attribute
  // from the button in index.html.
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
  }

  exit() {
    this.ac?.abort();
    this.ac = null;
    this.root.style.display = 'none';
  }

  frame() {}
}
