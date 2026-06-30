# Slice 2 — No-scroll fixed-aspect grid in `UnitCards` (canvas portraits unchanged)

## Contract unlocked

The live card bar renders as a **fixed 3:4, no-scroll, auto-stacking grid**: all
cards always visible, rows added only when a single row would shrink cards below
the legible floor, reflowing live on resize. Portraits are still the existing flat
canvas (the `<img>` swap is S4) and bars are still live — **only layout changes**.
Plus the harness to *see* 20 / 30 / 40, which the live game (≈5v5) can't show.

## API seam

- **`web/src/battle/unitCard.ts` (`UnitCards`):**
  - Add a private `relayout()` that calls `computeCardGrid(this.cards.length, boxW,
    GRID_OPTS)` (S1) with `boxW = window.innerWidth − 2*sideReserve` and writes the
    result as CSS custom properties on `root` — `--cols`, `--card-w`, `--card-h`.
    The bar **shrink-wraps to its cards**, so its width can't be its own input
    (circular); read the viewport instead. Reflow on window `resize`; `build()`
    calls it after appending.
  - **`sideReserve` is a constructor arg** (default `MINIMAP_RESERVE = 210`): the
    centered bar must clear the bottom-right minimap (a GPU overlay the DOM can't
    measure, ≤188px + 16px margin). The live game uses the default; the lab route,
    which has no minimap, passes a bare margin so the demo shows full width.
  - Publish a probe for scenes: `window.__cardGrid = { rows, cols, cardW, degenerate }`.
  - `build()` / `update()` public signatures unchanged → both wirings keep working.
    `update()`'s keyed bar logic stays verbatim.
  - The portrait `<canvas>` stays (replaced by `<img>` in S4 — don't over-invest);
    CSS sizes it to fill the card (`width:100%; flex:1 1 0`).
- **CSS — both copies** (`web/index.html` and `apps/renderer-lab/src/router.ts`
  `installStyles`): replace the flex/scroll rules with a **shrink-wrapping,
  centered** grid that consumes the vars and removes overflow:

  ```css
  #unitcards {
    position: fixed; bottom: 56px; left: 50%; transform: translateX(-50%);
    display: grid; width: max-content; max-width: calc(100vw - 24px);
    grid-template-columns: repeat(var(--cols, 1), var(--card-w, 72px));
    grid-auto-rows: var(--card-h, 96px);
    gap: 4px; justify-content: center; align-content: end;
    overflow: hidden;            /* never scroll */
  }
  .ucard { width: var(--card-w); height: var(--card-h); box-sizing: border-box; }
  ```

  `box-sizing:border-box` is load-bearing: the grid track is `--card-h`, so the
  card's padding+border must live *inside* that height or each card overflows its
  row (a 5px vertical scroll). Delete `flex:0 0 auto`, `overflow-x:auto`, the fixed
  `.ucard { width:44px/62px }`, the `::-webkit-scrollbar` rules, and the
  `#unitcards`/`.renderer-unitcards` parts of the `@media` rule (the shrink-wrap
  centers at any width now).

**CSS-vs-JS rationale (decisive):** the row-count decision depends on **card count
N**, which CSS and container queries cannot see. So JS computes `{cols, card-w,
card-h}`; CSS grid paints. The JS pass runs on window-resize + roster change only,
never per frame; `update()` still only touches bar widths.

## What a human can run / see

- **New lab route** `/renderer/card-bar?count=20` (also `=30`, `=40`) in
  `apps/renderer-lab/src/router.ts`: mount a `UnitCards` over `count` **synthetic**
  `UnitCardInit`s (no wasm needed — vary `cls`/`look`/`name` for coverage) inside a
  bottom band. Optionally `?w=` to drive band width so one route exercises
  wide/narrow. This is the **only** way to see the 20/30/40 stacking without a mock
  army; register it in the route table + nav.
- Real `?battle=5v5` — still ~5 cards in one row, proving the live path.
- Resize the window on either: cards stay all-visible and restack, no scrollbar.

## Verification

- **New scene `web/scenes/ui/card-bar.mjs`** (`web/scenes/ui/` already exists):
  visit `/renderer/card-bar?count=N` at `count ∈ {20,30,40}` × `dpr ∈ {1,2}`. For
  each: assert no scroll on either axis, `window.__cardGrid.rows/cols` match S1
  (20→2×10, 30→2×15, 40→3×14 at the 1280px viewport), and `cardW === 72` (the
  fixed size holds across rosters), then snap the `#unitcards` element via
  `page.screenshot({clip})` (element.screenshot mis-clips the fixed-position bar) →
  baselines `web/shots/ui/card-bar-{20,30,40}[-2x].png`.
- A click probe: click a card on the lab route, assert the synthetic `onSelect`
  fired (keeps selection wiring honest before S4 touches `build`).
- **compare-screenshots (required):** run
  [compare-screenshots](../../../.claude/skills/compare-screenshots/SKILL.md) on
  the 20-card capture vs `specs/card-bar/assets/reference-tw-cardbar.png` (crop to
  the strip) — does the row density, card aspect, and spacing land near the
  reference? Layout-only here (portraits come in S4), so judge the grid, not the
  pixels inside each card.
- **screenshot-critique (required, last step):** run
  [screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md) on
  the 20- and 40-card captures with an unprimed sub-agent before accepting — does
  it read as a clean Total-War grid, no scrollbar, no toolbar collision, legible
  cards? Fix and re-snap on any "off" verdict.

## Must stay green

- `battle-selection` (real 5v5 still builds ~5 cards and selects).
- `battle-input`, `battle-renderer-default`, and lab `routeBattleUi`/`routeBattleLive`
  — they delegate to `UnitCards`, so they inherit the grid; **re-bless their
  strip-bearing baselines** as a deliberate, reviewed change (this is expected
  churn, not a regression — eyeball each diff).

## Human review checkpoint

**Pending.** David opens real `?battle=5v5` **and** the lab route at 20/30/40:
confirms zero scrollbars, fixed-size cards (a 5-unit army is a few small cards,
not a few giant ones), legible cards, **no collision with the bottom-right
minimap or `#toolbar`**, and that the wrap thresholds read right. Tune `cardW` /
`maxRows` / `MINIMAP_RESERVE` here if needed (constants, not the algorithm). Below
a minimum window width the battle shows a placeholder instead — owned by the new
min-window-gate slice (`slices/06-min-window-gate.md`).

## Feedback that would change this slice

- "Cards too big / too small" → change `cardW` (re-run S1 test; baselines move).
- "Bar overlaps the minimap" → raise `MINIMAP_RESERVE`.
- "Partial last row should hug right / center" → CSS `justify-content` tweak.
- "3 rows eats too much battlefield" → lower `maxRows`.
