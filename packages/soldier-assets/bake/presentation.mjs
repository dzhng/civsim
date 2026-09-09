import { mat4FromTRS, sampleRigLocalPoseSeconds } from "../src/localPose.ts";

/** Source admission uses local transforms: inherited gait cannot qualify as a rider action. */
export function assertPresentationMotion(presentation, animation, rig) {
  if (!presentation) return;
  for (const role of ["melee", "release", "hit", "death"]) {
    const binding = presentation.actions[role];
    if (!binding) continue;
    const clip = rig.clips.find((clip) => clip.name === binding.clip);
    const times = animation.clips.find((clip) => clip.name === binding.clip).times;
    const joints =
      binding.layer === "riderUpperBody"
        ? presentation.riderUpperBodyJoints.map((name) =>
            rig.bones.findIndex((bone) => bone.name === name),
          )
        : rig.bones.map((_, index) => index);
    const matrices = (seconds) => {
      const pose = sampleRigLocalPoseSeconds(rig, clip.name, seconds);
      return joints.map((joint) => {
        const offset = joint * 10;
        return mat4FromTRS(
          pose.subarray(offset, offset + 3),
          pose.subarray(offset + 3, offset + 7),
          pose.subarray(offset + 7, offset + 10),
        );
      });
    };
    const first = matrices(0);
    let changed = false;
    for (let frame = 1; frame < times.length && !changed; frame++) {
      changed = matrices(times[frame]).some((matrix, joint) =>
        matrix.some((value, component) => Math.abs(value - first[joint][component]) > 1e-6),
      );
    }
    if (!changed)
      throw new Error(
        `presentation ${role} clip ${clip.name} has no sampled motion in its action layer`,
      );
  }
}
