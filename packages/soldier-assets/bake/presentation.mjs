import { mat4FromTRS, sampleChannel } from './vat.mjs';

/** Source admission uses local transforms: inherited gait cannot qualify as a rider action. */
export function assertPresentationMotion(presentation, animation, rig) {
  if (!presentation) return;
  for (const role of ['melee', 'release', 'hit', 'death']) {
    const binding = presentation.actions[role];
    if (!binding) continue;
    const clip = rig.clips.find(clip => clip.name === binding.clip);
    const frames = animation.clips.find(clip => clip.name === binding.clip).frames;
    const joints = binding.layer === 'riderUpperBody'
      ? presentation.riderUpperBodyJoints.map(name => rig.bones.findIndex(bone => bone.name === name))
      : rig.bones.map((_, index) => index);
    const changed = joints.some(joint => {
      const track = clip.tracks[joint] || {};
      const bind = rig.bones[joint].bind;
      const sample = time => mat4FromTRS(
        track.T ? sampleChannel(track.T, time, 'vec3') : bind.T,
        track.R ? sampleChannel(track.R, time, 'quat') : bind.R,
        track.S ? sampleChannel(track.S, time, 'vec3') : bind.S,
      );
      const first = sample(0);
      for (let frame = 1; frame < frames; frame++) {
        if (sample(frame / (frames - 1) * clip.duration).some((value, component) => Math.abs(value - first[component]) > 1e-6)) return true;
      }
      return false;
    });
    if (!changed) throw new Error(`presentation ${role} clip ${clip.name} has no sampled motion in its action layer`);
  }
}
