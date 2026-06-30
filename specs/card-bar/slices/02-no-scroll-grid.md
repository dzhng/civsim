# Slice 2 — No-scroll fixed-aspect grid in `UnitCards` (canvas portraits unchanged)

## Contract unlocked

The live card bar renders as a **fixed 3:4, no-scroll, auto-stacking grid**: all
cards always visible, rows added only when a single row would shrink cards below
the legible floor, reflowing live on resize. Portraits are still the existing flat
canvas (the `<img>` swap is S4) and bars are still live — **only layout changes**.
Plus the harness to *see* 20 / 30 / 40, which the live game (≈5v5) can't show.

## API seam

- **`web/src/battle/unitCard.ts` (`UnitCards`):**
  - Add a private `relayout()` that calls `computeCardGrid(this.cards.length,
    root.clientWidth, BAND_H, OPTS)` (S1) and writes the result as CSS custom
    properties on `root` — `--cols`, `--card-w`, `--card-h`. A `ResizeObserver`
    on `root` calls `relayout()`; `build()` calls it after appending.
  - Publish a probe for scenes: `window.__cardGrid = { rows, cols, cardW, degenerate }`
    (set in `relayout()`), so the scene asserts geometry numerically.
  - `build()` / `update()` public signatures unchanged → both wirings keep working
    untouched. `update()`'s keyed bar logic stays verbatim.
  - The portrait `<canvas>` stays for now, but resize its CSS box to the 3:4 card
    (it will be replaced by `<img>` in S4 — don't over-invest here).
- **CSS — both copies** (`web/index.html:74-108` and
  `apps/renderer-lab/src/router.ts` `installStyles` ~3597): replace the flex/scroll
  rules with a grid that consumes the vars and **removes overflow**:

  ```css
  #unitcards {
    display: grid;
    grid-template-columns: repeat(var(--cols, 1), var(--card-w, 44px));
    grid-auto-rows: var(--card-h, 58px);
    gap: 4px; justify-content: center; align-content: end;
    overflow: hidden;            /* never scroll */
  }
  .ucard { width: var(--card-w); height: var(--card-h); aspect-ratio: 3 / 4; }
  ```

  Delete `flex:0 0 auto`, `overflow-x:auto`, the fixed `.ucard { width:44px/62px }`,
  the `::-webkit-scrollbar` rules, and reconcile the `@media (max-width:760px)`
  rule (the grid handles narrow widths now). Keep the band's position/background.

**CSS-vs-JS rationale (decisive):** the row-count decision depends on **card count
N**, which CSS and container queries cannot see — `auto-fill` wraps but won't
*balance* 10+10 or honor a height budget. So JS computes `{cols, card-w, card-h}`;
CSS grid + `aspect-ratio` does the sizing/painting. The JS pass runs on resize +
roster change only (`ResizeObserver`), never per frame; `update()` still only
touches bar widths.

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
  visit `/renderer/card-bar` at `count ∈ {20,30,40}` × `dpr ∈ {1,2}`. For each:
  assert `root.scrollWidth <= root.clientWidth` **and** `scrollHeight <=
  clientHeight` (no scroll either axis), assert `window.__cardGrid.rows/cols`
  match S1's expectation, then `snapCheck` the `#unitcards` element →
  baselines under `web/shots/ui/card-bar-*`.
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

David opens real `?battle=5v5` **and** the lab route at 20/30/40: confirms zero
scrollbars, a clean 2-row stack at the target widths, legible cards, no collision
with `#toolbar`, and that the stack thresholds match the S1 sign-off. Tune
`minCardW` / `maxRows` / `BAND_H` here against the reference if needed (changing
only the constants, not the algorithm).

## Feedback that would change this slice

- "Stacks one row too early/late" → adjust `minCardW` (re-run S1 test).
- "Partial last row should hug left, not center" → `justify-content: start` on the
  last row (or a small grid tweak).
- "Band is too tall / eats the battlefield" → lower `BAND_H` (feeds `boxH`).
