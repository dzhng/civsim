import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bakeAppearance } from "./appearance.mjs";
import { bakeGltf } from "./gltf.mjs";
import { editGlb } from "./test-harness/glb.mjs";
import { assertMappedTangentFrames, poseSoldierMesh } from "../src/skin.ts";
import { localPoseToJointMatrices, sampleRigLocalPose } from "../src/localPose.ts";

const human = await readFile(
  new URL("../assets/test/blender-reference/human.glb", import.meta.url),
);
const bake = (source) =>
  bakeAppearance({
    presentation: null,
    name: "tangent-diagnostic",
    tiers: [source, source, source, source],
    loopClips: [],
  });
const collapse = editGlb(human, (json, bin) => {
  const write = (index, values) => {
    const accessor = json.accessors[index],
      view = json.bufferViews[accessor.bufferView];
    const width = { VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type];
    assert.equal(accessor.componentType, 5126);
    for (let vertex = 0; vertex < accessor.count; vertex++) {
      const row = values(vertex, accessor.count);
      for (let axis = 0; axis < width; axis++)
        bin.writeFloatLE(
          row[axis],
          (view.byteOffset ?? 0) +
            (accessor.byteOffset ?? 0) +
            vertex * (view.byteStride ?? width * 4) +
            axis * 4,
        );
    }
  };
  for (const node of json.nodes) {
    delete node.rotation;
    delete node.translation;
    delete node.scale;
  }
  write(json.skins[0].inverseBindMatrices, () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const animation = json.animations[0];
  const animated = animation.channels.find(
    (channel) =>
      channel.target.path === "rotation" &&
      json.accessors[animation.samplers[channel.sampler].output].count > 1,
  );
  const sampler = animation.samplers[animated.sampler];
  write(sampler.output, (sample, count) => (sample === count - 1 ? [0, 0, 1, 0] : [0, 0, 0, 1]));
  sampler.interpolation = "STEP";
  json.animations = [
    {
      name: "collapse",
      samplers: [sampler],
      channels: [{ sampler: 0, target: { node: json.skins[0].joints[1], path: "rotation" } }],
    },
  ];
  for (const mesh of json.meshes)
    for (const primitive of mesh.primitives) {
      const attrs = primitive.attributes;
      write(attrs.NORMAL, () => [1, 0, 0]);
      write(attrs.TANGENT, () => [0, 1, 0, -1]);
      write(attrs.WEIGHTS_0, () => [0.5, 0.5, 0, 0]);
      const accessor = json.accessors[attrs.JOINTS_0],
        view = json.bufferViews[accessor.bufferView];
      assert.equal(accessor.componentType, 5121);
      for (let vertex = 0; vertex < accessor.count; vertex++)
        bin.set(
          [0, 1, 0, 0],
          (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + vertex * (view.byteStride ?? 4),
        );
    }
});
// Bind is valid; the final sample blends exactly opposite root/child directions.
const imported = bakeGltf(collapse);
const material = {
  name: "mapped",
  baseColor: [1, 1, 1, 1],
  roughness: 1,
  metallic: 0,
  textures: { normal: true },
};
const primitive = imported.primitives[0];
const materialIds = new Float32Array(primitive.positions.length / 3);
assert.doesNotThrow(() => assertMappedTangentFrames({ ...primitive, materialIds }, [material]));
const last = poseSoldierMesh(
  primitive,
  localPoseToJointMatrices(imported.rig, sampleRigLocalPose(imported.rig, "collapse", 1)),
);
assert.deepEqual(Array.from(last.tangents.slice(0, 4)), [0, 0, 0, -1]);
assert.doesNotThrow(
  () => bake(collapse),
  "unmapped diagnostic retains the existing degenerate blended-normal path",
);
const mapped = editGlb(collapse, (json) => {
  for (const material of json.materials) material.normalTexture = { index: 0 };
});
assert.throws(
  () => bake(mapped),
  /normal-mapped vertex/,
  "complete source bake must inspect sampled frames, not only bind",
);
const badBind = editGlb(mapped, (json, bin) => {
  const accessor = json.accessors[json.meshes[0].primitives[0].attributes.TANGENT];
  const view = json.bufferViews[accessor.bufferView];
  bin.writeFloatLE(0, (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + 12);
});
assert.throws(
  () => bake(badBind),
  /normal-mapped vertex/,
  "source bake rejects invalid mapped bind handedness",
);
console.log(
  "posed tangent source admission: valid bind, collapsed mapped sample rejected, unmapped sample retained",
);
