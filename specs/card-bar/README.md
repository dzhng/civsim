# Battle Card-Bar Retrofit

Turn the existing bottom unit-card strip into a Total War-style card bar: one
card per player unit, **no scroll ever**, **fixed tall ~3:4 aspect**, **cards a
fixed size** (Total War behavior — they never resize to chase the roster; the bar
**wraps into more rows** as it grows and shrink-wraps to its cards), and each
portrait a **rendered shot of the 3D model** (baked offline as a PNG, not the
current flat 2D stick-figure). Live HP / cohesion / morale bars and the unit
count stay.

Reference look: `assets/reference-tw-cardbar.png`.

## Next Agent Prompt

**Status:** S1 + S2 implemented (fixed-size redesign per David's 2026-06-30
direction). Next: **Slice 3** (`slices/03-bake-thumbnails.md`). _Last updated:
2026-06-30._

**Pick up at Slice 4** (swap the card's placeholder `<canvas>` portrait for the
baked `<img>`). S1+S2 shipped the fixed-size Total-War card bar; S3 baked the
portrait PNGs; S6 added the min-window gate.

S4 pointers: portraits are at `web/public/assets/soldiers/cards/NN-name.png`
keyed by **look** (`manifest.json` maps look→file). Add `cardThumbUrl(look)` to
`classData.ts` reading that manifest (deferred from S3 to avoid a duplicate name
list), and in `UnitCards.build()` swap the `<canvas class="ucard-port">` for an
`<img>` (look = `modelLookForClass(cls)`), keeping the canvas as a 404 fallback.
Wait on `img.decode()` in the card scene before snapping.

S1+S2 detail — the fixed-size Total-War card bar:
- `web/src/battle/cardGrid.ts` — `computeCardGrid(count, boxW, {cardW, aspect, gap,
  maxRows})` → `{rows, cols, cardW, cardH, degenerate}`. Cards are a FIXED size;
  the bar wraps into more rows as the roster grows; cards shrink only past
  `maxRows × perRow` capacity. Headless `cardGrid.test.mjs` (8 cases, `npm --prefix
  web run test:ui`).
- `web/src/battle/unitCard.ts` (`UnitCards`) — `relayout()` computes the grid from
  the viewport width (`window.innerWidth − 24`) at the fixed `CARD_W = 72`, writes
  `--cols/--card-w/--card-h`, publishes `window.__cardGrid`, and reflows on window
  resize + build. `update()`'s keyed bar logic is untouched.
- CSS (both copies — `web/index.html` and the lab `installStyles`): the bar is a
  shrink-wrapping, centered, `overflow:hidden` grid of `box-sizing:border-box`
  cards. No flex/scroll rules remain.
- Lab route `/renderer/card-bar?count=N` + scene `web/scenes/ui/card-bar.mjs`
  (baselines `web/shots/ui/card-bar-{20,30,40}[-2x].png`).

**Constants** (David-approved direction; numeric values tunable at the S2 visual
checkpoint): `cardW = 72`, `aspect 3/4`, `gap 4`, `maxRows 3`. At a 1280px viewport
this gives 5→1×5, 20→2×10, 30→2×15, 40→3×14, same card size throughout.

S6 (min-window gate) is implemented: the bar reserves the minimap zone
(`MINIMAP_RESERVE = 210`/side) so it never collides with the bottom-right minimap,
and below `MIN_WINDOW_W/H = 1180×640` (`web/src/battle/viewportGate.ts`) the battle
shows a "window too small" placeholder (`#viewport-too-small`).

**Still open:**
- **S2 + S6 human visual checkpoint** — David to eyeball the real `?battle=5v5` and
  the lab 20/30/40 + the placeholder at the battle camera, and confirm/tune
  `cardW`/`maxRows`/`MINIMAP_RESERVE` and `MIN_WINDOW_W/H` + the placeholder copy.
- **Re-bless `battle-selection-dpr2`** (`web/scenes/battle/battle-renderer-visual.mjs`,
  GPU-gated): the live HUD frame's strip is now a fixed-size grid — re-bless with
  `VERIFY_GPU=1 UPDATE_SHOTS=1 node web/scene.mjs battle-renderer-visual` and eyeball
  the diff. (Other strip-bearing scenes assert card *counts*, not pixels, so they
  stay green.)

S3 (portrait bake) is independent of all the above and can proceed in parallel.
Do not skip ahead — Slice 4 needs Slice 3's PNGs.

