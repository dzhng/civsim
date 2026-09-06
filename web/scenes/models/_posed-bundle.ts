import {
  evaluatePlaybackPose,
  type SoldierPlayback,
} from "../../../packages/crowd-runtime/src/actionTimeline";
import type { AppearanceBundle } from "../../../packages/soldier-assets/src/appearanceBundle";
import {
  localPoseToJointMatrices,
  mat4Identity,
} from "../../../packages/soldier-assets/src/localPose";
import { bakeLocalAnimation } from "../../../packages/soldier-assets/src/localAnimation";
import { poseSoldierMesh } from "../../../packages/soldier-assets/src/skin";

/** CPU-composed geometry still uses production materials, world and skin shader.
 * An identity rig makes the GPU's pose calculation independent of the reference. */
export function posedBundle(source: AppearanceBundle, playback: SoldierPlayback): AppearanceBundle {
  const palette = localPoseToJointMatrices(source.rig, evaluatePlaybackPose(source, playback));
  return bundleAtPose(source, palette);
}

/** Also accepts a validated GPU readback to isolate palette consumption from sampling. */
export function bundleAtPose(source: AppearanceBundle, palette: Float32Array): AppearanceBundle {
  const cpu = structuredClone(source);
  const pose = (mesh: AppearanceBundle["farMesh"]) => ({
    ...mesh,
    ...poseSoldierMesh(mesh, palette),
    joints: new Uint16Array(mesh.joints.length),
    weights: Float32Array.from(mesh.weights, (_, index) => Number(index % 4 === 0)),
  });
  cpu.tiers = cpu.tiers.map(pose);
  cpu.farMesh = pose(cpu.farMesh);
  cpu.rig = {
    bones: [
      {
        name: "oracle",
        parent: -1,
        bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
        inverseBind: mat4Identity(),
      },
    ],
    clips: [{ name: "oracle", duration: 1, loop: true, tracks: {} }],
  };
  cpu.animation = bakeLocalAnimation(cpu.rig);
  cpu.manifest.presentation = null;
  cpu.manifest.far = { ...cpu.manifest.far, clip: "oracle", phase: 0 };
  return cpu;
}
