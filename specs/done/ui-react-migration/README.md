# UI architecture: the web DOM UI is React + Vite + Tailwind v4

**Shipped.** civsim's UI overlay is React. The menu, the custom-battle army builder, every
campaign panel (top bar, army, city, diplomacy, class builder, sieges, battle-decision modal),
and the whole in-battle HUD (card bar, toolbar, unit info panel, game-over + pause modals) render
as React components on one shared bronze design source. The problem it solved: the hand-rolled
vanilla-TS DOM overlay had no component or state model, so the growing interactive surfaces
(army builder, campaign management) were string-built `innerHTML` with delegated event handlers —
untestable, duplicated across the game and the renderer-lab, and forking the bronze CSS in four
places. React gives those surfaces a real component+state model; a single `bronze.css` gives the
chrome one source.

The load-bearing question was whether the **per-frame in-battle HUD** could be React without
regressing a renderer-bound frame. It can — proven by measurement, not assumed (see *The perf
spike*). So the end state is React for **everything**, including the 60 Hz card bar.

## The reason (why this shape, not the obvious alternatives)

- **The canvas never enters React.** `#battlefield`, `#minimap`, and the Babylon campaign map stay
  raw DOM owned by the renderer/rAF loop. React mounts **sibling** overlays above the canvas, never
  a parent of it. "React over a GPU canvas" is a category error — they share only the bronze tokens
  and the zero-copy wasm-state seam, nothing in the tree.
- **Per-scene `createRoot`, not one persistent root.** The `Scene`/`switchScene` machine
  (`web/src/scene.ts`) is untouched: `enter()` mounts a root, `exit()` unmounts. This let every
  surface migrate one at a time (menu React while battle was still vanilla) instead of a big-bang
  rewrite. A single persistent root + scene-kind store was considered and rejected — it would have
  forced all scenes to move together.
- **The 60 Hz hot path bypasses React entirely.** React owns card/HUD *structure* (rebuilt only on
  roster change, which is rare); the per-frame bar widths/colours/count/`.sel`/`.rout` are written
  **imperatively to ref'd DOM nodes by the existing rAF loop**, through the *same* helpers the old
  vanilla bar used. React's render/commit never runs at 60 Hz. `useSyncExternalStore` was kept only
  as the head-to-head the spike measured, and rejected for the hot path — refs win; leaf
  subscriptions risk per-frame reconcile at roster scale. This is the single decision the whole
  migration hinged on, and it was measured (below), not guessed.
- **No state-management library.** Local `useState`/`useReducer` for forms; imperative renders from
  the scene for ≤5 Hz readouts. No Redux/Zustand/Jotai — the surfaces are either self-contained
  forms or scene-driven readouts, neither of which needs a store.
- **One bronze source.** `web/src/ui/theme/bronze.css` holds the `:root` design tokens. It is the
  only place `--bronze-fill/-edge/-frame`, `--well-*`, etc. are defined; everything consumes them
  via `var()`. Tailwind v4 (CSS-first `@theme`, no PostCSS config) was chosen over v3 so the token
  definitions don't fork between a JS config and the CSS.