**The single most important framing:** this is a *retrofit*, not a greenfield
build. A clickable, live-updating Total-War card strip **already ships** —
`web/src/battle/unitCard.ts` class `UnitCards`, instantiated by **both** the live
game (`web/src/battle/scene.ts:678`) and the lab wirings (`uiLayer.ts`
`BattleUiLayer`, used by `routeBattleUi`/`routeBattleLive`). Both call the same
`UnitCards.build()/update()`. **Put all new behavior inside that one shared class
plus a new `cardGrid.ts`** — then both wirings inherit the grid and the `<img>`
portrait for free, with zero merge risk. Do **not** rewrite `scene.ts`'s hot
loop to do this.

**Global TODO** (each item owned by a slice):
- [x] S1 — pure `cardGrid.ts` fixed-size grid math + headless `node --test` (`slices/01-grid-math.md`)
- [x] S2 — fixed-size no-scroll grid inside `UnitCards` + `/renderer/card-bar` lab harness + `web/scenes/ui/card-bar.mjs` (`slices/02-no-scroll-grid.md`) — _pending David's visual checkpoint + `battle-selection-dpr2` re-bless_
- [x] S3 — bake one 3:4 model-portrait PNG per look, dual-write + `--check` gate (`slices/03-bake-thumbnails.md`) — _first cut baked; pending David's framing checkpoint_
- [ ] S4 — swap card portrait `<canvas>` → `<img>`, canvas fallback retained (`slices/04-img-portrait.md`)
- [ ] S5 — _(optional, droppable)_ dedupe the two CSS copies + reconcile data path (`slices/05-cleanup-reconcile.md`)
- [x] S6 — min-window gate + "window too small" placeholder (`slices/06-min-window-gate.md`) — _new, David 2026-06-30; implemented, pending David's MIN_WINDOW value/copy checkpoint_

**Before you end your pass:** update this section — move the checkbox, set the
status line and date, record the next pickup point and any blocker.

## Context: what exists today

- **Vanilla TS + Vite, no framework.** WebGPU renderer (README says WebGL2 —
  stale). DOM UI overlays sit over a `<canvas id="battlefield">`.
- **`web/src/battle/unitCard.ts`** — `class UnitCards`:
  - `build(units: UnitCardInit[])` wipes `root.innerHTML` and creates one `.ucard`
    per unit: a `<canvas class="ucard-port">` filled by `drawPortrait()` (flat
    side-view), a name, a count, and three bars (`hp`/`coh`/`mor`). Portrait
    canvas is `W=38 × H=48`.
  - `update(states)` is a **keyed, bar-only refresh** (line 140 builds a diff key;
    skips unchanged). **Keep this verbatim** — it is the live wasm→bar path.
  - Cards already carry `look?: number`; faction is a CSS accent via `--fac`
    (player blue `#3a6cf0`, enemy crimson `#e03e34`) — **not** baked into pixels.
- **CSS lives in two near-duplicate places**, both with the scroll we must kill:
  - `web/index.html:74-108` — `#unitcards { display:flex; overflow-x:auto }`,
    `.ucard { flex:0 0 auto; width:44px }`, plus a `@media (max-width:760px)` rule
    and `::-webkit-scrollbar` rules (lines 85-86).
  - `apps/renderer-lab/src/router.ts` `installStyles()` (~3597) —
    `.renderer-unitcards .ucard { width:62px }`.
- **Units** read zero-copy from wasm as a packed `Float32Array`. Symbolic field
  offsets in `packages/game-renderer/src/battle/unitInfoLayout.ts` (`UNIT_INFO`:
  cohesion 4, team 6, total 7, stamina 8, classId 13, alive 15, morale 20,
  routing 21, renderLook 32). `scene.ts:688` reads these by **raw literal index**;
  `uiLayer.ts` `buildBattleUiModel()` reads them by symbolic name. Player filter:
  `team === 0`.
- **Class / look data:** `web/src/battle/classData.ts` (`CLASS_NAMES`, 15 real
  classes). `packages/game-renderer/src/models/shared/soldierModel.ts`:
  `REAL_UNIT_CLASS_COUNT = 15`, `MODEL_LOOK_COUNT = CLASS_LOOK.length` (16 — the
  extra is `SHOCK_CAV_SIDEARM_LOOK`), `modelLookForClass(cls)` maps class→look.
  **Bake and reference portraits by look index**, not raw class, so classes that
  share a look share one PNG.
- **Single-model render that already works:** `apps/renderer-lab/src/router.ts:970`
  `routeSkinnedSoldier()` boots **one** soldier via
  `generatedFormation(1, {classId, faction, frame})`, camera/class/clip/facing via
  URL params, signals `window.__rendererLabReady` + `window.__rendererLabStats`.
