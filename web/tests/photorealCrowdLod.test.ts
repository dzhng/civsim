// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import { generatedFormation } from "@packages/crowd-runtime/src/instanceData.ts";
import { DEFAULT_LOD_POLICY, instanceScreenSize } from "@packages/crowd-runtime/src/lod.ts";
import { planPhotorealCrowdLods } from "@packages/photoreal-renderer/src/battle/crowdLod.ts";

test("photoreal crowd LOD coarsens monotonically by screen size and reaches the impostor tier", () => {
  const instances = [0, 30, 150, 420].map((y) => ({
    ...generatedFormation(1, { x: 0, y, faction: 0 })[0],
    y,
  }));
  const plan = planPhotorealCrowdLods(instances, { x: 0, y: 0, zoom: 12 });
  const levels = Array.from(plan.levels.subarray(0, instances.length));
  assert.ok(
    levels.every((level, i) => i === 0 || level >= levels[i - 1]),
    `levels ${levels.join(",")} must coarsen`,
  );
  assert.deepEqual(new Set(levels), new Set([0, 1, 2, 3]));
  assert.deepEqual(plan.counts, { l0: 1, l1: 1, l2: 1, l3: 1 });
});

test("photoreal crowd LOD keeps the runtime min-size floor", () => {
  const [inst] = generatedFormation(1, { x: 0, y: 1_000_000, faction: 0 });
  const camera = { x: 0, y: 0, zoom: 0.1 };
  const plan = planPhotorealCrowdLods([inst], camera);
  assert.equal(plan.levels[0], 3);
  assert.equal(
    instanceScreenSize(inst.x, inst.y, camera, inst.mounted),
    DEFAULT_LOD_POLICY.minScreenPixels,
  );
});

test("photoreal crowd LOD uses runtime hysteresis at tier boundaries", () => {
  const [inst] = generatedFormation(1, { x: 0, y: 0, faction: 0 });
  const justBelowL0 = planPhotorealCrowdLods([inst], { x: 0, y: 0, zoom: 17.5 / 1.8 }, [0]);
  const justAboveL0 = planPhotorealCrowdLods([inst], { x: 0, y: 0, zoom: 18.5 / 1.8 }, [1]);
  assert.equal(justBelowL0.levels[0], 0);
  assert.equal(justAboveL0.levels[0], 1);
});

test("photoreal crowd LOD reuses a caller-owned level buffer", () => {
  const instances = generatedFormation(4, { x: 0, y: 0, faction: 0 });
  const out = new Uint8Array(8);
  const plan = planPhotorealCrowdLods(instances, { x: 0, y: 0, zoom: 12 }, undefined, out);
  assert.equal(plan.levels, out);
  assert.equal(plan.counts.l0 + plan.counts.l1 + plan.counts.l2 + plan.counts.l3, 4);
});
