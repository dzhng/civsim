# HUD Housings — three bronze cards across the bottom (shipped)

## What shipped

The battle HUD is **one React tree** (`web/src/ui/hud/BattleHud.tsx`, mounted by
`mountBattleHud`) rendering **three worn-bronze housings** along the bottom of the
screen, in the Total War Saga: Troy idiom:

- **Bottom-left** — the unit info card (`#hud`). Shows the selected/hovered unit's
  detail, or an **army-roster summary** (units alive, "holding the line"/"N
  routing", STR/MOR/COH bars) when nothing is selected, so the card is never empty.
- **Bottom-center** — one housing (`#battle-center`, the ornate `.hud-chassis--tray`)
  holding the unit-card grid on top and the order/time **control strip** below it.
- **Bottom-right** — the minimap (`#minimap`), flush in the corner.

A faint, transparent **FPS readout** sits top-left (bare dev telemetry, not HUD
chrome). Icon-only controls carry **custom bronze tooltips** (Radix, skinned to the
bronze tokens) on hover and keyboard focus. Unit cards are a fixed 58px.

This replaced four independently-mounted DOM islands (three separate `createRoot`
calls + an imperative minimap canvas — leftover `ui-react-migration` scaffolding)
and moved the info panel from the top-left to the bottom-left.

## Why it works this way

**One React root, but the 60 Hz card paint stays imperative.** React owns card
*structure* only; the rAF loop writes HP/coh/mor/count straight to ref'd DOM nodes
via `UnitCardsView`'s imperative handle. Routing a per-frame value through React
state would blow the perf budget the `ui-react-migration` spike measured. So the
HUD is composed of independent stateful islands (`LeftInfoCard`, `CenterCard` →
`CardsHost` + `ToolbarHost`, `FpsReadout`) whose parent holds no data state: a
≤5 Hz `setInfo`/`setToolbar` re-renders only its own island and never reconciles
the card grid. `setInfo`/`setToolbar`/`buildCards` use `flushSync` so snapshots stay
deterministic — the same reason the pre-collapse code did.

**The card-bar budget is asymmetric because the bottom row is asymmetric.** The
bar reserves `BOTTOM_CARD_LEFT_RESERVE` (336, clears the info card) on the left and
`BOTTOM_CARD_RIGHT_RESERVE` (268, clears the corner minimap) on the right, and
centers on `--card-center-x` (written by `applyCardGrid`) in the gap between them —
not on the viewport. A *symmetric* reserve is not viable: reserving enough on both
sides to clear the 326px info card narrows the bar so it wraps an extra row, grows
tall, and covers mid-field units — which broke click-selection (see Dead ends). At
1280px CSS the info card + a one-row 9-card bar + minimap clearance genuinely don't
all fit; per David's call the bar simply **wraps to more rows** within its reserved
budget (the 20%-smaller cards keep the common 5v5 roster to one row).

**Housing CSS lives where both apps can reach it, and production overrides are
scoped.** The `/renderer` lab and the game are the *same* web SPA
(`web/src/main.ts` dynamically imports the lab router into `index.html`), so both
load `index.html`'s inline `<style>` and the globally-linked `bronze.css`. The
shared `.hud-chassis` / `.hud-chassis--tray` housing classes therefore live in
`bronze.css`. The center housing strips the standalone frame off `#unitcards` /
`#toolbar` with **descendant-scoped** rules (`#battle-center #unitcards { … }`) that
only touch the production instances; the lab's `#unitcards` (not inside
`#battle-center`) is untouched — which is why the lab card-bar gate stayed
byte-identical through the restructure.

**The palette warmed toward the reference.** `bronze.css` `--bronze-fill`/`-edge`
lean amber-red and `--bronze-frame` carries an engraved groove ring for a cast
bevel; card wells are crimson-dark; the stat bars are squared (not rounded-cap CSS
progress bars). Because the tokens are shared, the menu warmed with the battle HUD.

## Principles & invariants (keep these true)

- **Never route a per-frame card value through React state.** `cards.update()` →
  `UnitCardsView` imperative handle → `applyCardVisual`/`cardStateKey`
  (`web/src/battle/unitCard.ts`). The `?measurecards` self-time
  (`window.__cardUpdateSamples`) must stay ≈0.
- **HUD islands stay independent.** Cards and toolbar are separate stateful
  components under a stateless parent; a toolbar/info refresh must not reconcile the
  card grid. `#battle-center` is a structural wrapper only.
- **The minimap is a `<canvas 240×160>` that `scene.ts` draws into.** React declares
  it and hands over the ref; `worldToMini`/`miniBack`/click-to-recenter depend on
  240×160 — frame it, don't resize it.
- **HUD chrome sits above the world-space unit banners** (`#unitlabels`, z-index 3).
  Every housing is ≥ z-index 5 — including `#hud` (regression: the info card had no
  z-index and banners painted over it once it moved to the bottom, where units are).