- **Offline bake machinery & the contract to follow:**
  `web/shots/models/scripts/soldier-sheets.mjs` drives `routeSkinnedSoldier` in
  Playwright with `captureSoldier()` + `cropPng()` + `montage()` + `snapCheck`.
  And `packages/soldier-assets/bake/soldier-placeholders.mjs` establishes the
  **dual-write + `--check` freshness gate** convention: it writes the asset to the
  package **and** the served `web/public/...` copy, and `--check` fails CI if the
  committed copy is stale (`web/package.json` `bake:test` runs it). The new
  portrait baker follows **this** contract.
- **Verification:** scenes are `.mjs` under `web/scenes/**`, run
  `npm run scene -- <name>` (note `web/scenes/ui/` already exists). Snapshots via
  `web/snapshot.mjs` `snapCheck(page, name, check, {threshold, maxDiffRatio, shot, baseDir})`,
  baselines in `web/shots/`, re-bless with `UPDATE_SHOTS=1`. Headless pure-logic
  tests use the repo's `*.test.mjs` + `node --test` convention (see
  `packages/soldier-assets/bake/vat.test.mjs`, `gltf.test.mjs`). Live globals:
  `window.__ready / __game / __cam`.

## Slice graph

```
S1 cardGrid.ts (pure math)         ── headless test, no DOM
   │
S2 no-scroll grid in UnitCards     ── needs S1; lab route /renderer/card-bar; canvas portraits still
   │   + /renderer/card-bar harness
   │
S3 bake portrait PNGs (per look)   ── independent of S1/S2; reuses skinned-soldier route
   │
S4 swap <canvas> → <img>           ── needs S3 (PNGs) + S2 (grid); canvas fallback on 404
   │
S5 cleanup: dedupe CSS, reconcile  ── OPTIONAL, droppable; pure refactor
   data path (scene.ts → buildBattleUiModel)

S6 min-window gate + placeholder   ── needs S2 (the bar's minimap reserve sets the
   "window too small" overlay         min width); battle-scoped DOM overlay
```

Portraits (S3/S4) and layout (S1/S2) are deliberately **decoupled**: a
thumbnail-bake problem can't block the no-scroll win, and vice-versa.

## The fixed-size grid algorithm (owned by S1)

**Cards are a FIXED size — Total War behavior, pinned by David (2026-06-30).** They
never resize to chase the roster; the bar instead **wraps into more rows** as it
grows, and **shrink-wraps to its cards** (centered) so a small roster is a few
fixed cards, not a few giant ones. Cards shrink below the fixed size *only* in the
extreme overflow case (more cards than `maxRows` can hold at full size), purely to
keep the no-scroll invariant — flagged `degenerate`.

Pure function `computeCardGrid(count, boxW, { cardW, aspect, gap, maxRows })`.
`cardW` is the **fixed** card width; `aspect = cardW/cardH = 3/4` (tall portrait).
`boxW` is the available width budget (viewport minus side margins). There is **no
`boxH`** — the bar is content-height (it grows with rows).

```
if count <= 0: return {rows:0, cols:0, cardW:0, cardH:0, degenerate:false}
cardH  = cardW / aspect
perRow = max(1, floor((boxW + gap) / (cardW + gap)))   // fixed cards that fit a row
rows   = min(maxRows, ceil(count / perRow))            // fewest rows that hold the roster
cols   = ceil(count / rows)                            // balance the rows: 20→10+10, not 16+4
needed = cols*cardW + gap*(cols+1)
if needed <= boxW: return floor({rows, cols, cardW, cardH}, degenerate:false)
shrunk = (boxW - gap*(cols+1)) / cols                  // overflow past maxRows: shrink, never scroll
return floor({rows, cols, cardW:shrunk, cardH:shrunk/aspect}, degenerate:true)
```

Generic in `count`. At a 1280px viewport (`boxW ≈ 1256`, 16 fixed 72px cards/row)
this gives 5→1×5, 20→2×10, 30→2×15, 40→3×14 — **the same card size throughout**,
only the row count changes. Beyond `maxRows × perRow` (≈48 cards) it shrinks rather
than scroll. **`cardW`, `gap`, and `maxRows` are tuning constants pinned at the S1
and S2 checkpoints, not guessed in code.** A live HTML prototype to tune them is at
`visualizations/grid-prototype.html`.

## Decisions taken (and the alternatives, for the human)

1. **Portrait source = baked offline PNG, not live render-to-texture.** Chosen by
   the user. There is no render-to-texture in `frameShell` today; adding it plus
   20-40 mini-passes/frame was the rejected alternative. Baked PNGs cost nothing
   at runtime and still track the model (regenerate the sheet). Trade-off: static
   (no facing/animation) and must re-bake when the model improves.
