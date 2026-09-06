import type { ImportedRig } from "./rig";
import { assertClipMarkers, type ClipMarkers } from "./schema.ts";
import { blendLocalPoses, sampleRigLocalPoseSeconds, type LocalPose } from "./localPose.ts";

/** Three vec4s: Txyz/0, Rxyzw, Sxyz/0. Shared by animation and frozen GPU poses. */
export const LOCAL_ANIMATION_FLOATS_PER_JOINT = 12;
/** Per-joint channel bits; STEP chooses A even when the rounded fraction is one. */
export const LOCAL_STEP_T = 1,
  LOCAL_STEP_R = 2,
  LOCAL_STEP_S = 4;

export interface LocalAnimationClip {
  name: string;
  start: number;
  /** Exact CPU seconds, strictly increasing; a static clip may have one sample. */
  times: number[];
  duration: number;
  loop: boolean;
  markers?: ClipMarkers;
  stepMaskOffset: number;
}

export interface LocalAnimation {
  bones: number;
  clips: LocalAnimationClip[];
  /** Sample-major, then source joint order, then three vec4s. */
  data: Float32Array;
  stepMasks: Uint32Array;
}

/** Four scalar words for GPU transport; sample indices address whole local poses. */
export interface ResolvedLocalSample {
  sampleA: number;
  sampleB: number;
  fraction: number;
  stepMaskOffset: number;
}

/** Same packing for authored samples and controller-owned frozen local poses. */
export function packLocalPose(locals: LocalPose | readonly number[]): Float32Array {
  if (locals.length % 10 !== 0) throw new Error("local poses require a T3/R4/S3 joint layout");
  const data = new Float32Array((locals.length / 10) * LOCAL_ANIMATION_FLOATS_PER_JOINT);
  for (let joint = 0; joint < locals.length / 10; joint++) {
    const input = joint * 10,
      output = joint * LOCAL_ANIMATION_FLOATS_PER_JOINT;
    for (let axis = 0; axis < 3; axis++) {
      data[output + axis] = locals[input + axis];
      data[output + 8 + axis] = locals[input + 7 + axis];
    }
    for (let component = 0; component < 4; component++)
      data[output + 4 + component] = locals[input + 3 + component];
  }
  if (data.some((value) => !Number.isFinite(value)))
    throw new Error("local animation values must be finite in Float32");
  return data;
}

export function bakeLocalAnimation(rig: ImportedRig): LocalAnimation {
  const clips: LocalAnimationClip[] = [];
  const masks: number[] = [];
  let totalSamples = 0;
  for (const clip of rig.clips) {
    if (!Number.isFinite(clip.duration) || clip.duration < 0)
      throw new Error("local clip duration must be finite and nonnegative");
    if (clips.some((other) => other.name === clip.name))
      throw new Error(`duplicate local clip ${clip.name}`);
    assertClipMarkers(clip.markers);
    const times = new Set([0, clip.duration]);
    const stepMaskOffset = masks.length;
    for (let joint = 0; joint < rig.bones.length; joint++) {
      let bits = 0;
      for (const [field, width, bit] of [
        ["T", 3, LOCAL_STEP_T],
        ["R", 4, LOCAL_STEP_R],
        ["S", 3, LOCAL_STEP_S],
      ] as const) {
        const channel = clip.tracks[joint]?.[field];
        if (!channel) continue;
        if (
          channel.interpolation !== undefined &&
          channel.interpolation !== "LINEAR" &&
          channel.interpolation !== "STEP"
        )
          throw new Error("local animation supports LINEAR or STEP channels only");
        if (
          channel.times.length === 0 ||
          channel.values.length !== channel.times.length * width ||
          channel.times.some(
            (time, i) =>
              !Number.isFinite(time) || time < 0 || (i > 0 && time <= channel.times[i - 1]),
          ) ||
          channel.values.some((value) => !Number.isFinite(value))
        )
          throw new Error(`invalid local channel ${clip.name}/${joint}/${field}`);
        for (const time of channel.times) if (time <= clip.duration) times.add(time);
        if (channel.interpolation === "STEP") bits |= bit;
      }
      masks.push(bits);
    }
    if (
      Object.keys(clip.tracks).some(
        (joint) =>
          !Number.isInteger(Number(joint)) ||
          Number(joint) < 0 ||
          Number(joint) >= rig.bones.length,
      )
    )
      throw new Error(`local clip ${clip.name} references a missing joint`);
    clips.push({
      name: clip.name,
      start: totalSamples,
      times: [...times].sort((a, b) => a - b),
      duration: clip.duration,
      loop: clip.loop ?? false,
      ...(clip.markers ? { markers: { ...clip.markers } } : {}),
      stepMaskOffset,
    });
    totalSamples += times.size;
  }
  const data = new Float32Array(totalSamples * rig.bones.length * LOCAL_ANIMATION_FLOATS_PER_JOINT);
  for (const clip of clips)
    for (let sample = 0; sample < clip.times.length; sample++) {
      const locals = sampleRigLocalPoseSeconds(rig, clip.name, clip.times[sample]);
      data.set(
        packLocalPose(locals),
        (clip.start + sample) * rig.bones.length * LOCAL_ANIMATION_FLOATS_PER_JOINT,
      );
    }
  return { bones: rig.bones.length, clips, data, stepMasks: Uint32Array.from(masks) };
}

