// Byte-identical-output contract for the React army-builder reducer (S4).
// `node --test web/src/ui/menu/armyBuilderState.test.mjs` — Node strips the
// types from the imported `.ts`. No DOM, no catalog (synthetic templates), so
// it isolates the one thing that must not drift: picks in Map INSERTION order
// (template-first, then click-added classes), 0-count classes filtered out but
// holding their slot for a re-increment.

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BATTLE_FACTIONS,
  armyBuilderReducer,
  armyConfig,
  pickArmy,
} from "./armyBuilderState.ts";

// Arbitrary class ids in a non-ascending order, to prove insertion order is kept
// (an object-keyed-by-int would resort these to 1,2,7).
const TMPL_A = [
  { classId: 7, count: 5 },
  { classId: 2, count: 3 },
  { classId: 1, count: 2 },
];
const TMPL_B = [
  { classId: 9, count: 4 },
  { classId: 3, count: 1 },
];

const armyOf = (units) => new Map(units.map((u) => [u.classId, u.count]));
const stateOf = () => ({
  mapId: 0,
  generatedSeed: "7",
  armies: [armyOf(TMPL_A), armyOf(TMPL_B)],
  factions: [...DEFAULT_BATTLE_FACTIONS],
});
const picksOf = (units) => units.map((u) => ({ classId: u.classId, count: u.count }));

test("armyConfig reflects insertion order, not numeric class id", () => {
  const cfg = armyConfig(stateOf());
  assert.equal(cfg.mapId, 0);
  assert.equal(cfg.generatedSeed, "7");
  assert.deepEqual(cfg.teams[0], picksOf(TMPL_A)); // 7,2,1 — NOT 1,2,7
  assert.deepEqual(cfg.teams[1], picksOf(TMPL_B));
  assert.deepEqual(cfg.factions, ["azure", "crimson"]);
});

test("generated seed actions sanitize numeric input and reroll", () => {
  const s0 = stateOf();
  const s1 = armyBuilderReducer(s0, { kind: "generatedSeed", seed: "00seed-42x" });
  assert.equal(s1.generatedSeed, "42");
  const s2 = armyBuilderReducer(s1, { kind: "rerollGeneratedSeed" });
  assert.match(s2.generatedSeed, /^\d+$/);
  assert.equal(s0.generatedSeed, "7", "s0 not mutated");
});

test("map action sets mapId, leaves armies untouched (and is immutable)", () => {
  const s0 = stateOf();
  const s1 = armyBuilderReducer(s0, { kind: "map", mapId: 42 });
  assert.equal(s1.mapId, 42);
  assert.deepEqual(armyConfig(s1).teams, armyConfig(s0).teams);
  assert.equal(s0.mapId, 0, "s0 not mutated");
});

test("template action replaces a side in template order, leaves the other side", () => {
  const s0 = stateOf();
  const s1 = armyBuilderReducer(s0, { kind: "template", team: 0, units: TMPL_B });
  assert.deepEqual(armyConfig(s1).teams[0], picksOf(TMPL_B));
  assert.deepEqual(armyConfig(s1).teams[1], picksOf(TMPL_B)); // side 1 already TMPL_B
  assert.deepEqual(armyConfig(s0).teams[0], picksOf(TMPL_A), "s0 not mutated");
});

test("faction action updates one side and leaves armies untouched", () => {
  const s0 = stateOf();
  const s1 = armyBuilderReducer(s0, { kind: "faction", team: 0, factionId: "crimson" });
  assert.deepEqual(armyConfig(s1).factions, ["crimson", "crimson"]);
  assert.deepEqual(armyConfig(s1).teams, armyConfig(s0).teams);
  assert.deepEqual(armyConfig(s0).factions, ["azure", "crimson"], "s0 not mutated");
});

test("a class added after the template is appended LAST in pick order", () => {
  let s = stateOf();
  s = armyBuilderReducer(s, { kind: "count", team: 0, classId: 99, delta: 1 });
  const picks = armyConfig(s).teams[0];
  assert.deepEqual(
    picks.slice(0, TMPL_A.length),
    picksOf(TMPL_A),
    "template classes still lead, in order",
  );
  assert.deepEqual(picks[picks.length - 1], { classId: 99, count: 1 }, "new class appended last");
});

test("count clamps at 0; a zeroed class drops out of picks but keeps its slot", () => {
  let s = stateOf();
  // drive class 7 (first) negative — must clamp to 0, keep the key
  s = armyBuilderReducer(s, { kind: "count", team: 0, classId: 7, delta: -50 });
  assert.equal(s.armies[0].get(7), 0, "clamped at 0, key retained");
  assert.equal(
    armyConfig(s).teams[0].find((p) => p.classId === 7),
    undefined,
    "filtered from picks",
  );
  // re-increment: returns to its ORIGINAL leading slot, not appended
  s = armyBuilderReducer(s, { kind: "count", team: 0, classId: 7, delta: 4 });
  assert.deepEqual(
    armyConfig(s).teams[0][0],
    { classId: 7, count: 4 },
    "returns to original position",
  );
});

test("pickArmy filters non-positive counts", () => {
  const army = new Map([
    [1, 3],
    [2, 0],
    [5, 2],
  ]);
  assert.deepEqual(pickArmy(army), [
    { classId: 1, count: 3 },
    { classId: 5, count: 2 },
  ]);
});
