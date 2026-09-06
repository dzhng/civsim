import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { bakeAppearance } from "./appearance.mjs";
import { bakeGltf, parseGlb } from "./gltf.mjs";
import { decodeSoldierMesh } from "../src/appearanceBundle.ts";
import { poseSoldierMesh } from "../src/skin.ts";
import {
  decodeLocalAnimation,
  decodeLocalSample,
  resolveLocalSample,
} from "../src/localAnimation.ts";
import { localPoseToJointMatrices } from "../src/localPose.ts";

const root = new URL("../assets/test/material-swatches/", import.meta.url);
const bytes = await readFile(new URL("swatches.glb", root));
const oracle = JSON.parse(await readFile(new URL("swatches.landmarks.json", root), "utf8"));
assert.equal(createHash("sha256").update(bytes).digest("hex"), oracle.glbSha256);
const options = {
  presentation: null,
  name: "six-material-swatches",
  mounted: false,
  tiers: [bytes, bytes, bytes],
  loopClips: [],
};
const files = bakeAppearance(options);
assert.deepEqual(bakeAppearance(options), files);
const { materials, textures } = files["materials.json"];
assert.deepEqual(materials.map((m) => m.name).sort(), [
  "cloth",
  "leather",
  "mail",
  "metal",
  "skin",
  "wood",
]);
assert.deepEqual(Object.keys(textures).sort(), ["baseColor", "normal", "orm"]);
const { json, bin } = parseGlb(bytes);
for (const texture of Object.values(textures)) {
  const image = files[texture.image];
  assert.ok(
    json.images.some((source) => {
      const view = json.bufferViews[source.bufferView];
      return image.equals(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength));
    }),
    "emitted channel bytes are preserved from the actual Blender GLB",
  );
  assert.deepEqual(texture.sampler, {
    magFilter: "nearest",
    minFilter: "nearest",
    mipmapFilter: "nearest",
    wrapS: "repeat",
    wrapT: "repeat",
  });
}
const factors = {
  skin: [0.65, 0, 0.25],
  cloth: [0.95, 0, 0.65],
  leather: [0.72, 0, 0.45],
  mail: [0.58, 1, 0.85],
  wood: [0.8, 0, 0.5],
  metal: [0.25, 1, 0.2],
};
for (const material of materials) {
  assert.deepEqual(material.textures, {
    baseColor: true,
    normal: true,
    metallicRoughness: true,
    occlusion: true,
  });
  const expected = factors[material.name];
  [material.roughness, material.metallic, material.normalScale].forEach((value, index) =>
    assert.ok(Math.abs(value - expected[index]) < 1e-6),
  );
  assert.equal(material.occlusionStrength, 1);
}
const source = bakeGltf(bytes);
const animation = decodeLocalAnimation(files["animation.json"]);
const rig = files["skeleton.json"];
const paletteAt = (name, phase) =>
  localPoseToJointMatrices(
    rig,
    decodeLocalSample(animation, resolveLocalSample(animation, name, phase)),
  );
let checkedVertices = 0,
  maximumError = 0,
  minimumHeight = Infinity;
for (const sample of oracle.samples) {
  const clip = animation.clips.find((clip) => clip.name === sample.clip);
  const palette = paletteAt(clip.name, sample.seconds / clip.duration);
  for (const path of files["appearance.json"].tiers) {
    const mesh = decodeSoldierMesh(files[path]);
    const posed = poseSoldierMesh(mesh, palette);
    let offset = 0;
    for (const primitive of source.primitives) {
      const mapping = oracle.meshes.find(
        (item) => item.node === primitive.nodeName && item.primitive === primitive.primitiveIndex,
      );
      for (let vertex = 0; vertex < primitive.positions.length / 3; vertex++) {
        const [x, y, z] = sample.positions[mapping.node][mapping.sourceVertexByGltfVertex[vertex]];
        const expected = [x, -z, y];
        const actual = posed.positions.subarray((offset + vertex) * 3, (offset + vertex + 1) * 3);
        const error = Math.hypot(...actual.map((value, axis) => value - expected[axis]));
        maximumError = Math.max(maximumError, error);
        minimumHeight = Math.min(minimumHeight, actual[2]);
        assert.ok(
          error < oracle.toleranceMetres,
          `${sample.name}/${mapping.node}/${vertex}: ${error}m`,
        );
        checkedVertices++;
      }
      offset += primitive.positions.length / 3;
    }
  }
}
assert.ok(minimumHeight > 0.5, "source geometry stays outside production contact darkening");
const mesh = decodeSoldierMesh(files["tier-0.mesh.json"]);
for (const clip of animation.clips)
  for (let frame = 0; frame <= Math.round(clip.duration * 24); frame++) {
    const posed = poseSoldierMesh(
      mesh,
      paletteAt(clip.name, frame / Math.max(1, Math.round(clip.duration * 24))),
    );
    for (let i = 2; i < posed.positions.length; i += 3) assert.ok(posed.positions[i] > 0.5);
  }
console.log(
  JSON.stringify({
    samples: oracle.samples.length,
    checkedVertices,
    maximumError,
    minimumHeight,
    materialSlots: materials.length,
    imageChannels: Object.keys(textures).length,
  }),
);
