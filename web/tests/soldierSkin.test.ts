// @vitest-environment node
import { expect, test } from "vitest";
import { poseSoldierMesh } from "@packages/soldier-assets/src/skin";

test("four-joint skinning blends positions and normals before normalization", () => {
  const mesh = {
    positions: new Float32Array([1, 0, 0]),
    normals: new Float32Array([1, 0, 0]),
    joints: new Uint16Array([0, 1, 2, 3]),
    weights: new Float32Array([0.25, 0.25, 0.25, 0.25]),
  };
  // Column-major matrices: identity, quarter-turn, half-turn, translated identity.
  const data = [
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0, 0,
    1,
  ];
  const result = poseSoldierMesh(mesh, { width: 1, data }, 0);
  expect(Array.from(result.positions)).toEqual([1.25, 0.25, 0]);
  expect(result.normals[0]).toBeCloseTo(Math.SQRT1_2, 6);
  expect(result.normals[1]).toBeCloseTo(Math.SQRT1_2, 6);
  expect(result.normals[2]).toBe(0);
});
