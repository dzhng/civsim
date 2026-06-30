// Pure, DOM-free Total-War card-bar grid math.
//
// Cards are a FIXED size (never resized to fit the roster — that is the Total
// War behavior David pinned). The bar instead wraps into more rows as the
// roster grows: rows = the fewest that hold `count` cards at the fixed width,
// capped at `maxRows`; cols is balanced across those rows. Cards shrink below
// the fixed width ONLY in the extreme overflow case (more cards than maxRows can
// hold at full size), purely to honor the no-scroll invariant — flagged
// `degenerate`. The band itself shrink-wraps to `cols × cardW` (centered), so a
// small roster is a few fixed cards, not a few giant ones.
//
// Layout decisions that depend on N can't live in CSS (it can't see the count),
// so the JS picks rows/cols and CSS paints them. The canonical algorithm is
// mirrored in specs/card-bar/visualizations/grid-prototype.html — keep them in
// lockstep.

export interface CardGrid {
  rows: number;
  cols: number;
  cardW: number;
  cardH: number;
  // true only when the roster overflows maxRows at the fixed size and cards had
  // to shrink to avoid scrolling — lets the caller flag undersized cards.
  degenerate: boolean;
}

export interface CardGridOpts {
  cardW?: number; // FIXED card width in px (the Total-War card size)
  aspect?: number; // cardW/cardH, default 3/4 (0.75, tall portrait)
  gap?: number; // px between cards and at edges
  maxRows?: number; // cap; beyond this cards shrink rather than add rows
}

export function computeCardGrid(
  count: number,
  boxW: number,
  { cardW = 72, aspect = 3 / 4, gap = 4, maxRows = 3 }: CardGridOpts = {},
): CardGrid {
  if (count <= 0) return { rows: 0, cols: 0, cardW: 0, cardH: 0, degenerate: false };
  const cardH = cardW / aspect;
  // Fixed cards that fit one row of the available width.
  const perRow = Math.max(1, Math.floor((boxW + gap) / (cardW + gap)));
  const rows = Math.min(maxRows, Math.ceil(count / perRow));
  const cols = Math.ceil(count / rows); // balance the rows (10+10, not 16+4)
  // Do `cols` fixed-size cards fit the width? If so, keep the size; only when
  // the roster overflows maxRows do we shrink — never to chase the roster size.
  const needed = cols * cardW + gap * (cols + 1);
  if (needed <= boxW) {
    return { rows, cols, cardW: Math.floor(cardW), cardH: Math.floor(cardH), degenerate: false };
  }
  const shrunkW = (boxW - gap * (cols + 1)) / cols;
  return { rows, cols, cardW: Math.floor(shrunkW), cardH: Math.floor(shrunkW / aspect), degenerate: true };
}