- **Tailwind utilities only, no preflight.** The React surfaces reuse the existing bespoke
  bronze CSS (`.ucard`, `.cmp-*`, `#menu-ui …`) for byte-for-byte parity rather than restyling with
  Tailwind utilities. Preflight (Tailwind's global reset) was deliberately **not** adopted — it
  would move every baseline; `tailwind.css` imports only the utilities + theme layers. The `.chassis`
  component classes the plan imagined were never needed: the id-rule surfaces already consumed the
  tokens via `var()`, and moving them onto classes proved pixel-unsafe (see *Divergences*).

## The perf spike — the decision the migration hinged on

Verdict: **MIGRATE.** The React card bar (structure in React, 60 Hz writes imperative via refs)
costs the *same* as the vanilla DOM bar. Measured with `?measurecards` instrumentation
(`window.__cardUpdateSamples`, gated, zero overhead off) on a live `?map=A` battle, 20 cards, ~320
frames, ×2 runs, headful hardware GPU: both bars sit at the `performance.now()` resolution floor —
median 0.010 ms, p95 ~0.04 ms — with **Δmedian = 0.000 ms, Δp95 ≈ 0.000 ms** (gates were ≤0.30 /
≤0.50 ms) and identical frame counts (no fps regression). It's free because both bars call the same
`cardStateKey` + `applyCardVisual` helpers and React's render never runs per frame — the hot path is
literally the same code. Had it regressed, the fallback was Branch B: keep the vanilla bar but point
it at `bronze.css` so "one design system" held regardless. The spike existed precisely so a wrong
default (React state per frame) couldn't silently regress a renderer-bound frame.

## Invariants — what must stay true

- **The canvas is a firewall.** `drawMinimap`, the WebGPU/WebGL battle renderer, the Babylon
  campaign terrain + Canvas2D markers — React never manages any canvas or its draw. React owns only
  DOM overlays. (The minimap "frame" is bronze-token CSS applied directly to `<canvas id="minimap">`
  — there is no wrapper to Reactify.)
- **The zero-copy `unit_info` buffer is a firewall.** The per-frame `Float32Array` over wasm memory
  is re-materialized per read (it detaches on wasm grow) and **never copied into React state**. The
  STRIDE + field offsets are one source in the Rust packing / TS layout; React reads through the
  same `unitInfo()` view the vanilla bar did.
- **React render/commit must never run at 60 Hz.** The card bar's `UnitCardsHandle.update()` and the
  HUD/toolbar renders are the ≤5 Hz seam; the card `update` is imperative DOM writes only. If a
  future change makes a per-frame value flow through React state/props, the spike's guarantee is
  void — re-measure.
- **One bronze token source.** Only `web/src/ui/theme/bronze.css` may define the `:root` bronze
  tokens. New chrome consumes them via `var()`; it does not re-type the gradients.
- **Both consumers render one component.** The live game and the renderer-lab (`/renderer/card-bar`,
  `/renderer/campaign-ui`) render the *same* React components. No parallel builder/innerHTML path —
  the panel builders that used to fork the markup are gone.
- **Cross-origin isolation stays on.** `web/vite.config.ts` keeps the COOP/COEP headers; the React +
  Tailwind Vite plugins must not strip them (`crossOriginIsolated === true`).

## Pointers into the code

- Stack: `web/vite.config.ts` (react + tailwind plugins, COOP/COEP), `web/tsconfig.json` (`jsx`),
  `web/package.json` (`typecheck`, `test:ui`).
- Design source: `web/src/ui/theme/bronze.css`; `web/src/ui/tailwind.css` (utilities/theme, no preflight).
- Menu: `web/src/ui/menu/Menu.tsx`, `web/src/menu/scene.ts` (`MenuScene`, `createRoot`/flushSync).
- Army builder: `web/src/ui/menu/ArmyBuilder.tsx` + the byte-identical reducer
  `web/src/ui/menu/armyBuilderState.ts` (pure, node-tested: `armyBuilderState.test.mjs`).
- Card bar (the 60 Hz seam): `web/src/ui/hud/UnitCardsReact.tsx` + the shared helpers
  `cardStateKey`/`applyCardVisual`/`applyCardGrid`/`drawPortrait` in `web/src/battle/unitCard.ts`.
- Battle HUD: `web/src/ui/hud/Toolbar.tsx`, `HudPanel.tsx`, `BattleModals.tsx`; wired in
  `web/src/battle/scene.ts` (`updateToolbar`/`updateHud` compute state → flushSync render).
- Campaign panels: `web/src/ui/campaign/{CampaignTopBar,ArmyPanel,CityPanel,DiplomacyPanel,ClassBuilder,Sieges,CampaignBattleModal,UiIcon}.tsx`;
  wired in `web/src/campaign/scene.ts` (per-panel roots; `renderTopBar`/`updateArmyPanel`/… render
  the components; `this.modalOpen` replaced the old `this.modal` render-loop gate). Lab demo:
  `web/src/campaign/uiLayer.ts` renders the same components.
- Gates (the tests that pin behaviour): `web/scenes/ui/card-bar.mjs` (DOM-only, **headless** —
  see divergences), `web/scenes/battle/battle-renderer-visual.mjs` (`battle-selection-dpr2`),
  `web/scenes/ui/menu-renderer-shell{,-visual}.mjs`, `web/scenes/campaign/*`,
  `web/scenes/system/renderer-lab-routes.mjs`, `cardGrid.test.mjs` + `armyBuilderState.test.mjs`.

## Divergences from the plan (what a re-reader would otherwise re-derive)

- **Battle modals were resequenced, campaign panels resliced.** The battle modals needed a
  battle-scene React root that the HUD work also built, so they merged. The campaign panels were a
  954-line gameplay-critical scene — too big for one pass — so they were decomposed into six pieces
  (top bar → army/city → diplomacy → class builder → sieges → battle-decision modal).
- **The minimap frame was a no-op.** It is already the shared-token chassis on a firewall canvas;
  wrapping it in React would add DOM + pixel risk for nothing.
- **The lab `.ucard` CSS "fork" was redundant, not a real fork.** The renderer-lab is served by the
  web app's `index.html`, whose `<style>` defines `.ucard*` globally — so the lab's 16-line
  `.renderer-unitcards .ucard*` copy was dead; deleting it left the card bar pixel-identical.
- **Coexistence bugs that shaped the code (kept as warnings):**
  - Rendering the army-builder modal *inside* `#menu-ui` let `#menu-ui button` (specificity 0,1,1)
    bloat the `.qb-step`/`.qb-template` buttons (class 0,1,0) — 18.9% pixel diff. Fix: the modal is a
    **sibling** of `#menu-ui`, as it was when body-level.
  - `#ui-root` at z-index 50 hid the body-level modals (`#quick-battle-modal` z-40, `#manual` z-50)
    and ate their clicks. It sits at **z-20**, mirroring the old `#menu-ui`.
  - The React game-over panel only rendered on victory, so `#gameover-menu` didn't exist beforehand;
    the campaign-handoff harness reads its label. Fix: render it hidden at setup, like the old markup.
  - Panel renders are `flushSync`'d so the debug API and synchronous test reads see content
    immediately — the vanilla `innerHTML` was synchronous.
- **Capture-profile gotcha:** the DOM-only `card-bar` scene is blessed **headless** (default
  chromium). Running it under the GPU headful Chrome-stable flags rasterizes fonts/AA differently
  and shows a tolerated ~0.7% (byte-diff = 0 changed pixels). Gate `card-bar` headless; gate the GPU
  scenes headful.
- **A pre-existing quirk was ported verbatim, not "fixed":** the campaign speed buttons are labelled
  `1×/3×/10×` while `SPEEDS = [1,2,4]` (the date suffix uses `SPEEDS`).

## The four CSS islands (now one)

Before: (1) `index.html` `:root` tokens; (2) `index.html` `#toolbar`/`#unitcards` chassis literals
that re-typed the gradients instead of using the tokens; (3) the renderer-lab `installStyles`
`.renderer-unitcards` fork; (4) `campaign/panels.ts` off-theme slate. They now consume one source:
the tokens moved to `bronze.css` and the literal chassis switched to `var()`, the redundant lab
fork was deleted, and the slate campaign panels kept their look but render through React
components. The campaign slate→bronze *re-theme* was explicitly left as separate aesthetics work —
it was never part of this migration.

## Subsumes

This closes `specs/done/battle-ui/` S1 (the shared-token extraction) — it was this migration all along.

---

*Closed from a build ladder (S0–S7) into this record. The slice files and the "next agent" handoff
were scaffolding; the code under the pointers above is the source of truth for how.*
