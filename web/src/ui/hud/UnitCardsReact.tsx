// The Total-War unit-card strip: a thin class wrapper that owns its OWN React root.
//
// The card STRUCTURE lives in the shared <UnitCardsView> leaf (see UnitCardsView.tsx
// for the 60Hz firewall rationale). This class keeps the vanilla-compatible
// build/update surface so the renderer-lab (src/battle/uiLayer.ts) can drop it onto
// a bare `#unitcards` element without a surrounding React tree. The production HUD
// uses <BattleHud> instead, which composes <UnitCardsView> directly under its own
// single root.

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { MINIMAP_RESERVE, type UnitCardInit, type UnitCardState } from "../../battle/unitCard";
import { UnitCardsView, type UnitCardsHandle } from "./UnitCardsView";

export type { UnitCardsHandle } from "./UnitCardsView";

/** Drop-in for the vanilla `UnitCards` (same build/update surface) so BattleScene
 * picks one by a flag and the rAF call site is identical for the measurement. */
export class UnitCardsReact {
  private root: Root;
  private handle: UnitCardsHandle | null = null;
  /** Stable ref to the container the grid vars are written to (preexisting node). */
  private rootRef: { current: HTMLElement | null };

  constructor(
    private container: HTMLElement,
    private onSelect: (unit: number, additive: boolean) => void,
    private sideReserve: number = MINIMAP_RESERVE,
  ) {
    this.root = createRoot(container);
    this.rootRef = { current: container };
  }

  /** (Re)build the structure. flushSync so the refs are live before the next
   * update() — build is rare (roster change), so the sync commit is fine. */
  build(units: UnitCardInit[]) {
    flushSync(() => {
      this.root.render(
        createElement(UnitCardsView, {
          units,
          onSelect: this.onSelect,
          leftReserve: this.sideReserve,
          rightReserve: this.sideReserve,
          rootRef: this.rootRef,
          ref: (h: UnitCardsHandle | null) => {
            this.handle = h;
          },
        }),
      );
    });
  }

  update(states: (UnitCardState | null)[]) {
    this.handle?.update(states);
  }

  destroy() {
    this.root.unmount();
  }
}
