// Headless correctness test for the no-scroll card-grid math (slice 01).
// No DOM, no browser, no wasm — `node --test web/src/battle/cardGrid.test.mjs`.
// Node strips the types from the imported `.ts` (erasable TypeScript).
//
// Constants under test are David-approved (2026-06-30):
//   aspect 3/4, gap 4, maxRows 3, minCardW 64, production band height ≈150px.

import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCardGrid } from './cardGrid.ts';

const ASPECT = 3 / 4;
const GAP = 4;
const MAX_ROWS = 3;
const MIN_W = 64;
const OPTS = { aspect: ASPECT, gap: GAP, maxRows: MAX_ROWS, minCardW: MIN_W };

// Production band height (what S2 feeds as boxH). Here 2+ rows are always
// height-capped below minCardW, so a wrap can never grow a card.
const BAND_H = 150;
// Taller demo band: the height budget stops binding, so card WIDTH drives the
// wrap and a stacked row can be legible — needed to show 20→2×10 etc. legibly.
const TALL_H = 200;

function noOverflow(g, boxW, boxH) {
  assert.ok(g.cols * g.cardW + GAP * (g.cols + 1) <= boxW, `width fits: ${JSON.stringify(g)} in ${boxW}`);
  assert.ok(g.rows * g.cardH + GAP * (g.rows + 1) <= boxH, `height fits: ${JSON.stringify(g)} in ${boxH}`);
}

test('generic-N stacking: 20/30/40 wrap to 2 rows at a representative band', () => {
  // ~1280px band, tall enough (200) that width forces the wrap — the case the
  // README documents. 20→2×10, 30→2×15, 40→2×20 (40 undersized but still 2×20).
  for (const [count, rows, cols] of [[20, 2, 10], [30, 2, 15], [40, 2, 20]]) {
    const g = computeCardGrid(count, 1280, TALL_H, OPTS);
    assert.equal(g.rows, rows, `count ${count} rows`);
    assert.equal(g.cols, cols, `count ${count} cols`);
  }
});

test('a wide band keeps 20 on one row', () => {
  const g = computeCardGrid(20, 2000, TALL_H, OPTS);
  assert.equal(g.rows, 1);
  assert.equal(g.cols, 20);
});

test('a tiny roster stays one row', () => {
  const g = computeCardGrid(5, 1280, TALL_H, OPTS);
  assert.equal(g.rows, 1);
  assert.equal(g.cols, 5);
});

test('never overflows and covers every unit with no empty row', () => {
  const bands = [[1280, TALL_H], [1280, BAND_H], [2000, TALL_H], [640, BAND_H], [900, 220]];
  for (const [boxW, boxH] of bands) {
    for (let count = 1; count <= 60; count++) {
      const g = computeCardGrid(count, boxW, boxH, OPTS);
      noOverflow(g, boxW, boxH);
      assert.ok(g.rows * g.cols >= count, `covers ${count}: ${JSON.stringify(g)}`);
      assert.ok((g.rows - 1) * g.cols < count, `no empty row ${count}: ${JSON.stringify(g)}`);
      assert.ok(g.rows <= MAX_ROWS, `row cap ${count}: ${JSON.stringify(g)}`);
    }
  }
});

test('cards hold the fixed aspect within rounding', () => {
  for (const count of [5, 12, 20, 30, 40, 55]) {
    const g = computeCardGrid(count, 1280, TALL_H, OPTS);
    // both dims are floored, so compare against the un-floored ideal height.
    assert.ok(Math.abs(g.cardH - g.cardW / ASPECT) <= 1, `aspect ${count}: ${JSON.stringify(g)}`);
  }
});

test('raising count never grows cardW at the production band', () => {
  // At boxH=150 a wrap is always height-capped below minCardW, so more cards
  // can only shrink (or hold) the card — the property the live UI relies on.
  let prev = Infinity;
  for (let count = 1; count <= 60; count++) {
    const g = computeCardGrid(count, 1280, BAND_H, OPTS);
    assert.ok(g.cardW <= prev, `monotonic at ${count}: ${g.cardW} > ${prev}`);
    prev = g.cardW;
  }
});

test('legibility preference: fewest rows that reach minCardW', () => {
  // Wide enough for one legible row → 1 row.
  assert.equal(computeCardGrid(20, 2000, TALL_H, OPTS).rows, 1);
  // Narrower: one row drops below minCardW, two rows clear it → 2 rows.
  const g = computeCardGrid(20, 1280, TALL_H, OPTS);
  assert.equal(g.rows, 2);
  assert.ok(g.cardW >= MIN_W, `chosen row is legible: ${JSON.stringify(g)}`);
  assert.ok(!g.degenerate);
});

test('graceful degenerate: too-small box never throws or scrolls', () => {
  const g = computeCardGrid(40, 400, 80, OPTS);
  assert.ok(g.degenerate, 'flagged undersized');
  assert.ok(g.rows <= MAX_ROWS);
  assert.ok(g.cardW < MIN_W, 'below legibility floor as expected');
  noOverflow(g, 400, 80);
});

test('empty roster collapses to zero', () => {
  assert.deepEqual(computeCardGrid(0, 1280, BAND_H, OPTS), {
    rows: 0, cols: 0, cardW: 0, cardH: 0, degenerate: false,
  });
  assert.deepEqual(computeCardGrid(-3, 1280, BAND_H, OPTS).cols, 0);
});
