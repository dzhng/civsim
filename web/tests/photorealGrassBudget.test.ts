import assert from "node:assert/strict";
import test from "node:test";
import { activeGrassRecordBudget } from "../../packages/photoreal-renderer/src/battle/grassBudget.ts";

const standardProfile = {
  maxRecords: 160000,
  minActiveRecords: 18000,
  closeDensityReferenceRecords: 12000,
  closeDensityReferenceRadiusM: 64,
  rebuildMarginM: 48,
  vistaTransitionDefaults: {
    denseBladeEndM: 143,
    farGrassStartM: 260,
    farGrassEndM: 480,
    farSoftWidthScale: 1.6,
    edgeSinkStartM: 380,
  },
};

test("photoreal grass record budget scales with active ring area", () => {
  const vista = activeGrassRecordBudget(standardProfile, 528);
  assert.equal(vista.maxRecords, 160000);
  assert.equal(vista.areaScale, 1);

  const close = activeGrassRecordBudget(standardProfile, 122);
  assert.ok(close.maxRecords >= 43600 && close.maxRecords <= 43700, JSON.stringify(close));
  assert.ok(close.areaScale < 0.06, JSON.stringify(close));

  const nearMid = activeGrassRecordBudget(standardProfile, 214);
  assert.ok(nearMid.maxRecords >= 134000 && nearMid.maxRecords <= 134300, JSON.stringify(nearMid));
});

test("photoreal grass record budget never exceeds the profile cap", () => {
  const oversized = activeGrassRecordBudget(standardProfile, 900);
  assert.equal(oversized.maxRecords, standardProfile.maxRecords);
  assert.equal(oversized.areaScale, 1);
});
