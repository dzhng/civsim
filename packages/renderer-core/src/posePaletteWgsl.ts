import {
  PLAYBACK_BASE_FROZEN,
  PLAYBACK_UPPER_PRESENT,
  PLAYBACK_UPPER_FROZEN,
  PLAYBACK_UPPER_DEST_BASE,
  PLAYBACK_WORDS,
  PLAYBACK_BASE_SOURCE,
  PLAYBACK_BASE_DESTINATION,
  PLAYBACK_UPPER_SOURCE,
  PLAYBACK_UPPER_DESTINATION,
  PLAYBACK_HEADER_FLAGS,
  PLAYBACK_HEADER_BASE_WEIGHT,
  PLAYBACK_HEADER_UPPER_WEIGHT,
  PLAYBACK_HEADER_UPPER_MASK,
} from "./playbackPacking";
import { LOCAL_STEP_T, LOCAL_STEP_R, LOCAL_STEP_S } from "../../soldier-assets/src/localAnimation";

/** Shared compute math, not an alternate persisted animation encoding. */
export const POSE_PALETTE_HELPERS_WGSL = `
struct PaletteLocal { t: vec3f, q: vec4f, s: vec3f };

// Shortest-arc slerp only evaluates sine on [0, pi/2]. Degree-11 odd Taylor
// remainder is below 5.7e-8 there, before Float32 evaluation error.
fn paletteSin(x: f32) -> f32 {
  let square = x * x;
  return x * (1.0 + square * (-0.16666666666666667 + square * (0.008333333333333333 + square * (-0.0001984126984126984 + square * (0.0000027557319223985893 + square * -0.00000002505210838544172)))));
}

fn paletteSlerp(a: vec4f, inputB: vec4f, weight: f32) -> vec4f {
  if (weight == 0.0) { return a; }
  if (weight == 1.0) { return inputB; }
  var b = inputB;
  var cosine = dot(a, b);
  if (cosine < 0.0) { b = -b; cosine = -cosine; }
  var result: vec4f;
  if (cosine > 0.9995) {
    result = a * (1.0 - weight) + b * weight;
  } else {
    // WGSL only bounds atan2 accuracy for a normal, nonzero second argument.
    // Below the smallest normal cosine, the shortest-arc angle rounds to pi/2.
    var theta = 1.5707963267948966;
    if (cosine >= 1.1754943508222875e-38) {
      theta = atan2(length(b - a * cosine), cosine);
    }
    result = a * paletteSin((1.0 - weight) * theta) + b * paletteSin(weight * theta);
  }
  let magnitude = length(result);
  return result / select(1.0, magnitude, magnitude > 0.0);
}

fn paletteBlend(a: PaletteLocal, b: PaletteLocal, weight: f32) -> PaletteLocal {
  if (weight == 0.0) { return a; }
  if (weight == 1.0) { return b; }
  return PaletteLocal(a.t + (b.t - a.t) * weight, paletteSlerp(a.q, b.q, weight), a.s + (b.s - a.s) * weight);
}

fn paletteRead(data: ptr<storage, array<vec4f>, read>, offset: u32) -> PaletteLocal {
  return PaletteLocal((*data)[offset].xyz, (*data)[offset + 1u], (*data)[offset + 2u].xyz);
}

fn paletteSample(data: ptr<storage, array<vec4f>, read>, metadata: ptr<storage, array<u32>, read>, descriptor: vec4u, joint: u32, bones: u32, stepBase: u32) -> PaletteLocal {
  let a = paletteRead(data, (descriptor.x * bones + joint) * 3u);
  let b = paletteRead(data, (descriptor.y * bones + joint) * 3u);
  var result = paletteBlend(a, b, bitcast<f32>(descriptor.z));
  let steps = (*metadata)[stepBase + descriptor.w + joint];
  if ((steps & ${LOCAL_STEP_T}u) != 0u) { result.t = a.t; }
  if ((steps & ${LOCAL_STEP_R}u) != 0u) { result.q = a.q; }
  if ((steps & ${LOCAL_STEP_S}u) != 0u) { result.s = a.s; }
  return result;
}

fn paletteTrs(pose: PaletteLocal) -> mat4x4f {
  let q = pose.q;
  let x2 = q.x + q.x; let y2 = q.y + q.y; let z2 = q.z + q.z;
  let xx = q.x * x2; let xy = q.x * y2; let xz = q.x * z2;
  let yy = q.y * y2; let yz = q.y * z2; let zz = q.z * z2;
  let wx = q.w * x2; let wy = q.w * y2; let wz = q.w * z2;
  return mat4x4f(
    vec4f(vec3f(1.0 - (yy + zz), xy + wz, xz - wy) * pose.s.x, 0.0),
    vec4f(vec3f(xy - wz, 1.0 - (xx + zz), yz + wx) * pose.s.y, 0.0),
    vec4f(vec3f(xz + wy, yz - wx, 1.0 - (xx + yy)) * pose.s.z, 0.0),
    vec4f(pose.t, 1.0)
  );
}
`;

