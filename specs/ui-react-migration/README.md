# UI architecture: migrate the web DOM UI to React + Vite + Tailwind

Move civsim's hand-rolled vanilla-TS DOM UI to **React + Vite + Tailwind v4**, so the
growing interactive surfaces (army builder, campaign panels, future diplomacy/management
screens) get a real component+state model — **without** regressing the per-frame in-battle
HUD, which is renderer-bound and hand-optimized today. The end state is React for the
**static** UI; the **per-frame HUD** is migrated only if a measured perf spike says it's free.

Synthesized from three independent draft plans (they converged hard — the cut is solid).

## Next Agent Prompt

**Status:** S0 + S1 + S2 + S3 shipped (green). **S3 verdict: MIGRATE (Branch A).** _Last updated: 2026-07-01._

**Start at: finish S4 battle modals (S4b)** OR **Slice 5** (`slices/05-campaign-panels.md`).
S4a (the army builder) is shipped; the remaining S4 piece is the in-battle modals
(pause/result; the field manual is already a React-toggled overlay). The static wave can
proceed in parallel; S3 settled the 60 Hz seam. S6 (HUD outcome) runs **Branch A — MIGRATE**.
S0–S3 done.

**S4a decisions recorded (army builder → React):**
- `web/src/ui/menu/ArmyBuilder.tsx` (view) + `armyBuilderState.ts` (pure reducer, **node-tested**
  byte-identical output — `armyBuilderState.test.mjs`, 6 tests). The reducer keeps a real `Map`
  per side so picks come out in INSERTION order (template-first, then click-added), matching the
  old builder exactly; a numeric-keyed object would resort integer keys. Catalog imported
  type-only there so node can run the test (the catalog's deep extensionless imports won't load
  under node).
- Deleted vanilla `quickBattleSetup.ts`. Moved its `QuickBattleClassSpec` / `QuickBattleConfig`
  types to `quickBattleCatalog.ts` (data home); updated `main.ts` import.
- `Menu` owns `qbOpen` state; Custom Battle opens `<ArmyBuilder>`. **The builder modal is a
  SIBLING of `#menu-ui`, not a child** — inside `#menu-ui` the `#menu-ui button` rule (spec
  0,1,1) bloated the `.qb-step`/`.qb-template` buttons (class spec 0,1,0) and broke the layout
  (18.9% diff → 0.02% once moved out, matching how it was body-level before). Modal gets
  `pointer-events:auto` (it's a child of the click-through `#ui-root`).
- `MenuScene.enter()` now `flushSync`-renders the menu so the DOM exists synchronously when the
  boot/verify harnesses read it (the heavier ArmyBuilder lost the async-commit race S2 won).
- `menu-renderer-shell` overfill check reads `qb-launch.disabled` **after** a `waitForFunction`
  (React batches the dispatched clicks) — same assertion, async-aware timing.

**S4a verification (green):** `tsc` ✓, `build` ✓, `test:ui` 14/14 (8 cardGrid + 6 reducer) ✓,
`menu-renderer-shell` functional fully passes (maps/rows/validation/overfill/launch + duel + 5v5
+ campaign launch through the React builder) ✓, `menu-quick-battle-modal` snapshot **0.018%**
(no re-bless — pixel-equivalent to the vanilla baseline) ✓, other menu snaps + `battle` +
`card-bar` 0.0000% ✓.

**★ S3 SPIKE VERDICT — MIGRATE (Branch A). The whole migration's load-bearing measurement.**
Isolated card-update self-time, sim RUNNING, `?map=A` live battle (20 player cards / 40 units /
~320 frames), two runs, headful hardware GPU:
| bar | median | p95 | p99 | max |
|---|---|---|---|---|
| vanilla | 0.010ms | 0.035–0.040ms | 0.045ms | 0.055ms |
| React | 0.010ms | 0.040ms | 0.045ms | 0.055ms |

**Δmedian = 0.000ms (gate ≤ 0.30), Δp95 = 0.000–0.005ms (gate ≤ 0.50) → PASS by a huge margin.**
Frame counts identical (320 vs 320) → **no fps regression** (end-to-end guard met). Both bars sit
at the `performance.now()` resolution floor — the card update is too cheap to even measure a
difference. **Why it's free:** S3 extracted the hot-path logic (`cardStateKey` + `applyCardVisual`
+ `applyCardGrid`) into `unitCard.ts` as the ONE source both bars call, and React's render/commit
**never runs at 60Hz** — the imperative handle writes straight to ref'd nodes. So the hot path is
literally the same code. **S6 migrates the HUD to React.**

