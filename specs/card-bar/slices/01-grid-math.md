# Slice 1 — Pure no-scroll grid math (`cardGrid.ts`)

## Contract unlocked

A deterministic, DOM-free function that turns (container box, card count, fixed
aspect, min legible width, gap, max rows) into a balanced, row-major grid that
**never overflows the box** and is **generic in count** (20 / 30 / 40 / any N).
This is the load-bearing math, isolated so it is testable in milliseconds without
a browser, wasm, or the renderer.

## API seam

New module **`web/src/battle/cardGrid.ts`**, owned entirely by the card layer (no
wasm, no renderer import):

```ts
export interface CardGrid {
  rows: number; cols: number; cardW: number; cardH: number;
}
export interface CardGridOpts {
  aspect?: number;   // cardW/cardH, default 3/4 (0.75, tall portrait)
  minCardW?: number; // legibility floor before we add a row
  gap?: number;      // px between cards and at edges
  maxRows?: number;  // cap; beyond this, cards shrink rather than add rows
}
export function computeCardGrid(
  count: number, boxW: number, boxH: number, opts?: CardGridOpts,
): CardGrid;
```

Algorithm (see README "The no-scroll grid algorithm" for the canonical form):
iterate `rows = 1..min(count, maxRows)`, `cols = ceil(count/rows)`, take
`cardW = min(widthBudgetPerCol, heightBudgetPerRow * aspect)`; return the **fewest
rows** whose `cardW >= minCardW`; if none qualifies, return the row count that
**maximizes** `cardW` (still no scroll, just undersized). Floor the pixel outputs.

**Constants — confirmed by David (2026-06-30)** via the
`visualizations/grid-prototype.html` defaults: `aspect = 3/4`, `gap = 4`,
`maxRows = 3`, `minCardW = 64`, band height `≈150px` (fed to S2 as `boxH`). Build
to these; they may still be nudged at the S2 checkpoint once seen at the real
battle camera, but they are the agreed starting point, not open guesses.

## What a human can run / see

- `node --test web/src/battle/cardGrid.test.mjs` — the assertions below.
- `specs/card-bar/visualizations/grid-prototype.html` — open in a browser; drag
  sliders for count / box width / box height / minCardW and watch the grid
  reflow live. This is the cheap loop for choosing constants **before** any DOM
  work, and it implements the same algorithm so the numbers match the test.

## Verification

A standalone **`web/src/battle/cardGrid.test.mjs`** following the repo's
`*.test.mjs` + `node --test` convention (mirror `packages/soldier-assets/bake/vat.test.mjs`).
Wire it into a `test:ui` script (or fold into the nearest node-test chain). Assert:

- **Generic-N stacking** at a representative narrow band: 20 → 2×10, 30 → 2×15,
  40 → 2×20; a wide band gives 20 → 1×20; a tiny roster gives 5 → 1×5.
- **Never overflow:** for every case, `cols*cardW + gap*(cols+1) <= boxW` and
  `rows*cardH + gap*(rows+1) <= boxH`.
- **Coverage:** `rows*cols >= count` and `(rows-1)*cols < count` (no empty row).
- **Fixed aspect:** `cardW/cardH` equals `aspect` within rounding.
- **Monotonic:** raising `count` never *grows* `cardW`.
- **Legibility preference:** the chosen `rows` is the smallest with
  `cardW >= minCardW` whenever such a row count exists.
- **Graceful degenerate:** a box too small for any row to reach `minCardW`
  returns without throwing, `rows <= maxRows`, still non-overflowing.

This is the fastest gate in the feature and runs with no browser.

## Must stay green

Everything — the module is not imported by any app code yet. No snapshots move.

## Human review checkpoint

**Done** — David approved the `grid-prototype.html` defaults on 2026-06-30
(`minCardW = 64`, `maxRows = 3`, `gap = 4`, band ≈150px, aspect 3/4). The test
just needs to encode those and the 20/30/40 expectations. Re-open the prototype
only if a number is challenged; otherwise this checkpoint is satisfied.

## Feedback that would change this slice

- "20 should stay one row down to a narrower window" → lower `minCardW`.
- "Never more than 2 rows even at 60 units" → lower `maxRows` (accept smaller
  cards).
- "Cards are too tall / too squat" → change `aspect`.
- "Partial last row should be left-aligned, not centered" → that is a paint
  decision deferred to S2's CSS, not this function.

## Notes

- No visual shot is produced here, so **no screenshot-critique** is required for
  this slice.
- Keep the function free of DOM and of any default that hides a magic number the
  reviewer should see — pass constants in from the caller so S2 and the test and
  the prototype share one source of truth.
