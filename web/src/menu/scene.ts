import type { Scene } from '../scene';
import type { BattleKind } from '../battle/scene';
import { CLASS_NAMES } from '../battle/classData';
import { MANUAL_HTML } from '../battle/manual';
import type { GpuSupportState } from '../../../packages/game-renderer/src/appShell';

export interface MenuConfig {
  onQuickBattle: (kind: BattleKind) => void;
  /** Head-to-head bench: class index per side + enemy AI toggle. */
  onDuel: (a: number, b: number, ai: boolean) => void;
  onNewCampaign: () => void;
  /** Load the named save slot; absent slot disables the button. */
  onLoadCampaign: () => void;
  hasSave: () => boolean;
  gpuStatus: GpuSupportState;
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
    this.updateGpuStatus();
    this.root.querySelectorAll<HTMLButtonElement>('button[data-battle]').forEach((b) => {
      b.addEventListener('click', () => this.cfg.onQuickBattle(b.dataset.battle as BattleKind), { signal });
    });
    // Duel bench: a modal behind the 1v1 button; pickers populate once.
    const modal = this.root.querySelector<HTMLElement>('#duel-modal')!;
    const selA = this.root.querySelector<HTMLSelectElement>('#duel-a')!;
    const selB = this.root.querySelector<HTMLSelectElement>('#duel-b')!;
    if (selA.options.length === 0) {
      for (const sel of [selA, selB]) {
        CLASS_NAMES.forEach((name, i) => sel.add(new Option(name, String(i))));
      }
      selB.value = String(CLASS_NAMES.length > 6 ? 6 : 0); // cav makes a lively default foe
    }
    this.root.querySelector<HTMLButtonElement>('#menu-1v1')!.addEventListener('click', () => {
      if (!this.cfg.gpuStatus.ok) return;
      modal.style.display = 'flex';
      selA.focus();
    }, { signal });
    this.root.querySelector<HTMLButtonElement>('#duel-cancel')!.addEventListener('click', () => {
      modal.style.display = 'none';
    }, { signal });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    }, { signal });
    const aiBox = this.root.querySelector<HTMLInputElement>('#duel-ai')!;
    this.root.querySelector<HTMLButtonElement>('#menu-duel')!.addEventListener('click', () => {
      if (!this.cfg.gpuStatus.ok) return;
      modal.style.display = 'none';
      this.cfg.onDuel(Number(selA.value), Number(selB.value), aiBox.checked);
    }, { signal });
    // The field manual, readable before ever entering a battle.
    const manual = document.getElementById('manual')!;
    if (!manual.innerHTML) manual.innerHTML = MANUAL_HTML;
    this.root.querySelector<HTMLButtonElement>('#menu-manual')!.addEventListener('click', () => {
      manual.style.display = manual.style.display === 'block' ? 'none' : 'block';
    }, { signal });
    const nc = this.root.querySelector<HTMLButtonElement>('#menu-new-campaign')!;
    nc.addEventListener('click', () => this.cfg.onNewCampaign(), { signal });
    const ls = this.root.querySelector<HTMLButtonElement>('#menu-load-save')!;
    ls.disabled = !this.cfg.gpuStatus.ok || !this.cfg.hasSave();
    if (!this.cfg.gpuStatus.ok) ls.title = this.cfg.gpuStatus.message;
    ls.addEventListener('click', () => this.cfg.onLoadCampaign(), { signal });
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      modal.style.display = 'none';
      manual.style.display = 'none';
    }, { signal });
  }

  exit() {
    this.ac?.abort();
    this.ac = null;
    this.root.style.display = 'none';
    this.root.querySelector<HTMLElement>('#duel-modal')!.style.display = 'none';
    document.getElementById('manual')!.style.display = 'none';
  }

  frame() {}

  private updateGpuStatus() {
    const status = this.root.querySelector<HTMLElement>('#menu-renderer-status')!;
    status.classList.toggle('ok', this.cfg.gpuStatus.ok);
    status.classList.toggle('bad', !this.cfg.gpuStatus.ok);
    status.textContent = this.cfg.gpuStatus.ok ? this.cfg.gpuStatus.message : `WebGPU unavailable: ${this.cfg.gpuStatus.message}`;

    const launchButtons = [
      ...Array.from(this.root.querySelectorAll<HTMLButtonElement>('button[data-battle]')),
      this.root.querySelector<HTMLButtonElement>('#menu-1v1')!,
      this.root.querySelector<HTMLButtonElement>('#menu-new-campaign')!,
      this.root.querySelector<HTMLButtonElement>('#menu-load-save')!,
    ];
    for (const button of launchButtons) {
      button.disabled = !this.cfg.gpuStatus.ok;
      button.title = this.cfg.gpuStatus.ok ? '' : this.cfg.gpuStatus.message;
    }
  }
}
