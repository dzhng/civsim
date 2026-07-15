import assert from "node:assert/strict";
import test from "node:test";
import {
  turfBakeSignature,
  TURF_SPIKE_PALETTE,
  type TurfBakeSpec,
} from "../../apps/renderer-lab/src/turfTextureSpike.ts";

const SPEC: TurfBakeSpec = {
  sizePx: 256,
  tileWorldM: 5,
  seed: 0x7a11e5,
  strokeCount: 900,
  palette: TURF_SPIKE_PALETTE,
};

test("turf spike stroke plan is deterministic for one fixed spec", () => {
  assert.equal(turfBakeSignature(SPEC), turfBakeSignature({ ...SPEC }));
});

test("turf stroke plan changes when its seed changes", () => {
  assert.notEqual(turfBakeSignature(SPEC), turfBakeSignature({ ...SPEC, seed: SPEC.seed + 1 }));
});
