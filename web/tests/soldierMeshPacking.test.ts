// @vitest-environment node
import { expect, test } from "vitest";
import { packSoldierVertices, type SoldierMeshData } from "@packages/soldier-assets/src/mesh";

test("GPU upload preserves all weighted vertex attributes without narrowing indices", () => {
  const mesh: SoldierMeshData = {
    positions: new Float32Array([1, 2, 3]),
    normals: new Float32Array([0, 0, 1]),
    colors: new Float32Array([1, 0.5, 0.25, 1]),
    joints: new Uint16Array([2, 7, 11, 13]),
    weights: new Float32Array([0.5, 0.25, 0.125, 0.125]),
    uvs: new Float32Array([0.25, 0.75]),
    tangents: new Float32Array([1, 0, 0, -1]),
    materialIds: new Float32Array([3]),
    factionMasks: new Float32Array([0.5]),
    indices: new Uint32Array([65536]),
  };
  expect(Array.from(packSoldierVertices(mesh))).toEqual([
    1, 2, 3, 0, 0, 1, 1, 0.5, 0.25, 1, 2, 7, 11, 13, 0.5, 0.25, 0.125, 0.125, 0.25, 0.75, 1, 0, 0,
    -1, 3, 0.5,
  ]);
  expect(mesh.indices[0]).toBe(65536);
});
