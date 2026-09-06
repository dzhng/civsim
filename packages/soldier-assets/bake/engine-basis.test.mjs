import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bakeGltf } from "./gltf.mjs";
import { bakeRig } from "./vat.mjs";
import { gltfToEngineBasis } from "./engine-basis.mjs";
import { poseSoldierMesh } from "../src/skin.ts";

for (const name of ["human", "mounted"]) {
  const root = new URL(`../assets/test/blender-reference/${name}`, import.meta.url);
  const source = bakeGltf(await readFile(new URL(root.href + ".glb")), { fps: 24 });
  const expected = JSON.parse(await readFile(new URL(root.href + ".landmarks.json"), "utf8"));
  const converted = gltfToEngineBasis(source);
  const baked = bakeRig(converted.rig, 24);
  const sourceBake = bakeRig(source.rig, 24);
  let maximum = 0,
    checked = 0;
  for (const sample of expected.samples) {
    const clip = baked.clips.find((candidate) => candidate.name === sample.clip);
    if (!clip) continue; // Composed poses are checked independently in the source oracle.
    const sourceClip = converted.rig.clips.find((candidate) => candidate.name === sample.clip);
    const frame =
      clip.start + Math.round((sample.seconds / sourceClip.duration) * (clip.frames - 1));
    for (const primitive of converted.primitives) {
      const mapping = expected.meshes.find(
        (mesh) => mesh.node === primitive.nodeName && mesh.primitive === primitive.primitiveIndex,
      );
      const posed = poseSoldierMesh(primitive, baked, frame);
      const sourcePrimitive = source.primitives.find(
        (candidate) =>
          candidate.nodeIndex === primitive.nodeIndex &&
          candidate.primitiveIndex === primitive.primitiveIndex,
      );
      const sourcePose = poseSoldierMesh(sourcePrimitive, sourceBake, frame);
      for (let vertex = 0; vertex < posed.tangents.length / 4; vertex++) {
        const t = vertex * 4;
        const expectedTangent = [
          sourcePose.tangents[t],
          -sourcePose.tangents[t + 2],
          sourcePose.tangents[t + 1],
        ];
        assert.ok(
          Math.hypot(...expectedTangent.map((value, axis) => value - posed.tangents[t + axis])) <
            1e-5,
          `${name}/${sample.name}: tangent survives rotated ancestry and engine basis`,
        );
        assert.equal(posed.tangents[t + 3], sourcePrimitive.tangents[t + 3]);
      }
      for (let i = 0; i < mapping.sourceVertexByGltfVertex.length; i++) {
        const [x, y, z] = sample.positions[primitive.nodeName][mapping.sourceVertexByGltfVertex[i]];
        const distance = Math.hypot(
          posed.positions[i * 3] - x,
          posed.positions[i * 3 + 1] + z,
          posed.positions[i * 3 + 2] - y,
        );
        maximum = Math.max(maximum, distance);
        assert.ok(
          distance < expected.toleranceMetres,
          `${name}/${sample.name}/${primitive.nodeName}: ${distance}m`,
        );
        checked++;
      }
    }
  }
  assert.ok(checked > 0);
  console.log(`${name}: engine-basis ${checked} surface points, maximum ${maximum}m`);
}
