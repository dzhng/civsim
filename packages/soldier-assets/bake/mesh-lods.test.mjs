import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bakeGltf, parseGlb } from "./gltf.mjs";

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
const materials = bytes.map((data) => parseGlb(data).json.materials);
for (let tier = 1; tier < sources.length; tier++) {
  assert.deepEqual(sources[tier].rig, sources[0].rig, `tier ${tier}: original rig/actions changed`);
  assert.deepEqual(materials[tier], materials[0], `tier ${tier}: authored materials changed`);
  for (const mesh of sources[tier].primitives) {
    for (const field of ["positions", "normals", "tangents", "uvs", "weights"])
      assert.ok(mesh[field].every(Number.isFinite), `tier ${tier}: nonfinite ${field}`);
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
      "exact rig/actions/materials; finite UV/tangent/normal/skin; normalized four-weight export",
  }),
);
