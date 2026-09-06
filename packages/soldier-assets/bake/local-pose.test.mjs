import assert from "node:assert/strict";
import {
  sampleRigLocalPose,
  blendLocalPoses,
  composeMaskedLocals,
  localPoseToJointMatrices,
} from "../src/localPose.ts";
import { readFile } from "node:fs/promises";
import { bakeGltf } from "./gltf.mjs";
import { decodeSoldierMesh } from "../src/appearanceBundle.ts";
import { poseSoldierMesh } from "../src/skin.ts";

const rig = {
  bones: [
    {
      name: "root",
      parent: -1,
      bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
      inverseBind: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
  ],
  clips: [
    {
      name: "move",
      duration: 2,
      loop: false,
      tracks: { 0: { T: { times: [0, 2], values: [0, 0, 0, 4, 0, 0] } } },
    },
  ],
};
assert.equal(sampleRigLocalPose(rig, "move", 0.25)[0], 1);
assert.equal(localPoseToJointMatrices(rig, sampleRigLocalPose(rig, "move", 1))[12], 4);
const start = sampleRigLocalPose(rig, "move", 0),
  end = sampleRigLocalPose(rig, "move", 1);
assert.equal(blendLocalPoses(start, end, 0.375)[0], 1.5);
const frozen = blendLocalPoses(start, end, 0.375);
assert.deepEqual(
  blendLocalPoses(frozen, end, 0),
  frozen,
  "an interrupted blend starts at the exact frozen pose",
);
assert.notEqual(
  blendLocalPoses(frozen, end, 0),
  frozen,
  "snapshots do not alias controller-owned inputs",
);
assert.deepEqual(start, sampleRigLocalPose(rig, "move", 0));
assert.deepEqual(end, sampleRigLocalPose(rig, "move", 1));

const step = structuredClone(rig);
step.clips[0].loop = true;
step.clips[0].tracks[0].T = {
  interpolation: "STEP",
  times: [0, 1, 2],
  values: [0, 0, 0, 8, 0, 0, 4, 0, 0],
};
for (const [phase, expected] of [
  [-0.1, 0],
  [0.499999, 0],
  [0.5, 8],
  [0.500001, 8],
  [1, 4],
  [1.1, 4],
]) {
  assert.equal(
    sampleRigLocalPose(step, "move", phase)[0],
    expected,
    "STEP boundaries and explicit loop endpoint are preserved",
  );
}
const q = Math.SQRT1_2;
const a = start.slice(),
  b = start.slice();
a.set([0, 0, -q, q], 3);
b.set([0, 0, q, q], 3);
const hierarchy = structuredClone(rig);
hierarchy.bones.push({
  ...structuredClone(rig.bones[0]),
  name: "child",
  parent: 0,
  bind: { T: [1, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
});
const child = new Float64Array([1, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
const aa = new Float64Array([...a, ...child]),
  bb = new Float64Array([...b, ...child]);
const palette = localPoseToJointMatrices(hierarchy, blendLocalPoses(aa, bb, 0.5));
assert.ok(
  Math.abs(palette[28] - 1) < 1e-6 && Math.abs(palette[29]) < 1e-6,
  "local rotation blending preserves child reach instead of collapsing world matrices",
);
const opposite = a.slice();
opposite.set(
  Array.from(a.subarray(3, 7), (value) => -value),
  3,
);
const same = blendLocalPoses(a, opposite, 0.37);
assert.ok(Math.abs(Math.hypot(...same.subarray(3, 7)) - 1) < 1e-12);
assert.ok(
  localPoseToJointMatrices(rig, same).every(
    (value, i) => Math.abs(value - localPoseToJointMatrices(rig, a)[i]) < 1e-7,
  ),
  "opposite quaternion signs represent the same shortest-arc pose within Float32 composition precision",
);
const composed = composeMaskedLocals(aa, bb, [1]);
assert.deepEqual(composed.subarray(0, 10), aa.subarray(0, 10));
assert.deepEqual(composed.subarray(10), bb.subarray(10));
assert.notEqual(composed.buffer, aa.buffer);
assert.throws(() => sampleRigLocalPose(rig, "absent", 0), /missing rig clip/);
assert.throws(() => sampleRigLocalPose(rig, "move", NaN), /finite/);
assert.throws(() => blendLocalPoses(start, end, 2), /weight/);
assert.throws(() => blendLocalPoses(start, aa, 0.5), /layout/);
assert.throws(() => composeMaskedLocals(start, end, [1]), /missing joint/);
assert.throws(() => localPoseToJointMatrices(hierarchy, start), /skeleton/);

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const candidate = "../assets/candidates/blender-reference/mounted/";
const mountedRig = await json(`${candidate}skeleton.json`);
const metadata = await json("../assets/test/blender-reference/mounted.landmarks.json");
const source = bakeGltf(await readFile(new URL(`${candidate}source/tier-0.glb`, import.meta.url)));
const mask = metadata.riderUpperBodyMask.map((name) =>
  mountedRig.bones.findIndex((bone) => bone.name === name),
);
let maximumError = 0,
  vertices = 0;
for (const sample of metadata.samples) {
  const locals =
    sample.clip === "composed"
      ? composeMaskedLocals(
          sampleRigLocalPose(mountedRig, "gait", sample.seconds),
          sampleRigLocalPose(mountedRig, "rider-action", sample.seconds),
          mask,
        )
      : sampleRigLocalPose(
          mountedRig,
          sample.clip,
          sample.seconds / mountedRig.clips.find((clip) => clip.name === sample.clip).duration,
        );
  const matrices = localPoseToJointMatrices(mountedRig, locals);
  for (let tier = 0; tier < 3; tier++) {
    const mesh = decodeSoldierMesh(await json(`${candidate}tier-${tier}.mesh.json`));
    const posed = poseSoldierMesh(mesh, matrices);
    let offset = 0;
    for (const primitive of source.primitives) {
      const mapping = metadata.meshes.find(
        (map) => map.node === primitive.nodeName && map.primitive === primitive.primitiveIndex,
      );
      for (let vertex = 0; vertex < primitive.positions.length / 3; vertex++) {
        const [x, y, z] = sample.positions[mapping.node][mapping.sourceVertexByGltfVertex[vertex]];
        const actual = posed.positions.subarray((offset + vertex) * 3, (offset + vertex + 1) * 3);
        const error = Math.hypot(actual[0] - x, actual[1] + z, actual[2] - y);
        assert.ok(error < metadata.toleranceMetres, `${sample.name}/${mapping.node}: ${error}m`);
        maximumError = Math.max(maximumError, error);
        vertices++;
      }
      offset += primitive.positions.length / 3;
    }
  }
}
console.log(
  JSON.stringify({
    candidate: 41,
    samples: metadata.samples.length,
    vertices,
    maximumError,
    localBlending: true,
    step: true,
    shortestArc: true,
  }),
);
