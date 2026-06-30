# Slice 1 — Pure no-scroll grid math (`cardGrid.ts`)

## Contract unlocked

A deterministic, DOM-free function that turns (available width, card count, the
**fixed** card width, aspect, gap, max rows) into a balanced, row-major grid that
**never overflows the width** and is **generic in count** (20 / 30 / 40 / any N).
Cards are a **fixed size** (Total War — David, 2026-06-30); the bar wraps into
more rows as the roster grows, and shrinks cards only past `maxRows` capacity to
avoid a scroll. Load-bearing math, isolated so it is testable in milliseconds
without a browser, wasm, or the renderer.

## API seam

New module **`web/src/battle/cardGrid.ts`**, owned entirely by the card layer (no
wasm, no renderer import):

```ts
export interface CardGrid {
  rows: number; cols: number; cardW: number; cardH: number; degenerate: boolean;
}
export interface CardGridOpts {
  cardW?: number;  // FIXED card width in px (the Total-War card size)
  aspect?: number; // cardW/cardH, default 3/4 (0.75, tall portrait)
  gap?: number;    // px between cards and at edges
  maxRows?: number;// cap; beyond this cards shrink rather than add rows
}
export function computeCardGrid(
  count: number, boxW: number, opts?: CardGridOpts,
): CardGrid;
```

Algorithm (see README "The fixed-size grid algorithm" for the canonical form):
`perRow = floor((boxW+gap)/(cardW+gap))`; `rows = min(maxRows, ceil(count/perRow))`;
`cols = ceil(count/rows)` (balanced). If `cols` fixed-size cards fit `boxW`, keep
the size (`degenerate:false`); else (roster overflows `maxRows`) shrink to fit and
flag `degenerate:true`. Floor the pixel outputs. **There is no `boxH`** — the bar
is content-height.

**Constants — David's direction (2026-06-30):** cards a *fixed* size, `aspect =
3/4`, `gap = 4`, `maxRows = 3`, `cardW = 72`. Numeric values may be nudged at the
S2 checkpoint once seen at the real battle camera, but the fixed-size behavior is
fixed.

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

- **Fixed card size:** 5 / 20 / 30 / 40 units all return the same `cardW`
  (`= opts.cardW`) — only the row count changes. This is the load-bearing
  Total-War invariant.
- **Generic-N stacking** at the 1256px live budget: 5 → 1×5, 20 → 2×10,
  30 → 2×15, 40 → 3×14; a wide band gives 20 → 1×20.
- **Never overflow:** for every case, `cols*cardW + gap*(cols+1) <= boxW`.
- **Coverage:** `rows*cols >= count` and `(rows-1)*cols < count` (no empty row).
- **Fixed aspect:** `cardH` equals `cardW/aspect` within rounding.
- **Monotonic:** raising `count` never *grows* `cardW`.
- **Graceful degenerate:** past `maxRows × perRow` capacity the cards shrink
  (`degenerate:true`, `cardW < opts.cardW`), `rows <= maxRows`, still
  non-overflowing — never a scroll.

This is the fastest gate in the feature and runs with no browser.

## Must stay green

Everything — the module is not imported by any app code yet. No snapshots move.

## Human review checkpoint

**Done** — David pinned the behavior on 2026-06-30: **fixed-size cards, wrap into
more rows, never resize to chase the roster** (the original size-to-fit-with-a-
`minCardW`-floor plan is retired). Implemented constants: `cardW = 72`,
`maxRows = 3`, `gap = 4`, aspect 3/4. The numeric `cardW`/`maxRows` may be nudged
at the S2 visual checkpoint; the fixed-size behavior is settled.

## Feedback that would change this slice

- "Cards are too big / too small" → change `cardW` (one number; rows re-derive).
- "Never more than 2 rows" → lower `maxRows` (a huge roster then shrinks earlier).
- "Cards are too tall / too squat" → change `aspect`.
- "Partial last row should be centered, not left-aligned" → that is a paint
  decision in S2's CSS, not this function.

## Notes

- No visual shot is produced here, so **no screenshot-critique** is required for
  this slice.
- Keep the function free of DOM and of any default that hides a magic number the
  reviewer should see — pass constants in from the caller so S2 and the test and
  the prototype share one source of truth.
