// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  hemiOctTileDirections,
  nearestHemiOctTile,
  nearestTileByDot,
} from "@packages/photoreal-renderer/src/crowd/impostorTile.ts";

// Deterministic LCG so a failure reproduces.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dot(dirs: Float64Array, i: number, x: number, y: number, z: number) {
  return x * dirs[i * 3] + y * dirs[i * 3 + 1] + z * dirs[i * 3 + 2];
}

for (const [columns, rows] of [
  [8, 8],
  [4, 4],
  [16, 16],
  [8, 6],
]) {
  test(`fast hemi-oct tile pick is never worse than the exhaustive scan (${columns}x${rows})`, () => {
    const dirs = hemiOctTileDirections(columns, rows);
    const next = rng(columns * 131 + rows);
    let checked = 0;
    for (let n = 0; n < 200_000; n++) {
      // Uniform on the sphere, upper hemisphere biased toward the horizon where
      // the cells fold — the region where the containing cell and the nearest
      // centre most often disagree.
      const phi = next() * Math.PI * 2;
      const zRaw = n % 4 === 0 ? next() * 0.08 : next();
      const z = n % 16 === 0 ? -zRaw : zRaw;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const x = r * Math.cos(phi);
      const y = r * Math.sin(phi);
      const fast = nearestHemiOctTile(x, y, z, columns, rows, dirs);
      const ref = nearestTileByDot(x, y, z, dirs);
      // Folded corner tiles duplicate interior directions exactly, so a
      // different index is fine as long as it faces the direction as well.
      assert.ok(
        dot(dirs, fast, x, y, z) >= dot(dirs, ref, x, y, z),
        `dir (${x}, ${y}, ${z}): fast tile ${fast} is farther than ${ref}`,
      );
      checked++;
    }
    assert.equal(checked, 200_000);
  });
}

test("hemi-oct tile directions are unit length and face the upper hemisphere", () => {
  const dirs = hemiOctTileDirections(8, 8);
  for (let i = 0; i < 64; i++) {
    const len = Math.hypot(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]);
    assert.ok(Math.abs(len - 1) < 1e-12);
    assert.ok(dirs[i * 3 + 2] >= 0);
  }
});
