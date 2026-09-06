import type { ImportedRig } from "./rig";
import { assertClipMarkers, type ClipMarkers } from "./schema.ts";
import { blendLocalPoses, sampleRigLocalPoseSeconds, type LocalPose } from "./localPose.ts";

/** Three vec4s: Txyz/0, Rxyzw, Sxyz/0. Shared by animation and frozen GPU poses. */
export const LOCAL_ANIMATION_FLOATS_PER_JOINT = 12;
/** Per-joint channel bits; STEP chooses A even when the rounded fraction is one. */
export const LOCAL_STEP_T = 1,
  LOCAL_STEP_R = 2,
  LOCAL_STEP_S = 4;
export const LOCAL_QUATERNION_NORM_TOLERANCE = 1e-4;
export function isAdmittedLocalQuaternion(values: ArrayLike<number>, offset = 0): boolean {
  const norm = Math.hypot(
    values[offset],
    values[offset + 1],
    values[offset + 2],
    values[offset + 3],
  );
  return Number.isFinite(norm) && Math.abs(norm - 1) <= LOCAL_QUATERNION_NORM_TOLERANCE;
}

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

/** JSON transport only; decoded arrays have one identity per load transaction. */
export type LocalAnimationAsset = Omit<LocalAnimation, "data" | "stepMasks"> & {
  data: number[];
  stepMasks: number[];
};

export function encodeLocalAnimation(animation: LocalAnimation): LocalAnimationAsset {
  return {
    ...animation,
    data: Array.from(animation.data),
    stepMasks: Array.from(animation.stepMasks),
  };
}

export function decodeLocalAnimation(value: unknown): LocalAnimation {
  const asset = value as LocalAnimationAsset;
  const fail = (): never => {
    throw new Error("appearance local animation has invalid samples or metadata");
  };
  if (
    !asset ||
    !Number.isInteger(asset.bones) ||
    asset.bones < 1 ||
    !Array.isArray(asset.clips) ||
    !asset.clips.length ||
    !Array.isArray(asset.data) ||
    !Array.isArray(asset.stepMasks) ||
    asset.data.some((value) => !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) ||
    asset.stepMasks.some((value) => !Number.isInteger(value) || value < 0 || value > 7)
  )
    fail();
  let samples = 0,
    masks = 0;
  const names = new Set<string>();
  for (const clip of asset.clips) {
    if (
      !clip ||
      typeof clip.name !== "string" ||
      !clip.name ||
      names.has(clip.name) ||
      typeof clip.loop !== "boolean" ||
      !Number.isFinite(clip.duration) ||
      clip.duration < 0 ||
      clip.start !== samples ||
      clip.stepMaskOffset !== masks ||
      !Array.isArray(clip.times) ||
      !clip.times.length ||
      clip.times[0] !== 0 ||
      clip.times.at(-1) !== clip.duration ||
      clip.times.some(
        (time, i) => !Number.isFinite(time) || time < 0 || (i > 0 && time <= clip.times[i - 1]),
      )
    )
      fail();
    assertClipMarkers(clip.markers);
    names.add(clip.name);
    samples += clip.times.length;
    masks += asset.bones;
  }
  if (
    asset.data.length !== samples * asset.bones * LOCAL_ANIMATION_FLOATS_PER_JOINT ||
    asset.stepMasks.length !== masks
  )
    fail();
  const data = Float32Array.from(asset.data);
  for (let offset = 0; offset < data.length; offset += LOCAL_ANIMATION_FLOATS_PER_JOINT) {
    if (
      asset.data[offset + 3] !== 0 ||
      asset.data[offset + 11] !== 0 ||
      !isAdmittedLocalQuaternion(data, offset + 4)
    )
      fail();
  }
  return {
    bones: asset.bones,
    clips: asset.clips,
    data,
    stepMasks: Uint32Array.from(asset.stepMasks),
  };
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
    // Float32 rounding can move an admitted source quaternion outside the GPU envelope.
    if (!isAdmittedLocalQuaternion(data, output + 4))
      throw new Error(`local joint ${joint} requires a near-unit quaternion in Float32`);
  }
  if (data.some((value) => !Number.isFinite(value)))
    throw new Error("local animation values must be finite in Float32");
  return data;
}

export function bakeLocalAnimation(rig: ImportedRig): LocalAnimation {
  for (let joint = 0; joint < rig.bones.length; joint++) {
    const bone = rig.bones[joint];
    if (!Number.isInteger(bone.parent) || bone.parent < -1 || bone.parent >= joint)
      throw new Error(`bone ${joint} must come after its parent`);
    if (!isAdmittedLocalQuaternion(bone.bind.R))
      throw new Error(`local bind ${bone.name} requires a near-unit quaternion`);
  }
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
        if (field === "R")
          for (let offset = 0; offset < channel.values.length; offset += 4)
            if (!isAdmittedLocalQuaternion(channel.values, offset))
              throw new Error(
                `local channel ${clip.name}/${joint}/R requires near-unit quaternions`,
              );
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
