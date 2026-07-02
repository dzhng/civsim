import { test } from "node:test";
import assert from "node:assert/strict";
import { armySummary } from "./armySummary.ts";

// Build a unit_info-shaped Float32Array from plain unit records, writing only the
// fields armySummary reads (team +6, total +7, cohesion +4, alive +15, morale +20,
// routing +21). Stride is generous so the offsets never collide.
const STRIDE = 33;
function pack(units) {
  const info = new Float32Array(units.length * STRIDE);
  units.forEach((u, i) => {
    const o = i * STRIDE;
    info[o + 6] = u.team ?? 0;
    info[o + 7] = u.total ?? 0;
    info[o + 4] = u.cohesion ?? 0;
    info[o + 15] = u.alive ?? 0;
    info[o + 20] = u.morale ?? 0;
    info[o + 21] = u.routing ? 1 : 0;
  });
  return info;
}

test("counts only living player units and sums their men", () => {
  const info = pack([
    { team: 0, alive: 100, total: 100 },
    { team: 0, alive: 0, total: 100 }, // dead player unit: counted in total, not alive
    { team: 1, alive: 100, total: 100 }, // enemy: ignored entirely
  ]);
  const s = armySummary(info, 3, STRIDE);
  assert.equal(s.unitsTotal, 2);
  assert.equal(s.unitsAlive, 1);
  assert.equal(s.strengthFrac, 100 / 200);
});

test("morale/cohesion are men-weighted, not per-unit averaged", () => {
  // 300 men at 0.9 and 100 men at 0.1 → weighted 0.7, not the unit mean 0.5.
  const info = pack([
    { team: 0, alive: 300, total: 300, morale: 0.9, cohesion: 0.8 },
    { team: 0, alive: 100, total: 100, morale: 0.1, cohesion: 0.4 },
  ]);
  const s = armySummary(info, 2, STRIDE);
  assert.ok(Math.abs(s.morale - 0.7) < 1e-6, `morale ${s.morale}`);
  assert.ok(Math.abs(s.cohesion - 0.7) < 1e-6, `cohesion ${s.cohesion}`);
});

test("doubling the men at the same morale leaves the average unchanged", () => {
  const one = armySummary(pack([{ team: 0, alive: 100, total: 100, morale: 0.6 }]), 1, STRIDE);
  const two = armySummary(pack([{ team: 0, alive: 200, total: 200, morale: 0.6 }]), 1, STRIDE);
  assert.ok(Math.abs(one.morale - two.morale) < 1e-9);
});

test("routing counts only living player units that are routing", () => {
  const info = pack([
    { team: 0, alive: 50, total: 100, routing: true },
    { team: 0, alive: 0, total: 100, routing: true }, // dead: not counted
    { team: 0, alive: 100, total: 100, routing: false },
    { team: 1, alive: 100, total: 100, routing: true }, // enemy: ignored
  ]);
  assert.equal(armySummary(info, 4, STRIDE).routing, 1);
});

test("empty / all-dead army is zeroed, not NaN", () => {
  const s = armySummary(pack([{ team: 0, alive: 0, total: 0 }]), 1, STRIDE);
  assert.equal(s.strengthFrac, 0);
  assert.equal(s.morale, 0);
  assert.equal(s.cohesion, 0);
});
