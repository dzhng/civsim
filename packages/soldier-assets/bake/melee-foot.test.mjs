import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bakeGltf } from "./gltf.mjs";
import {
  sampleRigLocalPoseSeconds,
  localPoseToJointMatrices,
  transformPoint,
} from "../src/localPose.ts";
import { bakeLocalAnimation } from "../src/localAnimation.ts";
import { assertAppearancePresentation } from "../src/presentation.ts";
import { meleeFootMotionBake, meleeFootPresentation } from "./melee-foot-contract.mjs";

const sourceRoot = new URL("../assets/source/", import.meta.url);
const load = async (name) => bakeGltf(await readFile(new URL(`${name}/${name}.glb`, sourceRoot)));
const heavy = await load("heavy-kit"),
  medium = await load("medium-phalanx");
for (const name of ["light-spear", "heavy-spear", "medium-spear", "longsword"]) {
  const { rig } = await load(name);
  const sword = name === "longsword",
    donor = sword ? medium.rig : heavy.rig;
  assert.deepEqual(rig.bones, donor.bones, `${name}: unchanged fitted rest rig`);
  const metadata = meleeFootMotionBake(name);
  for (const clip of rig.clips) {
    const original = sword
      ? ({
          "twohand-ready": "pike-ready",
          "twohand-carry": "pike-carry",
          "sword-effort": "pike-thrust",
        }[clip.name] ?? clip.name)
      : clip.name === "spear-effort"
        ? "sword-effort"
        : clip.name;
    for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
      const actual = sampleRigLocalPoseSeconds(rig, clip.name, phase * clip.duration);
      const expected = sampleRigLocalPoseSeconds(donor, original, phase * clip.duration);
      for (const [index, bone] of rig.bones.entries()) {
        if (
          sword &&
          !["bend", "pronation", "bend-pronation", "ready", "twohand-carry"].includes(clip.name) &&
          ["upper-arm.L", "forearm.L", "hand.L", "elbow-volume.L"].includes(bone.name)
        )
          continue;
        if (
          !sword &&
          (["upper-arm.R", "forearm.R", "hand.R", "elbow-volume.R"].includes(bone.name) ||
            (name === "heavy-spear" && clip.name === "death" && bone.name === "head"))
        )
          continue;
        assert.deepEqual(
          actual.slice(index * 10, index * 10 + 10),
          expected.slice(index * 10, index * 10 + 10),
          `${name}/${clip.name}/${bone.name}/${phase}`,
        );
      }
    }
    clip.loop = metadata.loopClips.includes(clip.name);
    Object.assign(clip, metadata.clipMetadata[clip.name]);
  }
  const animation = bakeLocalAnimation(rig),
    presentation = meleeFootPresentation(name);
  assertAppearancePresentation(presentation, rig, animation, false);
  assert.equal(presentation.actions.release, null);
  assert.equal(presentation.actions.pikeReady, null);
  if (sword) {
    for (const binding of Object.values(presentation.actions).filter(Boolean)) {
      const clip = rig.clips.find((clip) => clip.name === binding.clip);
      for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
        const palette = localPoseToJointMatrices(
          rig,
          sampleRigLocalPoseSeconds(rig, clip.name, clip.duration * phase),
        );
        const matrix = (side) => {
          const joint = rig.bones.findIndex((bone) => bone.name === `hand.${side}`);
          return palette.subarray(joint * 16, joint * 16 + 16);
        };
        // Exported bind coordinates of the fitted hand centers and shaft axis.
        const right = transformPoint(matrix("R"), [0.5732, 0.9024, -0.051]);
        const left = transformPoint(matrix("L"), [-0.5732, 0.9024, -0.051]);
        const end = transformPoint(matrix("R"), [1.3732, 1.5024, -0.051]);
        const axis = end.map((value, i) => value - right[i]);
        const relative = left.map((value, i) => value - right[i]);
        const along = relative.reduce((sum, value, i) => sum + value * axis[i], 0);
        const off = Math.hypot(...relative.map((value, i) => value - along * axis[i]));
        assert.ok(
          along > 0.04 && along < 0.36 && off < 0.008,
          `${name}/${clip.name}/${phase}: left hand must hold hilt, along=${along}, off=${off}`,
        );
      }
    }
  }
  const effort = presentation.actions.melee.clip;
  const duration = rig.clips.find((clip) => clip.name === effort).duration;
  assert.notDeepEqual(
    sampleRigLocalPoseSeconds(rig, effort, 0),
    sampleRigLocalPoseSeconds(rig, effort, duration * 0.4),
    `${name}: actual effort motion`,
  );
}
console.log("PASS: four fitted rigs, retained body/action controls and actual melee presentations");
