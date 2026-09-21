// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import { blendLocalPoses } from "@packages/soldier-assets/src/localPose";

// Retain the allocation-heavy pre-optimization arithmetic independently: timeline
// reference tests share the production blend primitive and cannot detect its drift.
function referenceBlend(a: Float64Array, b: Float64Array, weight: number) {
  if (weight === 0) return a.slice();
  if (weight === 1) return b.slice();
  const out = new Float64Array(a.length);
  const scalar = (x: number, y: number) =>
    Math.max(Math.min(x, y), Math.min(Math.max(x, y), x + (y - x) * weight));
  for (let j = 0; j < a.length; j += 10) {
    for (const k of [0, 1, 2, 7, 8, 9]) out[j + k] = scalar(a[j + k], b[j + k]);
    const [ax, ay, az, aw] = a.subarray(j + 3, j + 7);
    let [bx, by, bz, bw] = b.subarray(j + 3, j + 7);
    let dot = ax * bx + ay * by + az * bz + aw * bw;
    if (dot < 0) {
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
      dot = -dot;
    }
    let s0: number, s1: number;
    if (dot > 0.9995) {
      s0 = 1 - weight;
      s1 = weight;
    } else {
      const theta = Math.acos(dot),
        sin = Math.sin(theta);
      s0 = Math.sin((1 - weight) * theta) / sin;
      s1 = Math.sin(weight * theta) / sin;
    }
    const q = [s0 * ax + s1 * bx, s0 * ay + s1 * by, s0 * az + s1 * bz, s0 * aw + s1 * bw];
    const length = Math.hypot(...q) || 1;
    out.set(
      q.map((v) => v / length),
      j + 3,
    );
  }
  return out;
}

const rotations = [
  [0, 0, 0, 1],
  [0, 0, 0, -1],
  [0.6, 0, 0, 0.8],
  [0, Math.sin(0.001), 0, Math.cos(0.001)],
  [0, 0, 0, 0],
];
function pose(shift: number) {
  return new Float64Array(
    rotations.flatMap((q, i) => [
      (i + shift) * 1e120,
      -Number.MIN_VALUE * (i + shift),
      (i - shift) / 7,
      ...q,
      1 + shift / 100,
      1e-120 * (i + 1),
      -1 - shift / 100,
    ]),
  );
}

test("pose blending exactly preserves quaternion branches, scalar ranges and owned endpoints", () => {
  const a = pose(0),
    b = pose(2);
  // Every pair includes distinct near-parallel rotations as well as opposite signs.
  for (let shift = 0; shift < rotations.length; shift++) {
    for (let i = 0; i < rotations.length; i++)
      b.set(rotations[(i + shift) % rotations.length], i * 10 + 3);
    for (const weight of [0, Number.EPSILON, 0.001, 0.23, 0.5, 0.999, 1 - Number.EPSILON, 1]) {
      const beforeA = a.slice(),
        beforeB = b.slice();
      const result = blendLocalPoses(a, b, weight);
      assert.deepEqual(result, referenceBlend(a, b, weight));
      result.fill(42);
      assert.deepEqual(a, beforeA);
      assert.deepEqual(b, beforeB);
    }
  }
});

test("repeated interruptions preserve exact poses without mutating retained endpoints", () => {
  let actual: Float64Array = pose(0),
    expected = actual.slice();
  const retained = actual,
    original = actual.slice();
  for (let i = 0; i < 512; i++) {
    const next = pose((i % 17) - 8),
      weight = ((i * 37) % 101) / 100;
    for (let j = 0; j < rotations.length; j++)
      next.set(rotations[(i + j) % rotations.length], j * 10 + 3);
    actual = blendLocalPoses(actual, next, weight);
    expected = referenceBlend(expected, next, weight);
    assert.deepEqual(actual, expected, `interruption ${i}`);
  }
  assert.deepEqual(retained, original);
});
