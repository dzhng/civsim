// Diegetic bronze tooltip for icon-only HUD controls (specs/done/hud-housings, slice
// 08). Built on Radix Tooltip for the behaviour we don't want to hand-roll — hover
// AND keyboard-focus triggers, a11y wiring, and top-side collision-aware placement
// so the chip opens UPWARD (the toolbar sits at the screen bottom) and never clips
// off-viewport. The LOOK is ours: skinned to the bronze tokens (see .hud-tooltip in
// bronze.css), never the default shadcn/Radix slate — a slate rounded chip would be
// the exact "webapp tell" the aesthetics skill forbids.
//
// Tooltips only appear on hover/focus, so they never show in the battle snapshots
// (no re-bless from adding them). Wrap the HUD once in <TooltipProvider>.

import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  // A short delay matches a game HUD (not the long OS-title wait); a skip window so
  // sweeping across the control strip shows the next chip immediately.
  return (
    <RadixTooltip.Provider delayDuration={280} skipDelayDuration={120}>
      {children}
    </RadixTooltip.Provider>
  );
}

/** Wrap an icon-only control. `label` is the tooltip copy (may be multi-line — the
 * first line is often a "Hotkey: X" hint); `children` is the trigger element. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          className="hud-tooltip"
          side="top"
          sideOffset={8}
          collisionPadding={10}
        >
          {label}
          <RadixTooltip.Arrow className="hud-tooltip-arrow" width={12} height={6} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
