import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import '../ui/tailwind.css';
import type { Scene } from '../scene';
import type { BattleKind } from '../battle/scene';
import { CLASS_NAMES, UNIT_CLASS_BY_KEY, UnitClass } from '../battle/classData';
import { MANUAL_HTML } from '../battle/manual';
import type { GpuSupportState } from '../../../packages/game-renderer/src/appShell';
import { Menu } from '../ui/menu/Menu';
import { mountQuickBattleSetup, type QuickBattleClassSpec, type QuickBattleConfig, type QuickBattleSetup } from './quickBattleSetup';

export interface MenuConfig {
  onQuickBattle: (kind: BattleKind) => void;
  /** Head-to-head bench: class index per side + enemy AI toggle. */
  onDuel: (a: number, b: number, ai: boolean) => void;
  /** Launch a configured custom battle (map + two armies). */
  onCustomBattle: (cfg: QuickBattleConfig) => void;
  /** Canonical class rows (id/name/cost) for the custom-battle army builders. */
  classSpecs: QuickBattleClassSpec[];
  onNewCampaign: () => void;
  /** Load the named save slot; absent slot disables the button. */
  onLoadCampaign: () => void;
  hasSave: () => boolean;
  gpuStatus: GpuSupportState;
}

/** Boot scene: the menu is React, mounted into the #ui-root overlay. The
 * custom-battle army builder stays vanilla DOM (driven by mountQuickBattleSetup
 * against the body-level #quick-battle-modal) until a later slice; React only
 * renders its trigger. The field manual (#manual) also stays a vanilla overlay
 * React toggles imperatively. No GL. */
export class MenuScene implements Scene {
  private mount = document.getElementById('ui-root')!;
  private reactRoot: Root | null = null;
  private quickBattle: QuickBattleSetup;

  constructor(private cfg: MenuConfig) {
    this.quickBattle = mountQuickBattleSetup(document.body, this.cfg.classSpecs, this.cfg.onCustomBattle);
  }

  enter() {
    const manual = document.getElementById('manual')!;
    if (!manual.innerHTML) manual.innerHTML = MANUAL_HTML;
    this.reactRoot ??= createRoot(this.mount);
    this.reactRoot.render(createElement(Menu, {
      gpuStatus: this.cfg.gpuStatus,
      classNames: CLASS_NAMES,
      duelDefaultB: UNIT_CLASS_BY_KEY[UnitClass.ShockCavalry], // cav makes a lively default foe
      hasSave: this.cfg.hasSave(),
      onQuickBattle: this.cfg.onQuickBattle,
      onOpenCustomBattle: () => { if (this.cfg.gpuStatus.ok) this.quickBattle.open(); },
      onDuel: this.cfg.onDuel,
      onNewCampaign: this.cfg.onNewCampaign,
      onLoadCampaign: this.cfg.onLoadCampaign,
      onToggleManual: () => { manual.style.display = manual.style.display === 'block' ? 'none' : 'block'; },
      onHideManual: () => { manual.style.display = 'none'; },
    }));
  }

  exit() {
    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.quickBattle.close();
    document.getElementById('manual')!.style.display = 'none';
  }

  frame() {}
}