- **The renderer-lab shares `index.html`'s global id rules.** Any change to
  `#unitcards`/`#toolbar`/`.ucard` styling ripples to the lab; keep production-only
  changes descendant-scoped under `#battle-center`, and keep the `UnitCardsReact`
  class working (it backs the lab).
- **`MINIMAP_RESERVE` (210) is the lab's symmetric reserve** — its `card-bar.mjs`
  gate pins column counts to it. Production uses the asymmetric constants; don't
  collapse them back.
- **The FPS readout is non-diegetic dev telemetry** — bare, transparent,
  `pointer-events:none`, "fps —" when frozen (deterministic snapshots). Do not wrap
  it in a housing; the aesthetics no-transparency rule governs game panels, not it.

## Pointers into the code

- `web/src/ui/hud/BattleHud.tsx` — the single root, `BattleHudHandle`, and the
  islands (`LeftInfoCard`, `FpsReadout`, `CenterCard`/`CardsHost`/`ToolbarHost`).
- `web/src/ui/hud/UnitCardsView.tsx` — the shared card-grid leaf (structure +
  60 Hz imperative handle); `UnitCardsReact.tsx` — the class wrapper the lab uses.
- `web/src/ui/hud/HudPanel.tsx` — `UnitReadout` / `RosterReadout`;
  `web/src/battle/armySummary.ts` — the men-weighted roster fn (pinned by
  `armySummary.test.mjs`).
- `web/src/ui/hud/Tooltip.tsx` — Radix `TooltipProvider`/`Tooltip`; chip style is
  `.hud-tooltip` in `web/src/ui/theme/bronze.css`.
- `web/src/battle/unitCard.ts` — `applyCardGrid(root, count, leftReserve,
  rightReserve)`, `CARD_W`, `MINIMAP_RESERVE`, `BOTTOM_CARD_LEFT_RESERVE`,
  `BOTTOM_CARD_RIGHT_RESERVE`.
- `web/src/battle/scene.ts` — mounts `<BattleHud>`, drives it (`updateHud`/
  `updateToolbar`/`buildCards`/`tickCards`/`drawMinimap`), and `checkGameover()`
  (lifted out of the render path).
- `web/index.html` — `#battle-hud` mount container, the `#hud`/`#unitcards`/
  `#toolbar`/`#minimap`/`#battle-center` rules; `web/src/ui/theme/bronze.css` — the
  bronze tokens + `.hud-chassis`/`--tray`/`.hud-tooltip`.
- Gates: `web/scenes/ui/card-bar.mjs` (lab grid, headless), `battle-renderer-visual`
  (`battle-selection-dpr2`), `battle-smoke`, `battle-minimap`, `battle-input`
  (selection + tooltip hover/focus + freeze). GPU scenes run **headful**
  (`VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware VERIFY_HEADFUL=1
  VERIFY_BROWSER_CHANNEL=chrome`); the scene runner expects a `bun run dev` server
  at `:5173`.

## Dead ends (don't re-walk)

- **Symmetric interim card-bar reserve.** The first attempt reserved the info-card
  width on both sides; the bar wrapped taller and covered mid-field units, breaking
  `battle-input`'s click-selection (confirmed by stashing). The asymmetric budget
  replaced it.
- **A `<Chassis>` React component.** A wrapper element would add a DOM node and shift
  layout; the reusable primitive is the CSS class (`.hud-chassis`), applied directly.
- **Wholesale move of HUD CSS out of `index.html`.** Entangled with the shared
  web/lab SPA — moving `.ucard`/`#unitcards` into a `BattleHud`-only stylesheet would
  break the lab (its route never imports `BattleHud`). Shared classes went to
  `bronze.css` instead; the rest stayed in `index.html`.
- **Cast scrollwork filigree in CSS.** Declined (David: "bevel is enough"). True
  filigree wants a dedicated 9-slice SVG border asset and wouldn't cover the canvas
  minimap uniformly; the deeper cast bevel + engraved groove carries the read.
  Round portrait/minimap were likewise deferred — both are future enhancements.

## Visual provenance

- `assets/reference-tw-cardbar.png` — the **target**: the Total War Saga: Troy
  unit-card bar (from the `aesthetics` skill's references). It defined "done": an
  opaque worn-bronze housing framing inset card wells, a left general medallion, a
  right minimap — the standard the hard aesthetic contract (opaque, framed, inset,
  no webapp tells) was checked against. The shipped HUD passes that contract; it
  keeps the reference's *structure* and warmed toward its reddish-bronze, while
  leaving its round medallion/minimap and cast filigree as future work.
- `visualizations/layout.html` — the roadmap sketch of the three-housing bottom
  layout (schematic, not pixel-accurate) used to agree the cut before building.
