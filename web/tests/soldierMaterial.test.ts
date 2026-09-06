// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  packSoldierMaterials,
  readSoldierSurfaceAsset,
  type SoldierSurface,
} from "@packages/soldier-assets/src/material.ts";

function surface(): SoldierSurface<string> {
  return {
    materials: [
      { name: "neutral", baseColor: [0.25, 0.5, 0.75, 1], roughness: 0.5, metallic: 0.25 },
    ],
    textures: {
      orm: {
        image: "images/orm.png",
        mimeType: "image/png",
        sampler: {
          magFilter: "linear",
          minFilter: "nearest",
          mipmapFilter: "none",
          wrapS: "repeat",
          wrapT: "clamp-to-edge",
        },
      },
    },
  };
}

test("admitted material table preserves independent MR and occlusion usage in GPU rows", () => {
  const input = surface();
  input.materials.push(
    {
      name: "metallic-roughness-only",
      baseColor: [1, 0, 0.5, 1],
      roughness: 0.75,
      metallic: 1,
      textures: { metallicRoughness: true },
    },
    {
      name: "occlusion-only",
      baseColor: [0, 1, 0.25, 1],
      roughness: 1,
      metallic: 0,
      textures: { occlusion: true },
      occlusionStrength: 0.25,
    },
  );
  const admitted = readSoldierSurfaceAsset(JSON.parse(JSON.stringify(input)));
  // Each RGBA texel is one slot: albedo row, surface controls row, then independent map-use row.
  assert.deepEqual(
    Array.from(packSoldierMaterials(admitted.materials)),
    [
      [0.25, 0.5, 0.75, 1, 1, 0, 0.5, 1, 0, 1, 0.25, 1],
      [0.5, 0.25, 1, 1, 0.75, 1, 1, 1, 1, 0, 0.25, 1],
      [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    ].flat(),
  );
  delete input.materials[2].occlusionStrength;
  assert.deepEqual(
    Array.from(packSoldierMaterials(readSoldierSurfaceAsset(input).materials).slice(20, 24)),
    [1, 0, 1, 1],
    "enabled occlusion defaults to strength one when the author omits it",
  );
});

test("normal and base-color maps have independent flags and retain authored controls", () => {
  const input = surface();
  input.textures.baseColor = {
    ...input.textures.orm!,
    image: "images/albedo.jpg",
    mimeType: "image/jpeg",
  };
  input.textures.normal = { ...input.textures.orm!, image: "images/normal.png" };
  input.materials[0].textures = { baseColor: true };
  input.materials.push(
    {
      name: "normal-default",
      baseColor: [1, 1, 1, 1],
      roughness: 1,
      metallic: 0,
      textures: { normal: true },
    },
    {
      name: "scaled",
      baseColor: [1, 1, 1, 1],
      roughness: 1,
      metallic: 0,
      textures: { normal: true, occlusion: true },
      normalScale: -0.5,
      occlusionStrength: 0,
    },
  );
  const admitted = readSoldierSurfaceAsset(JSON.parse(JSON.stringify(input)));
  assert.deepEqual(
    admitted.textures,
    input.textures,
    "admission preserves declared image paths, MIME and sampling settings",
  );
  const packed = packSoldierMaterials(admitted.materials);
  assert.deepEqual(
    Array.from(packed.slice(12)),
    [
      [0.5, 0.25, 1, 1, 1, 0, 1, 1, 1, 0, 0, -0.5],
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],
    ].flat(),
  );
  input.materials[2].normalScale = 0;
  assert.equal(
    packSoldierMaterials(readSoldierSurfaceAsset(input).materials)[23],
    0,
    "zero normal strength is not replaced by the default",
  );
});

test("a material cannot declare a map without its appearance channel", () => {
  for (const usage of ["baseColor", "normal", "metallicRoughness", "occlusion"]) {
    const input = {
      materials: [{ ...surface().materials[0], textures: { [usage]: true } }],
      textures: {},
    };
    assert.throws(() => readSoldierSurfaceAsset(input), /invalid or missing/, usage);
  }
  assert.doesNotThrow(
    () => readSoldierSurfaceAsset({ materials: surface().materials, textures: {} }),
    "a genuinely untextured surface is valid",
  );
});

test("malformed present texture declarations reject instead of becoming absent maps", () => {
  for (const textures of [
    null,
    [],
    false,
    "normal",
    { normal: false },
    { normal: 1 },
    { normal: null },
    { emissive: true },
  ]) {
    const input = surface();
    assert.throws(
      () => readSoldierSurfaceAsset({ ...input, materials: [{ ...input.materials[0], textures }] }),
      /texture/,
      JSON.stringify(textures),
    );
  }
  for (const textures of [
    undefined,
    null,
    [],
    false,
    { emissive: surface().textures.orm },
    { orm: null },
    { orm: {} },
  ]) {
    assert.throws(
      () => readSoldierSurfaceAsset({ materials: surface().materials, textures }),
      /texture|surface/,
      JSON.stringify(textures),
    );
  }
  for (const change of [
    { image: "" },
    { image: 17 },
    { mimeType: "image/webp" },
    { mimeType: undefined },
  ]) {
    const input = surface();
    assert.throws(
      () =>
        readSoldierSurfaceAsset({
          ...input,
          textures: { orm: { ...input.textures.orm, ...change } },
        }),
      /PNG\/JPEG image reference/,
    );
  }
});

test("each sampler field is required and restricted to supported sampling behavior", () => {
  const input = surface();
  const texture = input.textures.orm!;
  for (const sampler of [undefined, null, [], false, "linear", 1]) {
    assert.throws(
      () => readSoldierSurfaceAsset({ ...input, textures: { orm: { ...texture, sampler } } }),
      /invalid sampler/,
      JSON.stringify(sampler),
    );
  }
  for (const [field, bad] of [
    ["magFilter", "cubic"],
    ["minFilter", "none"],
    ["mipmapFilter", "cubic"],
    ["wrapS", "clamp"],
    ["wrapT", "mirror"],
  ]) {
    for (const value of [bad, undefined, null, 0]) {
      assert.throws(
        () =>
          readSoldierSurfaceAsset({
            ...input,
            textures: { orm: { ...texture, sampler: { ...texture.sampler, [field]: value } } },
          }),
        /invalid sampler/,
        `${field}=${String(value)}`,
      );
    }
  }
  for (const mipmapFilter of ["none", "nearest", "linear"] as const) {
    for (const wrap of ["repeat", "clamp-to-edge", "mirror-repeat"] as const) {
      const sampler = {
        magFilter: "nearest",
        minFilter: "linear",
        mipmapFilter,
        wrapS: wrap,
        wrapT: wrap,
      };
      const admitted = readSoldierSurfaceAsset({
        ...input,
        textures: { orm: { ...texture, sampler } },
      });
      assert.deepEqual(admitted.textures.orm?.sampler, sampler);
    }
  }
});

test("nonfinite normal scale and out-of-range occlusion strength cannot enter GPU rows", () => {
  const input = surface();
  for (const normalScale of [NaN, Infinity, -Infinity, 1e300, -1e300, null, "1"]) {
    assert.throws(
      () =>
        readSoldierSurfaceAsset({ ...input, materials: [{ ...input.materials[0], normalScale }] }),
      /normal scale/,
    );
  }
  for (const occlusionStrength of [NaN, Infinity, -0.01, 1.01, null, "1"]) {
    assert.throws(
      () =>
        readSoldierSurfaceAsset({
          ...input,
          materials: [{ ...input.materials[0], occlusionStrength }],
        }),
      /occlusion strength/,
    );
  }
});
