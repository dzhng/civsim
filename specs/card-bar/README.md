# Battle Card-Bar Retrofit

Turn the existing bottom unit-card strip into a Total War-style card bar: one
card per player unit, **no scroll ever**, **fixed tall ~3:4 aspect**, cards
**auto-stack into rows** when a single row would shrink them below a legible
size, and each portrait a **rendered shot of the 3D model** (baked offline as a
PNG, not the current flat 2D stick-figure). Live HP / cohesion / morale bars and
the unit count stay.

Reference look: `assets/reference-tw-cardbar.png`.

## Next Agent Prompt

**Status:** planned, not started. _Last updated: 2026-06-30._

**You are picking up a fresh feature.** Start at **Slice 1** (`slices/01-grid-math.md`)
and go in order. Each slice leaves a runnable artifact and a verification gate
before the next depends on it. Do not skip ahead — Slice 2 needs Slice 1's
function, Slice 4 needs Slice 3's PNGs.

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
- [ ] S1 — pure `cardGrid.ts` no-scroll grid math + headless `node --test` (`slices/01-grid-math.md`)
- [ ] S2 — no-scroll fixed-aspect grid inside `UnitCards` + `/renderer/card-bar` lab harness + `web/scenes/ui/card-bar.mjs` (`slices/02-no-scroll-grid.md`)
- [ ] S3 — bake one 3:4 model-portrait PNG per look, dual-write + `--check` gate (`slices/03-bake-thumbnails.md`)
- [ ] S4 — swap card portrait `<canvas>` → `<img>`, canvas fallback retained (`slices/04-img-portrait.md`)
- [ ] S5 — _(optional, droppable)_ dedupe the two CSS copies + reconcile data path (`slices/05-cleanup-reconcile.md`)

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
```

Portraits (S3/S4) and layout (S1/S2) are deliberately **decoupled**: a
thumbnail-bake problem can't block the no-scroll win, and vice-versa.

## The no-scroll grid algorithm (owned by S1)

Pure function `computeCardGrid({ count, boxW, boxH, aspect, minCardW, gap, maxRows })`.
`aspect = cardW/cardH = 3/4` (tall portrait). Prefer the **fewest rows** that keep
each card ≥ `minCardW`; honor **both** the width budget and the band-height budget
so cards never overflow and never scroll; fill row-major.

```
if count <= 0: return {rows:0, cols:0, cardW:0, cardH:0}
best = null
for rows in 1 .. min(count, maxRows):
  cols    = ceil(count / rows)                       // balanced: 20→10, 30→15, 40→20
  wPerCol = (boxW - gap*(cols+1)) / cols
  hPerRow = (boxH - gap*(rows+1)) / rows
  cardW   = min(wPerCol, hPerRow * aspect)           // satisfy width AND band height at fixed aspect
  cand    = {rows, cols, cardW, cardH: cardW/aspect}
  if cardW >= minCardW: return floor(cand)           // fewest legible rows — done
  best = (best==null || cardW > best.cardW) ? cand : best
return floor(best)                                   // none reached minCardW: most-legible, still no scroll
```

Generic in `count` by construction — nothing hardcoded to 20. At a normal ~1280px
bottom band this gives 20→2×10, 30→2×15, 40→2×20, 5→1×5, and degrades gracefully
(undersized but never scrolling) past the band's capacity. **`minCardW`, `gap`,
`maxRows`, and the band height are tuning constants pinned by review at the S1 and
S2 checkpoints, not guessed in code.** A live HTML prototype to tune them is at
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
   CSS can't see (`auto-fill` wraps but won't *balance* 10+10 or respect a height
   budget). JS writes `--cols/--card-w/--card-h`; CSS grid + `aspect-ratio` paints.
   The JS pass runs on resize + roster-change only (`ResizeObserver`), never per
   frame.

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

- **Band height vs toolbar overlap.** `#unitcards` sits above `#toolbar`; a 2-row
  stack must not collide. Fix a bounded band height fed in as `boxH`, set
  `overflow:hidden`, and let the dpr-2 snapshot catch collisions.
- **Wide snapshot re-bless churn.** S2 and S4 each move pixels in
  `battle-selection` and the lab UI scenes. Re-bless is *expected* there — call it
  out per slice so a real regression isn't waved through with a blind
  `UPDATE_SHOTS=1`.
- **`<img>` decode flake.** Card scenes must wait on
  `[...document.images].every(i => i.complete)` / `img.decode()` before snapping.
- **Aesthetic constants are judgment calls** — `minCardW`, `maxRows`, band height,
  exact 3:4 vs a hair different, and the portrait camera pitch/stance/zoom — pinned
  by David at the S1 and S3 checkpoints, not chosen in code review.
- **Unknown:** whether a faction-neutral portrait reads as the right side at small
  card size, or needs team-variant bakes (deferred).
