# Battle Card-Bar Retrofit (shipped)

## What shipped

The bottom unit-card strip is a Total War-style card bar: one card per player
unit, **never scrolls**, **fixed-size cards** at a tall 3:4 aspect (they don't
resize to chase the roster — the bar **wraps into more rows** and shrink-wraps to
its cards), each portrait a **baked 3D-model PNG** (with a flat-canvas fallback),
under a green HP strength bar carrying the count, with cohesion + morale bars and a
gold-glow selection. The order toolbar beside it is bronze with Phosphor icons.

The load-bearing, durable core is the **grid math** (`cardGrid.ts`) and the
**shared card leaf** (per-frame bar paint stays imperative). Everything else — the
housing, the palette, the layout position — was later restructured by
`specs/done/hud-housings/` (see Divergences).

## Why it works this way

**Fixed card size + wrap-to-rows, not size-to-fit.** Total War keeps one card size
and adds rows; the rejected size-to-fit plan made a 5-unit army render as a few
giant cards and a 40-unit army as tiny ones. So `cardW` is an *input*, not an
output; the bar shrink-wraps to `cols × cardW` (centered) and only shrinks below
the fixed size in the extreme overflow case (more cards than `maxRows × perRow`),
flagged `degenerate`, purely to hold the no-scroll invariant.

