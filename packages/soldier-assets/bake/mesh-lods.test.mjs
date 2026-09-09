import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bakeGltf, parseGlb } from "./gltf.mjs";
import { assertMappedTangentFrames } from "../src/skin.ts";
import { appearanceMaterials } from "./materials.mjs";

const paths = process.argv.slice(2);
assert.equal(paths.length, 3, "Pass the original, mid and coarse GLB paths");
const bytes = await Promise.all(paths.map((path) => readFile(path)));
const sources = bytes.map((data) => bakeGltf(data));
const triangles = sources.map((source) =>
  source.primitives.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0),
);
assert.ok(
  triangles[0] > triangles[1] && triangles[1] > triangles[2],
  `Actual mesh tiers must decrease: ${triangles}`,
);
// Reuse the production material owner: omitted distant fittings may remove a
// slot and renumber image indices, but retained factors/images/samplers cannot drift.
const parsed = bytes.map((data) => parseGlb(data));
const materials = appearanceMaterials({});
const sidedness = [];
for (const mesh of sources[0].primitives) {
  const slot = materials.slot(parsed[0].json, parsed[0].bin, mesh.materialIndex);
  (sidedness[slot] ??= new Set()).add(
    parsed[0].json.materials?.[mesh.materialIndex]?.doubleSided ?? false,
  );
}
const originalMaterialCount = materials.surface.materials.length;
for (let tier = 1; tier < sources.length; tier++) {
  assert.deepEqual(sources[tier].rig, sources[0].rig, `tier ${tier}: original rig/actions changed`);
  for (const mesh of sources[tier].primitives) {
    const slot = materials.slot(parsed[tier].json, parsed[tier].bin, mesh.materialIndex);
    assert.equal(materials.surface.materials.length, originalMaterialCount,
      `tier ${tier}: retained material differs from original source`);
    assert.ok(sidedness[slot].has(parsed[tier].json.materials?.[mesh.materialIndex]?.doubleSided ?? false),
      `tier ${tier}: authored material sidedness changed`);
    for (const field of ["positions", "normals", "tangents", "uvs", "weights"])
      assert.ok(mesh[field].every(Number.isFinite), `tier ${tier}: nonfinite ${field}`);
    assertMappedTangentFrames(
      { ...mesh, materialIds: new Uint32Array(mesh.positions.length / 3).fill(slot) },
      materials.surface.materials,
    );
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++) {
      const offset = vertex * 4;
      const weights = mesh.weights.subarray(offset, offset + 4);
      assert.ok(weights.every((weight) => weight >= 0 && weight <= 1));
      assert.ok(
        Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-6,
        `tier ${tier}: unnormalized skin at ${vertex}`,
      );
      assert.ok(
        mesh.joints
          .subarray(offset, offset + 4)
          .every((joint) => joint < sources[0].rig.bones.length),
      );
    }
  }
}
console.log(
  JSON.stringify({
    triangles,
    clips: sources[0].rig.clips.map((clip) => clip.name),
    invariant:
      "exact rig/actions and retained material/texture semantics; finite UV/tangent/normal/skin; normalized four-weight export",
  }),
);