2. **All new behavior in the shared `UnitCards` leaf.** Both wirings already
   converge on that class, so the grid and `<img>` reach the live game and the lab
   for free. Rejected: migrating `scene.ts` onto `BattleUiLayer` (drags HUD /
   toolbar / camera-centering selection into scope).
3. **Data-path reconciliation is optional (S5), not part of the feature.**
   `scene.ts`'s raw-literal offset reads are a latent hazard, but rewriting the hot
   loop onto `buildBattleUiModel()` is churn with camera-centering side effects.
   Drafts split here; the safe call is to ship the feature without it and offer the
   cleanup as a reversible last slice. Genuine alternative recorded: do the
   migration if S5 proves clean.
4. **Bake per look (≤16 PNGs), faction stays a CSS accent.** Rejected: per
   class×faction (30 files) up front. The route accepts `team`, so faction-variant
   bakes are a documented follow-up if a neutral body reads as ambiguous side.
5. **Layout math in JS, painting in CSS (hybrid).** Pure CSS / container queries
   can't choose row count because the decision depends on **card count N**, which
   CSS can't see (`auto-fill` wraps but won't *balance* 10+10). JS writes
   `--cols/--card-w/--card-h`; CSS grid paints. The JS pass runs on window-resize +
   roster-change only, never per frame.
6. **Cards are a FIXED size; the bar wraps and shrink-wraps (David, 2026-06-30).**
   Supersedes the original "auto-stack when a row would shrink cards below a legible
   floor" plan, which let cards grow/shrink with the roster — that made a 5-unit
   army render as a few giant cards and a 40-unit army as tiny ones. Total War keeps
   one card size and adds rows instead. So `cardW` is an *input*, not an output; the
   bar shrink-wraps to `cols × cardW` (centered), so few units = a few fixed cards,
   not a wide empty band; cards shrink only past `maxRows × perRow` capacity to
   avoid a scroll. Rejected (the original plan): size-to-fit with a `minCardW`
   floor and a `boxH` height budget.

## Visual verification gates (standing, apply to S2, S3, S4)

Two complementary gates, both required on any slice that produces an on-screen
shot, montage, or screenshot — they answer different questions, so run both:

- **[compare-screenshots](../../.claude/skills/compare-screenshots/SKILL.md)** —
  the **fidelity-to-reference** gate. Put the slice's capture side-by-side with
  `assets/reference-tw-cardbar.png` (crop/zoom to the card strip) and judge how
  close it lands: card density, aspect, framing, bar placement, overall Total-War
  polish. This is the "does it match what David wants?" check, and the reference
  is the yardstick.
- **[screenshot-critique](../../.claude/skills/screenshot-critique/SKILL.md)** —
  the **unprimed second-opinion** gate. A fresh sub-agent with no context judges
  the shot on its own merits (legibility, scrollbars, collisions, "does this look
  right?") — catching what the reference comparison and your own primed eye miss.

Run compare-screenshots first (am I close to the target?), then screenshot-critique
last (is it actually good?). Both are written as explicit steps in each visual
slice; neither is optional.

## Scope firewall — do NOT touch

- `crates/**` (sim/wasm), `packages/game-renderer/src/battle/unitInfoLayout.ts`
  offsets, `soldierModel.ts` geometry (read `modelLookForClass`/`MODEL_LOOK_COUNT`
  only), the VAT bake, the WebGPU passes / terrain / minimap.
- `UnitCards.update()`'s keyed per-frame bar logic — keep verbatim.
- The `/renderer/skinned-soldier` route and `soldier-sheets.mjs` — the portrait
  baker reuses them read-only.

## Risks & known unknowns

- **Band height vs toolbar overlap.** The bar is content-height, so it grows with
  rows — a 3-row stack (40+ units) is ~300px tall above `#toolbar` (bottom:56px).
  `maxRows` caps it; `overflow:hidden` and the dpr-2 snapshot guard collisions. If
  a full 3-row stack eats too much battlefield, lower `maxRows` or `cardW`.
- **Snapshot re-bless churn.** S2 and S4 move pixels in the live HUD frame
  (`battle-selection-dpr2`) and the lab UI scenes. Re-bless is *expected* there —
  called out per slice so a real regression isn't waved through with a blind
  `UPDATE_SHOTS=1`.
- **`<img>` decode flake.** Card scenes must wait on
  `[...document.images].every(i => i.complete)` / `img.decode()` before snapping.
- **Aesthetic constants are judgment calls** — `cardW`, `maxRows`, exact 3:4 vs a
  hair different, and the portrait camera pitch/stance/zoom — pinned by David at the
  S2 and S3 checkpoints, not chosen in code review.
- **Unknown:** whether a faction-neutral portrait reads as the right side at small
  card size, or needs team-variant bakes (deferred).
