# HUD Housings — three bronze cards across the bottom

Rework the battle HUD from four independently-mounted islands into **one React
tree** rendering **three distinct bronze housings** anchored to the bottom of the
screen, matching the Total War Saga: Troy look in
`assets/reference-tw-cardbar.png`:

- **Bottom-left card** — the unit stat / info panel (moved down from the current
  top-left `#hud`). When nothing is selected it shows an **army-roster summary**
  so it is never empty.
- **Bottom-center card** — the unit-card grid **and** the order/time toolbar,
  merged into **one housing** (card wells on top, control strip below).
- **Bottom-right card** — the minimap, in its own bronze frame.

Every icon-only button gets a **custom bronze tooltip** (a diegetic chip on
hover/focus), replacing the native `title=` bubble.

This supersedes the *layout* decisions in the shipped `specs/card-bar/` and
`specs/battle-ui/` (which this reuses for the bronze material + aesthetic
contract); it does not change the card-grid math or the sim.

---

## Next Agent Prompt

**Status:** Slices 01–02 shipped. Last updated 2026-07-01.

**Start here:** Slice `03-left-info-card`. Read it, then the firewalls section
below, then build. Each slice leaves the battle playable and screenshot-able; do
not start a later slice until the current one's gate passes.

**What slice 02 landed:** the shared `.hud-chassis` housing class lives in
`web/src/ui/theme/bronze.css` (material only: border style/color, radius,
`--bronze-fill/-edge`, `--bronze-frame`; each surface keeps its own border-width /
position / size). `#hud`, `#toolbar`, `#minimap` now carry `className="hud-chassis"`
(set in `BattleHud.tsx`) and their id rules in `index.html` dropped the duplicated
recipe. Verified pixel-identical (0 px differ on all battle + card-bar snapshots,
no re-bless).