**Row count is chosen in JS, painting is CSS.** Pure CSS / container queries can't
pick the row count because it depends on the card **count N**, which CSS can't see
(`auto-fill` wraps but won't *balance* 10+10 vs 16+4). So a JS pass writes
`--cols/--card-w/--card-h`; CSS grid paints. That pass runs on roster-change and
window-resize only — **never per frame**.

**Portraits are baked offline PNGs, not live render-to-texture.** There's no
render-to-texture in the frame path; adding 20–40 mini-passes/frame was rejected.
Baked PNGs cost nothing at runtime and still track the model (re-bake the sheet).
Trade-off: static (no facing/animation), re-bake when the model improves. Baked
**per look** (≤16 files), not per class×faction (30); faction stays a CSS accent
(`--fac`), not baked into pixels.

**All behavior in one shared card leaf.** Both the live game and the renderer-lab
converge on the same card component, so the grid + baked portrait reach both for
free. Rejected: migrating the scene's hot loop onto the lab's `BattleUiLayer`
(drags HUD/toolbar/camera-centering into scope).

## Principles & invariants (keep these true)

- **No scroll, ever.** The bar is a fixed-card grid that wraps into rows; it never
  becomes a scroll container. `computeCardGrid` shrinks (degenerate) rather than
  scroll past `maxRows × perRow`.
- **Cards are a fixed size** (`CARD_W`); the bar shrink-wraps and wraps to rows.
- **The per-frame bar paint stays imperative** — `applyCardVisual`/`cardStateKey`
  write HP/coh/mor/count straight to ref'd DOM nodes at 60 Hz; never route a
  per-frame value through React state (the load-bearing seam;
  `specs/done/ui-react-migration` and `specs/done/hud-housings` depend on it).
- **`window.__cardGrid`** ({rows, cols, cardW, degenerate}) is the contract the lab
  gate reads — keep publishing it from the grid pass.
- **Portrait = baked `<img>` with a canvas fallback** on missing/failed PNG
  (`drawPortrait`).
- **Below the min window the battle refuses to render** a cramped HUD and shows the
  `#viewport-too-small` placeholder instead of degrading silently.

## Pointers into the code

- `web/src/battle/cardGrid.ts` — `computeCardGrid(count, boxW, {cardW, aspect, gap,
  maxRows})` → `{rows, cols, cardW, cardH, degenerate}`. Pinned by
  `web/src/battle/cardGrid.test.mjs` (headless, `bun run --cwd web test:ui`).
- `web/src/battle/unitCard.ts` — `applyCardGrid` (grid pass + `window.__cardGrid`),
  `applyCardVisual`/`cardStateKey` (the 60 Hz paint), `drawPortrait` (canvas
  fallback), `CARD_W`, `MINIMAP_RESERVE`, `FACTION_CSS`.
- `web/src/ui/hud/UnitCardsView.tsx` — the shared card-grid leaf (structure +
  imperative handle); `UnitCardsReact.tsx` — the class wrapper the renderer-lab uses.
- `web/src/battle/classData.ts` — `CLASS_NAMES`, `cardThumbUrl(look)`; portraits
  baked per look via `web/shots/models/scripts/soldier-cards.mjs` (dual-write +
  `--check` freshness gate in `web/package.json` `bake:test`).
- `web/src/battle/viewportGate.ts` — `MIN_WINDOW_W/H` (1180×640) + the
  `#viewport-too-small` gate.
- Gate: `web/scenes/ui/card-bar.mjs` (lab route `/renderer/card-bar?count=N`,
  baselines `web/shots/ui/card-bar-{20,30,40}[-2x].png`, headless).

## Divergences (what changed after this spec shipped)

- **`class UnitCards` → `UnitCardsView` (shared leaf) + `UnitCardsReact` (class
  wrapper).** The vanilla class was migrated to React by
  `specs/done/ui-react-migration`; `specs/done/hud-housings` then split the leaf out
  so the single-root battle HUD and the lab share one implementation. The grid math
  and per-frame paint are unchanged.
- **`cardW` 72 → 58** (`specs/done/hud-housings`, David: 20% smaller). The lab gate's
  expected column counts moved with it (20→1×20, 30→2×15, 40→2×20).
- **Symmetric `MINIMAP_RESERVE` (210) → asymmetric budget.** Once the info card
  (bottom-left) and the minimap (bottom-right corner) flanked the bar, a symmetric
  reserve wrapped the bar too tall and covered mid-field units. `applyCardGrid` now
  takes `leftReserve`/`rightReserve`; production passes
  `BOTTOM_CARD_LEFT_RESERVE`/`BOTTOM_CARD_RIGHT_RESERVE`, the lab still passes
  `MINIMAP_RESERVE` on both sides (its gate pins to it). See `specs/done/hud-housings`.
- **Standalone `#unitcards` bronze housing → merged into `#battle-center`** (cards +
  toolbar in one tray), with the housing chrome moved to the shared `.hud-chassis` /
  `.hud-chassis--tray` classes in `bronze.css`. The two duplicated CSS copies (the
  original S5 "dedupe" tail) were resolved here; the lab CSS fork was deleted.
- **Deferred and still open:** role medallion, team-1 (red) faction portrait bakes,
  and the S5 data-path reconciliation (the scene's raw-literal offset reads). None
  shipped; revisit if a weapon-icon set / two-faction portrait need appears.

## Dead ends (don't re-walk)

- **Size-to-fit with a `minCardW` floor + a `boxH` height budget** — rejected; it
  grew/shrank cards with the roster (giant 5-unit bar, tiny 40-unit bar).
- **Live render-to-texture portraits** — rejected; no RTT in the frame path, and
  20–40 mini-passes/frame is not worth it vs a baked sheet.
- **Pure-CSS row balancing** — can't see the card count, so it can't balance rows.
- **Per class×faction portrait bakes (30 files)** — rejected for per-look (≤16) +
  a CSS faction accent.

## Visual provenance

- `assets/reference-tw-cardbar.png` — the **target**: the Total War Saga: Troy unit
  card bar. It defined the aesthetic contract this bar was held to (opaque
  worn-bronze housing, inset abutting card wells, baked-portrait cards, gold-glow
  selection — no webapp tells) and drove the chrome from flat CSS toward a layered
  bronze housing. `specs/done/battle-ui` generalized that contract to the whole HUD.
- `visualizations/grid-prototype.html` — the live tuning harness for the grid
  constants (`cardW`/`gap`/`maxRows`) used to pick the fixed-size wrap behavior
  before wiring it into the bar.
