// @vitest-environment node
// Headless test for the Total-War card-bar grid math.
// No DOM, no browser, no wasm — Vitest runs this suite in its node environment.
//
// The pinned behavior: cards are a FIXED size and the bar wraps into more rows
// as the roster grows — cards never resize to chase the count.

import assert from "node:assert/strict";
import { test } from "vitest";
import { computeCardGrid } from "./cardGrid.ts";

const CARD_W = 72;
const ASPECT = 3 / 4;
const GAP = 4;
const MAX_ROWS = 3;
const OPTS = { cardW: CARD_W, aspect: ASPECT, gap: GAP, maxRows: MAX_ROWS };

// Live band width budget (≈ viewport minus side margins). At this width 16 fixed
// cards fit one row, so the roster wraps as it grows.
const BAND_W = 1256;

function noOverflow(g, boxW) {
  assert.ok(g.cols * g.cardW + GAP * (g.cols + 1) <= boxW, `fits: ${JSON.stringify(g)} in ${boxW}`);
}

test("cards keep a FIXED size as the roster grows", () => {
  // The whole point of the Total-War behavior: 5, 20, 30, 40 units all render
  // the same-size card — only the row count changes.
  for (const count of [5, 12, 20, 30, 40]) {
    const g = computeCardGrid(count, BAND_W, OPTS);
    assert.equal(g.cardW, CARD_W, `count ${count} keeps fixed width`);
    assert.ok(!g.degenerate, `count ${count} is not undersized`);
  }
});

test("generic-N stacking: wrap into more rows, balanced", () => {
  for (const [count, rows, cols] of [
    [5, 1, 5],
    [20, 2, 10],
    [30, 2, 15],
    [40, 3, 14],
  ]) {
    const g = computeCardGrid(count, BAND_W, OPTS);
    assert.equal(g.rows, rows, `count ${count} rows`);
    assert.equal(g.cols, cols, `count ${count} cols`);
  }
});

test("a wide band keeps 20 on one row", () => {
  const g = computeCardGrid(20, 2400, OPTS);
  assert.equal(g.rows, 1);
  assert.equal(g.cols, 20);
  assert.equal(g.cardW, CARD_W);
});

test("never overflows the width and covers every unit with no empty row", () => {
  for (const boxW of [BAND_W, 1280, 880, 2400, 640]) {
    for (let count = 1; count <= 60; count++) {
      const g = computeCardGrid(count, boxW, OPTS);
      noOverflow(g, boxW);
      assert.ok(g.rows * g.cols >= count, `covers ${count}: ${JSON.stringify(g)}`);
      assert.ok((g.rows - 1) * g.cols < count, `no empty row ${count}: ${JSON.stringify(g)}`);
      assert.ok(g.rows <= MAX_ROWS, `row cap ${count}: ${JSON.stringify(g)}`);
    }
  }
});

test("cards hold the fixed aspect within rounding", () => {
  for (const count of [5, 20, 40, 60]) {
    const g = computeCardGrid(count, BAND_W, OPTS);
    assert.ok(Math.abs(g.cardH - g.cardW / ASPECT) <= 1, `aspect ${count}: ${JSON.stringify(g)}`);
  }
});

test("raising count never grows cardW", () => {
  let prev = Infinity;
  for (let count = 1; count <= 80; count++) {
    const g = computeCardGrid(count, BAND_W, OPTS);
    assert.ok(g.cardW <= prev, `monotonic at ${count}: ${g.cardW} > ${prev}`);
    prev = g.cardW;
  }
});

test("extreme overflow shrinks (degenerate) only past maxRows capacity", () => {
  // 16/row × 3 rows = 48 fixed-size cards fit; beyond that, shrink — never scroll.
  const g = computeCardGrid(60, BAND_W, OPTS);
  assert.equal(g.rows, MAX_ROWS);
  assert.ok(g.degenerate, "flagged undersized");
  assert.ok(g.cardW < CARD_W, "shrunk below the fixed size");
  noOverflow(g, BAND_W);
});

test("empty roster collapses to zero", () => {
  assert.deepEqual(computeCardGrid(0, BAND_W, OPTS), {
    rows: 0,
    cols: 0,
    cardW: 0,
    cardH: 0,
    degenerate: false,
  });
  assert.equal(computeCardGrid(-3, BAND_W, OPTS).cols, 0);
});