**Reconciliation (deviation from slice 02's original text):** the plan wanted a
`<Chassis>` React component and a wholesale move of the four surfaces' CSS out of
`index.html`. Two findings changed that:
- `/renderer/*` is the **same web SPA** (`main.ts` dynamically imports the lab
  router into `index.html`), so the renderer-lab route loads `index.html`'s inline
  `<style>` — including `.ucard`/`#unitcards`. Moving those into a `BattleHud`-only
  stylesheet would break `card-bar.mjs` (the lab route never imports `BattleHud`).
  So `#unitcards`/`.ucard` stay in `index.html`; the shared class went to the
  globally-linked `bronze.css` instead (both routes load it).
- A `<Chassis>` wrapper component would add a DOM node and change layout; the real
  reusable primitive is the **CSS class**, which the new cards apply directly. No
  component was created. This matches the `bronze.css` header's own anticipation
  of a `.chassis` class.
- The ornate `--tray` variant (for the center card) is deferred to slice 05, where
  it is first needed.
- Pre-existing dead CSS noticed but left alone: `#help` (index.html ~118) has a
  rule but no element. Out of scope; flag for a future cleanup.

**What slice 01 landed (`web/src/ui/hud/BattleHud.tsx`):** one React root
(`mountBattleHud`) composing `<LeftInfoCard>` (`#hud`), `<CardsHost>`
(`#unitcards`), `<ToolbarHost>` (`#toolbar`), and the `#minimap` `<canvas>`. The
three old `createRoot` calls and the imperative canvas grab in `scene.ts` are
gone; scene drives the HUD through `BattleHudHandle` (`setInfo`/`setToolbar`
flushSync ≤5 Hz, `buildCards` flushSync, `cards.update` imperative 60 Hz,
`minimapCanvas` ref). The card leaf is extracted to `UnitCardsView.tsx` (shared by
`BattleHud` and the `UnitCardsReact` class, which still backs the renderer-lab);
its grid host is now a `rootRef` (RefObject) rather than a resolved element. The
`game.victor()` game-over check moved out of `updateHud` into `checkGameover()` in
the frame loop. Verified: `battle-selection-dpr2`, `battle-minimap-world-dpr2`,
`battle-initial`, `battle-banner`, `battle-manual` all **0 px differ (no
re-bless)**; `card-bar` lab green; tsc/lint/vitest/`test:ui` green.

**Architecture decision (deviation from slice text — carry into slice 02):**
slice 01 did **not** move the `#hud`/`#toolbar`/`#unitcards`/`#minimap` CSS out of
`index.html`. `<BattleHud>` renders elements with the same ids, so the existing
id-based CSS applies unchanged and pixel-identity is airtight with a minimal review
surface. **Moving that inline CSS into a co-located stylesheet is folded into slice
02** (where `<Chassis>` extraction touches the chrome anyway). index.html still
carries the four id rules plus the new `#battle-hud` mount container.

**Pickup rules:**
- Work in the worktree `/Users/homeserver/dev/civsim/.claude/worktrees/card-bar`;
  the frontend is under `web/`.
- **Slices 01 and 02 must re-bless NOTHING** — they are pure refactors whose
  correctness proof is that every existing baseline stays byte-identical. If a
  baseline shifts, the refactor leaked a change; fix it, don't bless it.
- From slice 03 on, re-blessing `battle-selection-dpr2` etc. is *expected* — but
  every re-bless is a **reviewed** visual diff, never a blind `UPDATE_SHOTS=1`.
- GPU battle shots must run **headful on hardware** (WebGPU has no headless
  adapter here — see the `gpu-render-needs-headful` memory). The pure-layout
  card-bar lab gate (`web/scenes/ui/card-bar.mjs`) is headless-friendly.
- Every slice that produces a shot ends with an unprimed **screenshot-critique**
  pass. Every slice with a target image (the reference, or the prior look it
  changes) also runs **compare-screenshots** for a less-wrong verdict.
- Update this section (status, pickup point, TODO ticks) before ending your pass.

**Global TODO:**
- [x] 01 — Single-root `<BattleHud>` (foundation, pixel-identical) — shipped
- [x] 02 — Shared `.hud-chassis` primitive in bronze.css; deduped #hud/#toolbar/
      #minimap onto it (pixel-identical) — shipped. `<Chassis>` component and the
      wholesale CSS move dropped as unsafe/low-value (see handoff notes).
- [ ] 03 — Left info card → bottom-left corner
- [ ] 04 — Army-roster idle state; drop debug header; FPS → bare top-left
- [ ] 05 — Merge toolbar into the center card housing
- [ ] 06 — Minimap → bottom-right corner housing
- [ ] 07 — Asymmetric reserve + flush-corner placement (load-bearing math)
- [ ] 08 — Bronze tooltip chips on icon-only buttons
- [ ] 09 — Fidelity pass vs reference + close-spec

---

## Context — the code as it is today (verified)

The **production** battle HUD is `web/index.html` (a large inline `<style>` block
+ container divs inside `#battle-ui`, line ~1119) with React mounted into those
divs by `web/src/battle/scene.ts`. It is **four independently-mounted islands**:

| Surface | Element (index.html) | Position today | Owner |
|---|---|---|---|
| Unit stat panel | `#hud` (:1124) | `fixed top:12 left:12`, min-w 234 / max-w 282 | React root `scene.ts:1118` (`HudPanel.tsx`), ≤5 Hz |
| Minimap | `<canvas #minimap 240×160>` (:1133) | `fixed right:12 bottom:170` | Imperative canvas, `scene.ts:241-355`, ≤5 Hz |
| Card grid | `#unitcards` (:1135) | `fixed bottom:52`, centered CSS grid | `UnitCardsReact` (own `createRoot`), `scene.ts:816` |
| Toolbar | `#toolbar` (:1137) | `fixed bottom:10`, centered pill | React root `scene.ts:446` (`Toolbar.tsx`), ≤5 Hz |

Also inside `#battle-ui`: `#gameover` (root `scene.ts:525`) and `#pausemenu`
(root `scene.ts:1035`) — **modal roots, out of scope**, leave them alone.
`#ui-root` (:1145) is a separate `pointer-events:none` overlay. The single
`<BattleHud>` root mounts into a **new dedicated child of `#battle-ui`**
(e.g. `#battle-hud`), so the modal roots are untouched.

**`web/src/battle/uiLayer.ts` `BattleUiLayer` (classes `renderer-battle-*`) is the
renderer-lab harness, NOT production.** It shares `UnitCardsReact`,
`applyCardGrid`, and `unitCard.ts` with the game, and `web/scenes/ui/card-bar.mjs`
drives the *lab* route — so any change to `applyCardGrid`/`MINIMAP_RESERVE` ripples
to both, and the `UnitCardsReact` class must keep working. Extract the shared card
leaf; do not delete the class.

**Design tokens:** `web/src/ui/theme/bronze.css` (`--bronze-fill/-edge/-frame/-ink`,
`--well-*`). The four housings each repeat the same recipe inline
(`border … transparent; background: var(--bronze-fill) padding-box,
var(--bronze-edge) border-box; box-shadow: var(--bronze-frame)`); `#unitcards`
adds a richer 6-layer riveted/brushed-grain frame (index.html ~278-325). No
`.chassis` class exists yet — the bronze.css comment anticipating one is
aspirational. Fonts: Cinzel (headings), ui-monospace (stats).
`FACTION_CSS` in `unitCard.ts`.

**Grid budget:** `applyCardGrid(root, count, sideReserve)` (`unitCard.ts:61`)
sets `boxW = window.innerWidth − 2*sideReserve`, `sideReserve = MINIMAP_RESERVE =
210` — a *symmetric* margin whose only job today is clearing the bottom-right
minimap while the bar stays screen-centered. `viewportGate.ts` `MIN_WINDOW_W =
1180` is derived from `2×MINIMAP_RESERVE`. Both change in slice 07.

**Verification harness:** scenes are `.mjs` under `web/scenes/**`, run via
`bun run --cwd web scene -- <name>` (`web/scene.mjs` + `web/snapshot.mjs`
`snapCheck`), baselines in `web/shots/`, re-bless with `UPDATE_SHOTS=1`. Key gates:
- `web/scenes/ui/card-bar.mjs` — lab route `/renderer/card-bar?count=N`, asserts
  `window.__cardGrid` rows/cols/cardW, no-scroll, fixed card size. **Headless OK.**
  Baselines `shots/ui/card-bar-{20,30,40}[-2x].png`, `card-bar-too-small.png`.
- `web/scenes/battle/battle-renderer-visual.mjs` → `battle-selection-dpr2`
  (full composed HUD, GPU, headful) — moving HUD pixels re-blesses this.
- `web/scenes/battle/battle-minimap.mjs` → minimap rect + `darkHud` band.
- `web/scenes/battle/battle-smoke.mjs` → `battle-initial`.
- `web/scenes/battle/battle-selection.mjs` → click/drag-box behavior (no snap).
- Headless `web/src/battle/cardGrid.test.mjs` (`bun run --cwd web test:ui`).

---

## Slice graph

```
01  single-root <BattleHud>            ── FOUNDATION; pixel-identical; NO re-bless
      │                                   (collapse 3 roots + minimap canvas → 1 root)
02  extract <Chassis> primitive        ── dedupe 4 housings; pixel-identical; NO re-bless
      │
03  LeftInfoCard → bottom-left corner  ── 1 var: reposition #hud (top-left empties)
      │
04  army-roster idle state             ── 1 var: content when nothing selected
      │
05  merge Toolbar into CenterCard      ── 1 var: control strip inside the housing (60Hz test)
      │
06  RightMinimapCard → bottom-right    ── 1 var: reframe + reposition minimap
      │
07  asymmetric reserve + flush corners ── LOAD-BEARING grid math; both flanks now exist
      │
08  bronze <Tooltip> chips             ── 1 var: icon-button tooltip appearance
      │
09  fidelity pass vs reference + close-spec
```

Each visual slice moves exactly one variable and leaves all three surfaces
rendering and the battle controllable — never a half-moved state that breaks the
view. Slice 03 carries a minimal interim reserve bump (mechanical, not a visual
variable) so the wider left card never collides with the center before slice 07
formalizes the asymmetric budget.

## Review map

- **01, 02** — code review only (no visual diff; baselines must not move).
- **03, 04, 05, 06, 08** — each opens a shot for a **non-blocking** ~5 min human
  checkpoint via `preview-shots`, then decides on the evidence and records it.
- **07** — load-bearing math: headless `cardGrid.test.mjs` + `card-bar.mjs` lab
  gate carry the correctness; the flush-corner *look* is the visual checkpoint.
- **09** — blocking on the aesthetic contract (`compare-screenshots` vs the
  reference, then `screenshot-critique`), then `close-spec`.

## Contracts / firewalls (must NOT break)

1. **60 Hz card paint stays imperative.** `applyCardVisual`/`cardStateKey`
   (`unitCard.ts`) write HP/coh/mor/count straight to ref'd DOM nodes via the
   `UnitCardsHandle`; React render never runs at 60 Hz. Never route a per-frame
   value through React state. The `?measurecards` self-time
   (`window.__cardUpdateSamples`, `scene.ts:~860`) must stay Δ≈0 — tested hardest
   at slice 05 (toolbar moving into the card subtree).
2. **5 Hz HUD/toolbar re-renders must not reconcile the card subtree.** Memoize
   the card grid on a stable roster identity (`React.memo`) so `setInfo`/
   `setToolbar` never rebuild the card DOM and wipe the imperatively-written bars.
3. **Minimap stays a `<canvas 240×160>`** that `scene.ts` draws into; React only
   declares the element and hands over the ref. `worldToMini`, the `miniBack`
   tint cache, and click-to-recenter depend on 240×160 — do not resize it.
4. **The `UnitCardsReact` class + lab path stay working** (`uiLayer.ts`, the
   `/renderer/card-bar` route, `card-bar.mjs`). Extract the shared card-grid leaf;
   keep `window.__cardGrid` published.
5. **No `crates/**`, `unitInfoLayout.ts` offsets, `soldierModel.ts`, or WebGPU
   pass changes.** scene.ts reads unit fields by raw literal index — keep verbatim.
6. **Modal roots `#gameover` / `#pausemenu` are out of scope** — untouched by the
   collapse.

## Decided (David, 2026-07-01)

- **Debug header → dropped.** The `#hud` header line (currently
  `fps N   tick X ms   … units`, built in `updateHud` `scene.ts:~1410`) goes away.
- **FPS survives as bare non-diegetic telemetry.** Keep the existing `fpsAvg`
  (`scene.ts:1133-1139`) shown as **subtle, low-contrast text in the top-left, on a
  transparent background, with no label and no bronze chrome**. This is a dev
  readout, **not** HUD chrome — the `aesthetics` "no transparency" rule governs
  diegetic panels and does **not** apply here. Do not wrap it in a housing or call
  it out; do not let a future cleanup "fix" its transparency. (Handled in slice 04.)
- **UI primitives: Radix/shadcn sanctioned.** Use Radix primitives (and shadcn
  where a component set helps) for HUD React controls — starting with the tooltip
  (slice 08) — **but always re-skinned to the bronze tokens.** shadcn's default
  slate/rounded look is the exact "webapp tell" the `aesthetics` skill forbids;
  adopt the primitive's behavior + accessibility, supply our own bronze styling.
  Radix Tooltip also gives free upward/collision-aware placement (`side="top"`),
  which the bottom-anchored buttons need. This latitude extends to other HUD
  surfaces where a Radix primitive fits (dropdowns, popovers), same skinning rule.

## Known unknowns (David checkpoints — do not guess in code)

- **Center housing shape:** shrink-wrap-to-cards centered *in the gap* (preserves
  fixed-card wrapping, recommended) vs a continuous gap-filling bar (reads closer
  to the reference). Pin at the slice 07 checkpoint.
- **Fixed corner-card widths** feeding the asymmetric reserve — pin at slice 07.
- **General-medallion look** for the left card portrait (round crop of a baked
  look vs the current square thumb) — cosmetic, slice 09.
