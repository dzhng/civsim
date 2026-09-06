// @vitest-environment node
import { expect, test } from "vitest";
import {
  poseSoldierMesh,
  assertMappedTangentFrames,
  TANGENT_FRAME_EPSILON_SQUARED,
} from "@packages/soldier-assets/src/skin";

test("four-joint skinning blends positions and normals before normalization", () => {
  const mesh = {
    positions: new Float32Array([1, 0, 0]),
    normals: new Float32Array([1, 0, 0]),
    tangents: new Float32Array([0, 1, 0, -1]),
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
  expect(Array.from(result.tangents)).toEqual([
    Math.fround(-Math.SQRT1_2),
    Math.fround(Math.SQRT1_2),
    0,
    -1,
  ]);
  mesh.tangents[3] = 1;
  const mirrored = poseSoldierMesh(mesh, { width: 1, data }, 0);
  expect(mirrored.positions).toEqual(result.positions);
  expect(mirrored.normals).toEqual(result.normals);
  expect(Array.from(mirrored.tangents)).toEqual([...result.tangents.slice(0, 3), 1]);
});

test("mapped-frame parallelism is relative to direction, not authored vector magnitudes", () => {
  const material = {
    name: "mapped",
    baseColor: [1, 1, 1, 1] as [number, number, number, number],
    roughness: 1,
    metallic: 0,
    textures: { normal: true as const },
  };
  for (const magnitude of [1, 1e20, 1e-20]) {
    const frame = (angle: number) => ({
      normals: new Float32Array([0, 0, magnitude]),
      tangents: new Float32Array([angle / magnitude, 0, 1 / magnitude, 1]),
      materialIds: new Float32Array([0]),
    });
    expect(() =>
      assertMappedTangentFrames(frame(Math.sqrt(TANGENT_FRAME_EPSILON_SQUARED) / 2), [material]),
    ).toThrow(/normal-mapped/);
    expect(() =>
      assertMappedTangentFrames(frame(Math.sqrt(TANGENT_FRAME_EPSILON_SQUARED) * 2), [material]),
    ).not.toThrow();
  }
});

test("mapped tangent admission leaves unmarked slots alone and preserves mirrored signs", () => {
  const materials = [
    {
      name: "plain",
      baseColor: [1, 1, 1, 1] as [number, number, number, number],
      roughness: 1,
      metallic: 0,
    },
    {
      name: "mapped",
      baseColor: [1, 1, 1, 1] as [number, number, number, number],
      roughness: 1,
      metallic: 0,
      textures: { normal: true as const },
    },
  ];
  const mesh = {
    normals: new Float32Array([0, 0, 0, 0, 0, 1, 0, 0, 1]),
    tangents: new Float32Array([0, 0, 0, 0, 1, 0, 0, -1, 1, 0, 0, 1]),
    materialIds: new Float32Array([0, 1, 1]),
  };
  expect(() => assertMappedTangentFrames(mesh, materials)).not.toThrow();
  for (const tangent of [
    [0, 0, 0, 1],
    [0, 0, 1, 1],
    [0, 0, -1, -1],
    [1, 0, 0, 0],
    [1, 0, 0, 0.5],
    [NaN, 0, 0, 1],
  ]) {
    const invalid = { ...mesh, tangents: new Float32Array(mesh.tangents) };
    invalid.tangents.set(tangent, 4);
    expect(() => assertMappedTangentFrames(invalid, materials)).toThrow(/normal-mapped vertex 1/);
  }
  const zeroNormal = { ...mesh, normals: new Float32Array(mesh.normals) };
  zeroNormal.normals.fill(0, 3, 6);
  expect(() => assertMappedTangentFrames(zeroNormal, materials)).toThrow(/normal-mapped vertex 1/);
});
