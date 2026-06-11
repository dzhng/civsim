import type { Scene } from '../scene';
import type { BattleKind } from '../battle/scene';
import { CLASS_NAMES } from '../battle/renderer';

export interface MenuConfig {
  onQuickBattle: (kind: BattleKind) => void;
  /** Head-to-head bench: class index per side + enemy AI toggle. */
  onDuel: (a: number, b: number, ai: boolean) => void;
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
    // Duel bench: populate the class pickers once, remember last choice.
    const selA = this.root.querySelector<HTMLSelectElement>('#duel-a')!;
    const selB = this.root.querySelector<HTMLSelectElement>('#duel-b')!;
    if (selA.options.length === 0) {
      for (const sel of [selA, selB]) {
        CLASS_NAMES.forEach((name, i) => sel.add(new Option(name, String(i))));
      }
      selB.value = String(CLASS_NAMES.length > 6 ? 6 : 0); // cav makes a lively default foe
    }
    const aiBox = this.root.querySelector<HTMLInputElement>('#duel-ai')!;
    this.root.querySelector<HTMLButtonElement>('#menu-duel')!.addEventListener('click', () => {
      this.cfg.onDuel(Number(selA.value), Number(selB.value), aiBox.checked);
    }, { signal });
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