/** One invocation owns one instance's hierarchy; no workgroup or inter-dispatch dependency. */
export function posePaletteFunctionWgsl(bones: number): string {
  if (!Number.isInteger(bones) || bones < 1)
    throw new Error("palette requires a positive joint count");
  return `
fn preparePosePalette(
  samples: ptr<storage, array<vec4f>, read>,
  metadata: ptr<storage, array<u32>, read>,
  inverseBinds: ptr<storage, array<mat4x4f>, read>,
  controls: ptr<storage, array<vec4u>, read>,
  snapshots: ptr<storage, array<vec4f>, read>,
  palettes: ptr<storage, array<mat4x4f>, read_write>,
  instance: u32, count: u32, stepBase: u32
) -> u32 {
  if (instance >= count) { return 0u; }
  let record = instance * ${PLAYBACK_WORDS / 4}u;
  let header = (*controls)[record];
  let baseSource = (*controls)[record + ${PLAYBACK_BASE_SOURCE / 4}u];
  let baseDestination = (*controls)[record + ${PLAYBACK_BASE_DESTINATION / 4}u];
  let upperSource = (*controls)[record + ${PLAYBACK_UPPER_SOURCE / 4}u];
  let upperDestination = (*controls)[record + ${PLAYBACK_UPPER_DESTINATION / 4}u];
  var world: array<mat4x4f, ${bones}>;
  for (var joint = 0u; joint < ${bones}u; joint++) {
    var source: PaletteLocal;
    if ((header[${PLAYBACK_HEADER_FLAGS}] & ${PLAYBACK_BASE_FROZEN}u) != 0u) {
      source = paletteRead(snapshots, (baseSource.x * ${bones}u + joint) * 3u);
    } else {
      source = paletteSample(samples, metadata, baseSource, joint, ${bones}u, stepBase);
    }
    let base = paletteBlend(source, paletteSample(samples, metadata, baseDestination, joint, ${bones}u, stepBase), bitcast<f32>(header[${PLAYBACK_HEADER_BASE_WEIGHT}]));
    var composed = base;
    if ((header[${PLAYBACK_HEADER_FLAGS}] & ${PLAYBACK_UPPER_PRESENT}u) != 0u && (*metadata)[header[${PLAYBACK_HEADER_UPPER_MASK}] + joint] != 0u) {
      var upper: PaletteLocal;
      if ((header[${PLAYBACK_HEADER_FLAGS}] & ${PLAYBACK_UPPER_FROZEN}u) != 0u) {
        upper = paletteRead(snapshots, (upperSource.x * ${bones}u + joint) * 3u);
      } else {
        upper = paletteSample(samples, metadata, upperSource, joint, ${bones}u, stepBase);
      }
      var destination = base;
      if ((header[${PLAYBACK_HEADER_FLAGS}] & ${PLAYBACK_UPPER_DEST_BASE}u) == 0u) {
        destination = paletteSample(samples, metadata, upperDestination, joint, ${bones}u, stepBase);
      }
      composed = paletteBlend(upper, destination, bitcast<f32>(header[${PLAYBACK_HEADER_UPPER_WEIGHT}]));
    }
    let local = paletteTrs(composed);
    let parent = (*metadata)[joint];
    world[joint] = local;
    if (parent != 0xffffffffu) { world[joint] = world[parent] * local; }
    (*palettes)[instance * ${bones}u + joint] = world[joint] * (*inverseBinds)[joint];
  }
  return 1u;
}
`;
}
