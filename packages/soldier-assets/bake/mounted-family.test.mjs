import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bakeGltf } from "./gltf.mjs";
import { gltfToEngineBasis } from "./engine-basis.mjs";
import {
  sampleRigLocalPose,
  composeMaskedLocals,
  localPoseToJointMatrices,
} from "../src/localPose.ts";
import { poseSoldierMesh } from "../src/skin.ts";
import {
  mountedPresentation,
  mountedLoopClips,
  mountedClipMetadata,
} from "./mounted-motion-contract.mjs";

const directory =
  process.argv[2] ?? new URL("../assets/source/mounted-family/", import.meta.url).pathname;
for (const name of ["shock-cavalry", "shock-cavalry-sidearm", "horse-archer"]) {
  const { rig, primitives } = gltfToEngineBasis(
    bakeGltf(await readFile(`${directory}/${name}.glb`)),
  );
  const presentation = mountedPresentation(name === "horse-archer");
  const mask = presentation.riderUpperBodyJoints.map((name) =>
    rig.bones.findIndex((bone) => bone.name === name),
  );
  const base = sampleRigLocalPose(rig, "walk", 0.37);
  const action = sampleRigLocalPose(rig, "melee", 0.5);
  const composed = localPoseToJointMatrices(rig, composeMaskedLocals(base, action, mask));
  const original = localPoseToJointMatrices(rig, base);
  for (const [joint, bone] of rig.bones.entries()) {
    if (
      bone.name.startsWith("mount-") ||
      /^(root|pelvis|thigh\.|shin\.|foot\.|toe\.|knee-volume\.)/.test(bone.name)
    )
      assert.deepEqual(
        composed.subarray(joint * 16, joint * 16 + 16),
        original.subarray(joint * 16, joint * 16 + 16),
        `${name}: upper combat must retain the traveling horse and seated ${bone.name}`,
      );
  }
  const hand = rig.bones.findIndex((bone) => bone.name === "hand.R");
  assert.ok(
    composed
      .subarray(hand * 16, hand * 16 + 16)
      .some((value, index) => Math.abs(value - original[hand * 16 + index]) > 0.001),
    `${name}: real rider action must change the weapon hand`,
  );
  console.log(`${name}: real upper action changes hand while horse and seated base remain exact`);
  const center = (clip, side, phase) => {
    const hoof = rig.bones.findIndex((bone) => bone.name === `mount-hind.${side}-foot`);
    const palette = localPoseToJointMatrices(rig, sampleRigLocalPose(rig, clip, phase));
    const total = [0, 0, 0];
    let count = 0;
    for (const mesh of primitives) {
      const posed = poseSoldierMesh(mesh, palette).positions;
      for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++)
        if (mesh.joints[vertex * 4] === hoof && mesh.weights[vertex * 4] === 1) {
          for (let axis = 0; axis < 3; axis++) total[axis] += posed[vertex * 3 + axis];
          count++;
        }
    }
    assert.ok(count > 0, `${name}: exported support hoof must retain weighted geometry`);
    return total.map((value) => value / count);
  };
  for (const [clip, side, from, to] of [
    ["walk", "L", 0.1, 0.3],
    ["run", "R", 0.03, 0.12],
  ]) {
    const a = center(clip, side, from),
      b = center(clip, side, to);
    const travel = Math.hypot(b[0] - a[0], b[1] - a[1]);
    assert.ok(
      Math.abs(travel - mountedClipMetadata(false)[clip].strideMeters * (to - from)) < 0.002,
      `${name}: measured ${clip} support travel ${travel} must match declared stride over the same interval`,
    );
    console.log(`${name}: ${clip} ${travel.toFixed(6)}m measured support interval`);
  }
  for (const clip of mountedLoopClips) {
    const start = localPoseToJointMatrices(rig, sampleRigLocalPose(rig, clip, 0));
    const end = localPoseToJointMatrices(rig, sampleRigLocalPose(rig, clip, 1));
    assert.ok(
      start.every((value, i) => Math.abs(value - end[i]) < 1e-5),
      `${name}: ${clip} loop seam`,
    );
  }
  const settled = sampleRigLocalPose(rig, "death", 0.9),
    terminal = sampleRigLocalPose(rig, "death", 1);
  assert.ok(
    settled.every((value, i) => Math.abs(value - terminal[i]) < 1e-6),
    `${name}: distinct authored terminal times retain a settled pose within export precision`,
  );
  console.log(`${name}: closed loops and distinct authored settled death times`);
}