**S3 decisions recorded (read before S6):**
- `web/src/ui/hud/UnitCardsReact.tsx` — structure in React (rebuilt only on roster change via
  `build()`/flushSync), 60Hz `update()` via `useImperativeHandle` writing to ref'd nodes through
  the shared helpers. Drop-in for vanilla `UnitCards` (same `build`/`update` surface). `applyCardGrid`
  runs in `useLayoutEffect` (not passive) so the grid is set synchronously like vanilla.
- Flags: `?hud=react` (BattleScene swaps the bar at the same rAF call site, **default stays
  vanilla**), `?react` (lab `/renderer/card-bar` route — lets the DOM-only gate validate it),
  `?measurecards` (records per-frame self-time into `window.__cardUpdateSamples`, zero overhead off).
- **Visual gate met:** React card bar passes the harness `snapCheck` (pixelmatch@0.12) at
  **0 px / 0.00000** for count 20/30/40 both DPR — byte-identical box/layout. (A raw delta≥1 count
  shows a faint DPR1 AA shimmer at 3 rows, but it's all below the perceptual threshold the gate uses.)
- The measurement was a throwaway script (per spec: "a measurement, not a baseline"), not a
  committed scene. To re-run: boot `?map=A&measurecards[&hud=react]`, read `window.__cardUpdateSamples`.

**S3 verification (green):** `tsc` ✓, `build` ✓, `cardGrid` 8/8 ✓, `card-bar` (headless, vanilla
default) 0.0000% ✓, `battle-renderer-visual` + `menu-renderer-shell-visual` (headful) 0.0000% ✓,
React card bar snapCheck 0 px ✓, perf A/B PASS (×2). Default path unchanged (instrumentation gated).

**S2 decisions recorded (read before S3):**
- **The menu (`#menu-ui` + duel modal) is React** — `web/src/ui/menu/Menu.tsx`, mounted into
  `#ui-root` by `MenuScene` (createRoot on enter, unmount on exit). `MenuConfig` and main.ts
  wiring are unchanged. Renders **byte-identical DOM** (same ids/classes) so the existing bronze
  menu CSS in index.html still styles it — **menu uses the existing bronze CSS, NOT Tailwind
  utilities**, so the `@theme` bridge + preflight decision stay deferred (no React surface needs
  a utility yet; revisit when one does, likely S4 army builder).
- **Army builder stays vanilla** — `#quick-battle-modal` was relocated from inside `#menu-ui`
  to **body level** (it's `position:fixed`), still driven by `mountQuickBattleSetup(document.body,
  …)`. React's Custom Battle button calls `quickBattle.open()`. Zero React/vanilla DOM conflict.
- **`#ui-root` z-index is 20** (was 50), mirroring the old `#menu-ui`, so the body-level
  `#quick-battle-modal` (z-40) and `#manual` (z-50) layer **above** the React menu exactly as
  before. (Setting it to 50 hid those overlays behind the menu and ate their clicks — caught by
  the functional `menu-renderer-shell` scene, not the visual one.)
- **S0 canary deleted** (`root.tsx`/`Canary.tsx` removed, its `<script>` gone) — MenuScene now
  owns `#ui-root`. `tailwind.css` import moved to `menu/scene.ts` so Tailwind stays in the bundle.
- Duel modal focuses `#duel-a` on open (matches the old `selA.focus()` → identical focus ring).
- **New baseline `menu-quick-battle-modal`** added (the vanilla army builder open) — S4's gate
  to preserve when it migrates the builder.

**S2 verification (green):** `tsc` ✓, `build` ✓, `cardGrid` 8/8 ✓, `menu-renderer-shell-visual`
4 snaps (ready/unsupported/duel/quick-battle, headful) **0.0000%** (3 existing no-re-bless, 1 new
blessed) ✓, **`menu-renderer-shell` functional flow fully passes** — duel + 5v5 + campaign all
launch through the React menu, manual opens, Escape closes, GPU-off disables ✓,
`battle-renderer-visual` 0.0000% ✓, `card-bar` (headless) 0.0000% ✓. The 3 prior menu snaps are
byte-identical to the vanilla baseline, so the screenshot-critique/compare gate is self-justified
(zero pixels changed); the army-builder baseline is unchanged pre-existing vanilla content.

**S0 decisions recorded (read before S1):**
- **Tailwind = utilities + theme only, NO preflight** (`web/src/ui/tailwind.css` imports the
  v4 sublayers, not `@import "tailwindcss"`). Preflight is a global CSS reset that would move
  every baseline; **adopting/scoping preflight is an S1 decision**, made against the gates.
- **React mounts via a 2nd Vite entry** (`web/src/ui/root.tsx`) into `#ui-root` — a fixed,
  click-through, `z-50` sibling of the canvas added to `index.html`. `main.ts` untouched.
- **Canary is flag-gated** (`?canary`) so scenes see nothing → zero baseline drift. It renders
  `null` on normal load. **S2 deletes the canary** when the real menu mounts here.
- `web/src/vite-env.d.ts` added (`vite/client` types) so `tsc` accepts `*.css` side-effect
  imports.
- **`web/node_modules` was a symlink; `npm install` replaced it with a real dir.** Everything
  resolves (vite/playwright/pngjs/wasm intact, all gates green) — just note it if another
  worktree expected the shared store.
- Versions: react/react-dom 19.2, @vitejs/plugin-react 6.0, tailwindcss + @tailwindcss/vite 4.3.

**S0 verification (all green, no re-bless):** `tsc --noEmit` ✓, `vite build` ✓ (105 modules),
`crossOriginIsolated === true` ✓ (plugins did not strip COOP/COEP), `card-bar` 0.0000% ✓,
`battle-renderer-visual` (`battle-selection-dpr2`) 0.0000% ✓, `menu-renderer-shell-visual`
(3 snaps) 0.0000% ✓, `cardGrid.test.mjs` 8/8 ✓, no page errors. Headful hardware flags used
for GPU scenes. **S0 human checkpoint:** nothing visual moved (canary off by default), so there
were no shots to review — proceeded on the green gates per the non-blocking rule.

**S1 decisions recorded (read before S2):**
- **bronze.css ships the `:root` token VALUES only** (not the chassis component classes).
  `#toolbar` and `#unitcards` in index.html were re-typing the fill/edge gradients + frame
  shadow as literals (3 copies total with :root); they now reference `var(--bronze-*)`. One
  source for the values. The inline `:root` is deleted; bronze.css is a render-blocking
  `<link>` in `<head>` before the inline `<style>`.
- **DEVIATION from the slice as written — `.chassis` / `.chassis-tray` classes + the Tailwind
  `@theme` bridge are deferred to S2** (the first React consumer that needs a class to apply).
  Moving the chassis onto a class in S1 is **not pixel-safe**: the renderer-lab card-bar band
  carries a duplicate `id="unitcards"` and leans on index.html's `#unitcards` *id-rule*
  background (id specificity 100 beats the lab's own `.renderer-unitcards` class 10). Stripping
  the id-rule background to a class the band lacks shifts the lab render. The lab dedup is S7's
  job; until then S1 keeps the id rules painting. S2 adds the classes when React applies them.
- **Capture-profile gotcha (cost me a detour, noted so the next agent skips it):** the
  DOM-only `card-bar` scene is blessed **headless** (default chromium). Running it under the
  GPU headful Chrome-stable flags (`VERIFY_HEADFUL=1 VERIFY_BROWSER_CHANNEL=chrome`) rasterizes
  fonts/AA differently and shows a tolerated ~0.7% (byte-diff confirmed 0 changed pixels — it's
  the browser channel, not the render). **Gate `card-bar` headless; gate the GPU scenes
  (battle/menu/campaign) headful.** Each is 0.0000% under its own profile.

**S1 verification (all green, no re-bless):** `tsc` ✓, `vite build` ✓, `cardGrid.test.mjs` 8/8 ✓,
`card-bar` (7 snaps, **headless**) 0.0000% ✓, `battle-renderer-visual` (`battle-selection-dpr2`,
headful) 0.0000% ✓, `menu-renderer-shell-visual` (3 snaps, headful) 0.0000% ✓. **S1 human
checkpoint:** the (0,0) pass is self-justifying (no pixels moved); proceeded on the green gates.

**Global TODO:**
- [x] S0 — stack setup: React + Vite plugin + Tailwind v4 in `web/`, COOP/COEP preserved, `tsc --noEmit` gate (`slices/00-stack-setup.md`) — **shipped**
- [x] S1 — one bronze token source (`web/src/ui/theme/bronze.css`): `:root` tokens consumed by vanilla index.html; chassis classes + `@theme` deferred to S2; **zero pixel change** (`slices/01-design-system.md`) — **shipped**
- [x] S2 — menu proof: `#menu-ui` + duel modal are React (`web/src/ui/menu/Menu.tsx`) into `#ui-root`; army builder stays vanilla; new `menu-quick-battle-modal` baseline (`slices/02-menu-proof.md`) — **shipped**
- [x] S3 — **HUD perf SPIKE** → **VERDICT: MIGRATE.** React card bar (`UnitCardsReact`) measured Δmedian 0.0ms / Δp95 0.0ms vs vanilla; shared hot-path helpers in `unitCard.ts`; S6 = Branch A (`slices/03-hud-perf-spike.md`) — **shipped**
- [ ] S4 — static wave: army builder + battle modals (`slices/04-army-builder-modals.md`)
- [ ] S5 — static wave: campaign panels (+ optional slate→bronze re-theme, David's call) (`slices/05-campaign-panels.md`)
- [ ] S6 — HUD outcome branch (migrate-to-React OR keep-vanilla-share-tokens) (`slices/06-hud-outcome.md`)
- [ ] S7 — cleanup: delete replaced DOM/CSS, dedup the lab, one source proven (`slices/07-cleanup.md`)

**Update this section before ending each pass** (status, date, next pickup, the S3 verdict once measured).

## Architecture decisions (made up front; every slice assumes them)

1. **The canvas never enters React.** `#battlefield` and `#minimap` stay raw DOM owned by
   the renderer/rAF loop. React mounts a **sibling** fixed-position overlay (`#ui-root`)
   above the canvas, z-indexed, `pointer-events` per panel. React and the renderer share
   only two things: the bronze tokens and the zero-copy wasm-state seam. This sidesteps
   "React over a GPU canvas" — they're siblings, not nested.
2. **Keep the `Scene`/`switchScene` machine; React mounts per-scene.** `Scene.enter()` does
   `createRoot(#ui-root).render(<…/>)`, `exit()` unmounts. The rAF loop in `main.ts` is
   untouched. Per-scene mount lets surfaces migrate **one at a time** (menu React while
   battle still vanilla). _Optional later:_ once all scenes are React (post-S7), consolidate
   to a single persistent root + a scene-kind store — recorded as an end-state nicety, not a
   migration requirement.
3. **The 60 Hz hot path bypasses React — structure in React, values via refs.** React owns
   card/HUD **structure** (rebuilt only on roster change, which is rare). The per-frame bar
   widths/colors/count/`.sel`/`.rout` are written **imperatively to ref'd nodes by the
   existing rAF loop**, running the *verbatim hand-diffed `key`-skip logic* that
   `UnitCards.update()` uses today. **React's render/commit never runs at 60 Hz.**
   `useSyncExternalStore` is reserved for ≤5 Hz state (the throttled info panel/toolbar,
   selection identity, roster identity, menu/modal/campaign state). The zero-copy
   `Float32Array` is re-materialized per read (wasm-grow safety) exactly as today; **never
   copied into React state.** This is the single load-bearing call — **S3 measures it.**
4. **No state-management library.** A ~30-line module-scope external store
   (`subscribe`/`getSnapshot`) feeds `useSyncExternalStore` for low-frequency state; local
   `useState`/`useReducer` for forms (army builder, duel modal). No Redux/Zustand/Jotai.
5. **One bronze token source.** `web/src/ui/theme/bronze.css` holds the `:root` custom
   properties (verbatim from index.html) **plus** a `@layer components` set
   (`.chassis`, `.chassis-tray`, `.well`, …) for the bespoke metal Tailwind can't express —
   the four corner-rivet `radial-gradient`s, the brushed `repeating-linear-gradient`, the
   `padding-box`/`border-box` dual background, the 6-layer `box-shadow`. Tailwind v4's
   `@theme` maps the same vars to utilities. **Both `web/` and the lab import this one file**
   — that is the dedup the migration exists to deliver.
6. **Co-locate in `web/src/ui/`, no new package.** The only cross-app consumer (the lab)
   already imports `web/src/...` by relative path. A `packages/ui` is pure overhead for one
   consumer; promote later only if a third app needs the components.
7. **Tailwind v4 (CSS-first `@theme`), SSR off.** v4's CSS-first config co-locates with the
   token CSS; v3's JS config would fork the token definition. Pure client SPA, `createRoot`
   only — no Next/hydration. The `@vitejs/plugin-react` + Tailwind wiring **must preserve the
   COOP/COEP isolation headers** in `web/vite.config.ts` (`crossOriginIsolated === true`).

## The 4 CSS islands (what S1/S7 collapse into one)

Measured: (1) index.html `:root` tokens + class consumers (the canonical set); (2) index.html
`#unitcards` + `#toolbar` — **literal copies** of the chassis (rivets/brushed/6-layer shadow,
*not* using the vars); (3) the lab `installStyles()` — re-declares the whole `.ucard*` +
riveted card chassis as `.renderer-unitcards …` (the lab imports the *real* `UnitCards`
component — only the CSS is forked); (4) `web/src/campaign/panels.ts` `campaignDomHtml()` —
its own off-theme slate (`#2a3242`, system-ui, **zero** bronze tokens). S1 makes 1–3 consume
one source; S5 folds 4 in (optionally re-themed); S7 deletes the forks.

## Slice graph

```
S0 stack ──► S1 design-system (one bronze source)
                  │
                  ├──► S2 MENU proof ─────────────────────┐
                  │                                        │
                  └──► S3 HUD PERF SPIKE (gate) ──► S6 HUD outcome branch
                            │                              (migrate │ keep-vanilla-share-tokens)
        S2 ─► S4 army builder + battle modals ─┐           │
        S2 ─► S5 campaign panels ──────────────┴──► S7 cleanup ◄─┘
                                                    (4 CSS islands → 1; dedup lab)
```

S0→S1 are sequential foundation. S2 is the first surface. **S3 runs early (right after S2)**
to settle the seam before the static wave. S4/S5 proceed in parallel after S2; they don't
depend on S3's *outcome* (they're not on the hot path). S6 consumes S3's measurement. S7 last.

## Standing verification gates (every slice)

- **`tsc --noEmit` + `vite build`** green (S0 adds the typecheck script — there is none today).
- **Screenshots:** the harness (`web/scene.mjs` + `web/snapshot.mjs`) is the gate; baselines
  under `web/shots/`. It is **tolerant by default** (`threshold 0.12, maxDiffRatio 0.02`) and
  supports exact `{0,0}`. **Pure-refactor slices (S0, S1, S7) gate at (0,0) / no-re-bless —
  a forced re-bless there is a bug signal.** Intentional re-renders (S2 menu, S4/S5 panels)
  re-bless the reflowed baselines as a *reviewed* change, never a blind `UPDATE_SHOTS=1`.
  GPU scenes run **headful with hardware flags** (`VERIFY_GPU=1 VERIFY_GPU_ADAPTER=hardware
  VERIFY_HEADFUL=1 VERIFY_BROWSER_CHANNEL=chrome` — no headless WebGPU adapter on this Mac).
- **Every visual slice runs the two standing gates** —
  [compare-screenshots](../../.claude/skills/compare-screenshots/SKILL.md) against the prior
  vanilla baseline (this is a refactor: the target is "no worse / identical look", and the
  bronze aesthetic + `assets/reference-tw-cardbar.png` family is the yardstick) **and** an
  unprimed [screenshot-critique](../../.claude/skills/screenshot-critique/SKILL.md) as the
  last check — then opens the shots with
  [preview-shots](../../.claude/skills/preview-shots/SKILL.md).
- **The gating scenes:** `web/scenes/ui/card-bar.mjs` (lab card bar, DOM-only),
  `web/scenes/battle/battle-renderer-visual.mjs` (`battle-selection-dpr2`, GPU),
  `web/scenes/ui/menu-renderer-shell-visual.mjs` (menu), the campaign visual scenes, and
  `cardGrid.test.mjs` (`node --test`). **Add** a `menu-modals` snapshot in S2 (no baseline of
  the open duel/quick-battle modal exists today) so S4 has a gate to preserve.
- **S3's perf gate** is a measurement, not a baseline — see that slice.

## Firewalls — do NOT touch

- The WebGPU/WebGL renderer, WGSL, terrain, soldier/crowd, the **minimap canvas *draw***
  (`drawMinimap` — React owns only the bronze *frame* around `<canvas id="minimap">`), the
  Babylon campaign terrain + Canvas2D marker layer.
- `crates/**` sim/wasm and the **zero-copy `unit_info` buffer layout** (STRIDE + offsets).
- The screenshot harness *mechanism* (`scene.mjs`/`snapshot.mjs`); baselines re-bless, the
  machinery does not change.
- `UnitCards.update()`'s hand-diffed `key`-skip *logic* — it moves into the React card's
  imperative `update` verbatim; do not "Reactify" it into per-frame state.

## Open forks recorded (decide at the slice, non-blocking)

- **Campaign re-theme (S5):** the campaign panels are off-theme slate today. Option A
  (default, pure refactor): consolidate their CSS onto the one token source but **keep the
  slate look** — re-theming to bronze is separate aesthetics work. Option B: re-theme
  slate→bronze now (the one place screenshots *should* move). Flag to David in S5.
- **React root (post-S7):** per-scene `createRoot` (migration default) vs one persistent
  root + scene-kind store (A's end-state nicety). Decide only if/after the whole UI is React.
- **S3 thresholds** (median/p95/fps floors): proposed in the slice, David tunes at the spike
  checkpoint against the printed numbers.

## Genuine alternatives considered (and why not)

- **Big-bang in one PR, no spike** — rejected: the 60 Hz zero-copy seam is the one place a
  wrong default (React state per frame) silently regresses a renderer-bound frame. The spike
  settles it cheaply and gives a real fork.
- **`useSyncExternalStore` for the 60 Hz bars** — kept only as the head-to-head the spike
  measures; refs are the call for the hot path (leaf subscriptions still risk per-frame
  reconcile at scale).
- **Carve a `packages/ui`** — rejected for one consumer already cross-importing; promote later.
- **Tailwind v3 (JS config)** — rejected: forks the token definition vs v4's CSS-first `@theme`.
- **Keep the whole HUD vanilla forever** — that *is* the S6 keep-branch, a planned outcome
  the spike may select; either way one token source keeps "one design system" true.

Once shipped, [close-spec](../../.claude/skills/close-spec/SKILL.md) archives this to
`specs/done/` and rewrites it from a build ladder into a rationale record. This also closes
`specs/battle-ui/` S1 (the shared-token-extraction) — it was this migration all along.