export function resolveLocalSample(
  animation: LocalAnimation,
  name: string,
  phase: number,
): ResolvedLocalSample {
  const clip = animation.clips.find((clip) => clip.name === name);
  if (!clip) throw new Error(`missing local clip ${name}`);
  if (!Number.isFinite(phase)) throw new Error("local animation phase must be finite");
  const time = Math.max(0, Math.min(1, phase)) * clip.duration;
  const last = clip.times.length - 1;
  if (time >= clip.times[last])
    return {
      sampleA: clip.start + last,
      sampleB: clip.start + last,
      fraction: 0,
      stepMaskOffset: clip.stepMaskOffset,
    };
  // Upper bound chooses the right-hand interval at an exact key, before Float32 packing.
  let low = 0,
    high = clip.times.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (clip.times[mid] <= time) low = mid + 1;
    else high = mid;
  }
  const index = Math.max(0, low - 1);
  return {
    sampleA: clip.start + index,
    sampleB: clip.start + index + 1,
    fraction: Math.fround((time - clip.times[index]) / (clip.times[index + 1] - clip.times[index])),
    stepMaskOffset: clip.stepMaskOffset,
  };
}

/** CPU encoding oracle: shares quaternion math, not a claim about future GPU arithmetic. */
export function decodeLocalSample(
  animation: LocalAnimation,
  sample: ResolvedLocalSample,
): LocalPose {
  const unpack = (index: number) => {
    const pose = new Float64Array(animation.bones * 10);
    for (let joint = 0; joint < animation.bones; joint++) {
      const input = (index * animation.bones + joint) * LOCAL_ANIMATION_FLOATS_PER_JOINT,
        output = joint * 10;
      pose.set(animation.data.subarray(input, input + 3), output);
      pose.set(animation.data.subarray(input + 4, input + 8), output + 3);
      pose.set(animation.data.subarray(input + 8, input + 11), output + 7);
    }
    return pose;
  };
  const a = unpack(sample.sampleA),
    b = unpack(sample.sampleB);
  const pose = blendLocalPoses(a, b, sample.fraction);
  for (let joint = 0; joint < animation.bones; joint++) {
    const bits = animation.stepMasks[sample.stepMaskOffset + joint],
      offset = joint * 10;
    if (bits & LOCAL_STEP_T) pose.set(a.subarray(offset, offset + 3), offset);
    if (bits & LOCAL_STEP_R) pose.set(a.subarray(offset + 3, offset + 7), offset + 3);
    if (bits & LOCAL_STEP_S) pose.set(a.subarray(offset + 7, offset + 10), offset + 7);
  }
  return pose;
}
