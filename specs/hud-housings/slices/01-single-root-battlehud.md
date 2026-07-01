# 01 — Single-root `<BattleHud>` (foundation)

**Pure refactor. Zero visual change. Re-bless nothing.**

## Contract unlocked
One React tree owns the whole battle HUD; `scene.ts` talks to it through a single
imperative handle. Collapses the three separate `createRoot` calls (`#hud`,
`#toolbar`, `#unitcards`) and the imperative minimap canvas into one root. This is
the foundation the three-card layout composes into — nothing moves yet.

## API seam
New `web/src/ui/hud/BattleHud.tsx`:

```ts
export interface BattleHudHandle {
  setInfo(data: HudData): void;                 // → LeftInfoCard local state (≤5 Hz)
  setToolbar(state: Record<string, ToolButtonState>): void; // → toolbar local state (≤5 Hz)
  buildCards(units: UnitCardInit[]): void;      // roster change (flushSync)
  cards: UnitCardsHandle;                        // the UNCHANGED 60 Hz per-frame handle
  minimapCanvas: HTMLCanvasElement;              // ref for scene.ts to draw into
  destroy(): void;
}
export function mountBattleHud(
  container: HTMLElement,
  cb: { onCardSelect(unit: number, additive: boolean): void; onToolbarCmd(cmd: string): void },
): BattleHudHandle;
```

- `<BattleHud>` composes `<LeftInfoCard>` (wraps the existing `HudPanel`),
  `<CenterCard>` (renders the card grid **and** `Toolbar` as **siblings**,
  positioned exactly where `#unitcards`/`#toolbar` are today — no merge yet), and
  `<RightMinimapCard>` (declares `<canvas width=240 height=160 ref>`, exposes it
  via the handle).
- **Extract** the `UnitCardsView` forwardRef leaf (currently inner to
  `UnitCardsReact.tsx`) into a shared module so `<BattleHud>` composes it under its
  own root, while the `UnitCardsReact` class wrapper (its own `createRoot`) stays
  intact for `uiLayer.ts`/the lab. `applyCardVisual`/`cardStateKey`/`applyCardGrid`
  in `unitCard.ts` stay **byte-for-byte** untouched.
- Each sub-card holds its **own local `useState`**; `<BattleHud>` renders its
  structure once and never re-renders on data. `UnitCardsView` is wrapped in
  `React.memo` on roster identity so `setInfo`/`setToolbar` never reconcile it.
- Mount into a **new `#battle-hud` child of `#battle-ui`**; leave `#gameover` /
  `#pausemenu` as their own roots.

`scene.ts` changes:
- Delete `createRoot(#toolbar)` (:446), `new UnitCardsReact(#unitcards)` (:816),
  `createRoot(#hud)` (:1118). Add one `mountBattleHud(...)`.
- `updateToolbar()` → `handle.setToolbar(state)` (keep the `lastToolbarSig` JSON
  diff). `updateHud()` → `handle.setInfo(data)`. `buildCards()` →
  `handle.buildCards()`. `tickCards()`/`updateCards()` → `handle.cards.update()`.
- `drawMinimap`/`worldToMini`/`miniBack`/the `mousedown` recenter listener read
  `handle.minimapCanvas` instead of `getElementById("minimap")`.
- **Relocate the `game.victor()` game-over check** (`scene.ts:~1490`, currently
  inside `updateHud`) out of the render path into the frame loop — it is logic,
  not UI, and must survive the collapse.

CSS: move the `#hud`/`#toolbar`/`#unitcards`/`#minimap` rules **verbatim** from
`index.html`'s inline `<style>` into a co-located `BattleHud.css` (or CSS module) —
same selectors, same values, so pixels are identical. (The `#unitcards` id rule
must keep painting so the lab's id-specificity keeps working; slice 02 dedupes.)

## What the human can run / see
`bun run --cwd web scene -- battle-selection` (and load a real `?battle=` in the
browser): the HUD looks **identical**, and selection, hover, toolbar clicks, and
minimap click-to-recenter all still work.

## Verification
- `battle-selection-dpr2` (`battle-renderer-visual.mjs`, GPU, **headful**) and
  `battle-initial` (`battle-smoke.mjs`) **byte-identical — NO re-bless.** That
  green-without-bless is the proof the refactor changed nothing.
- `battle-selection.mjs` (click/drag behavior) green.
- `card-bar.mjs` (lab) green — `UnitCardsReact` class untouched; `window.__cardGrid`
  still published.
- `?measurecards` card-update self-time still Δ≈0.
- Manual playability pass in a real battle.

This slice produces no *new* shot, only the unchanged baselines — so a
screenshot-critique is not required here; the byte-identity gate is the check.

## Stays green
Everything, **unblessed**. Lab path, `window.__cardGrid`/`__game`/`__cam`, modal
roots, the 60 Hz firewall.

## Feedback that would change this slice
If the single-root re-render fanout shows up in `?measurecards` (a `setInfo` at
5 Hz reconciling the card grid), tighten the memoization boundary before moving
on — do not proceed to layout slices on a leaky foundation.
