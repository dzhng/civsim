// Pure, DOM-free no-scroll grid math for the battle card bar.
//
// Turns (card count, container box, fixed card aspect, legibility floor, gap,
// row cap) into a balanced, row-major grid that NEVER overflows the box and is
// generic in count — 20 / 30 / 40 / any N stack into the fewest legible rows.
// Layout decisions that depend on N can't live in CSS (it can't see the count),
// so the JS picks rows/cols/cardW/cardH and CSS paints them.
//
// The canonical algorithm is mirrored verbatim in
// specs/card-bar/visualizations/grid-prototype.html — keep the two in lockstep.

export interface CardGrid {
  rows: number;
  cols: number;
  cardW: number;
  cardH: number;
  // true when no row count reached minCardW: the most-legible (still
  // non-overflowing) fallback, so the caller can flag undersized cards.
  degenerate: boolean;
}

export interface CardGridOpts {
  aspect?: number; // cardW/cardH, default 3/4 (0.75, tall portrait)
  minCardW?: number; // legibility floor before we add a row
  gap?: number; // px between cards and at edges
  maxRows?: number; // cap; beyond this, cards shrink rather than add rows
}

export function computeCardGrid(
  count: number,
  boxW: number,
  boxH: number,
  { aspect = 3 / 4, minCardW = 64, gap = 4, maxRows = 3 }: CardGridOpts = {},
): CardGrid {
  if (count <= 0) return { rows: 0, cols: 0, cardW: 0, cardH: 0, degenerate: false };
  let best: { rows: number; cols: number; cardW: number; cardH: number } | null = null;
  const cap = Math.min(count, maxRows);
  for (let rows = 1; rows <= cap; rows++) {
    const cols = Math.ceil(count / rows);
    const wPerCol = (boxW - gap * (cols + 1)) / cols;
    const hPerRow = (boxH - gap * (rows + 1)) / rows;
    // Satisfy BOTH the per-column width budget and the per-row band-height
    // budget at the fixed aspect, so cards never overflow either dimension.
    const cardW = Math.min(wPerCol, hPerRow * aspect);
    const cand = { rows, cols, cardW, cardH: cardW / aspect };
    if (cardW >= minCardW) return floorGrid(cand, false); // fewest legible rows — done
    if (best === null || cardW > best.cardW) best = cand;
  }
  return floorGrid(best!, true); // none reached minCardW: most-legible, still no scroll
}

function floorGrid(
  g: { rows: number; cols: number; cardW: number; cardH: number },
  degenerate: boolean,
): CardGrid {
  return {
    rows: g.rows,
    cols: g.cols,
    cardW: Math.floor(g.cardW),
    cardH: Math.floor(g.cardH),
    degenerate,
  };
}
