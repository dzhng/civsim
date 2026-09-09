import type { ImportedRig, RigChannel, RigClip } from "./rig";
type NumericArray = number[] | Float32Array | Float64Array;

/** Packed T3/R4/S3 per joint. Doubles preserve source TRS precision until matrix composition. */
export type LocalPose = Float64Array;

export function sampleRigLocalPose(
  rig: ImportedRig,
  clipName: string,
  normalizedPhase: number,
): LocalPose {
  const clip = rig.clips.find((clip) => clip.name === clipName);
  if (!clip) throw new Error(`missing rig clip ${clipName}`);
  if (!Number.isFinite(normalizedPhase)) throw new Error("pose phase must be finite");
  // Wrapping belongs to the timeline: explicit phase one always means the last sample.
  const time = Math.max(0, Math.min(1, normalizedPhase)) * clip.duration;
  return sampleClipLocals(rig, clip, time);
}

/** Exact authored key times must not round-trip through seconds/duration * duration. */
export function sampleRigLocalPoseSeconds(
  rig: ImportedRig,
  clipName: string,
  seconds: number,
): LocalPose {
  const clip = rig.clips.find((clip) => clip.name === clipName);
  if (!clip) throw new Error(`missing rig clip ${clipName}`);
  if (!Number.isFinite(seconds)) throw new Error("pose time must be finite");
  return sampleClipLocals(rig, clip, Math.max(0, Math.min(clip.duration, seconds)));
}

function sampleClipLocals(rig: ImportedRig, clip: RigClip, time: number): LocalPose {
  const pose = new Float64Array(rig.bones.length * 10);
  for (let joint = 0; joint < rig.bones.length; joint++) {
    const track = clip.tracks[joint] || {};
    const bind = rig.bones[joint].bind;
    pose.set(track.T ? sampleChannel(track.T, time, "vec3") : bind.T, joint * 10);
    pose.set(track.R ? sampleChannel(track.R, time, "quat") : bind.R, joint * 10 + 3);
    pose.set(track.S ? sampleChannel(track.S, time, "vec3") : bind.S, joint * 10 + 7);
  }
  return pose;
}

function assertSameLayout(a: LocalPose, b: LocalPose): void {
  if (a.length !== b.length || a.length % 10 !== 0)
    throw new Error("local poses require matching T3/R4/S3 joint layouts");
}

export function blendLocalPoses(a: LocalPose, b: LocalPose, weight: number): LocalPose {
  assertSameLayout(a, b);
  if (!Number.isFinite(weight) || weight < 0 || weight > 1)
    throw new Error("pose blend weight must be from zero to one");
  if (weight === 0) return a.slice();
  if (weight === 1) return b.slice();
  const out = new Float64Array(a.length);
  for (let joint = 0; joint < a.length; joint += 10) {
    out.set(vec3Lerp(a.subarray(joint, joint + 3), b.subarray(joint, joint + 3), weight), joint);
    out.set(
      quatSlerp(a.subarray(joint + 3, joint + 7), b.subarray(joint + 3, joint + 7), weight),
      joint + 3,
    );
    out.set(
      vec3Lerp(a.subarray(joint + 7, joint + 10), b.subarray(joint + 7, joint + 10), weight),
      joint + 7,
    );
  }
  return out;
}

export function composeMaskedLocals(
  base: LocalPose,
  upper: LocalPose,
  jointIndices: readonly number[],
): LocalPose {
  assertSameLayout(base, upper);
  const out = base.slice();
  for (const joint of jointIndices) {
    if (!Number.isInteger(joint) || joint < 0 || joint * 10 >= base.length)
      throw new Error("pose mask references a missing joint");
    out.set(upper.subarray(joint * 10, joint * 10 + 10), joint * 10);
  }
  return out;
}

/** Column-major skin matrices, packed mat4 per joint, after local hierarchy evaluation. */
export function localPoseToJointMatrices(rig: ImportedRig, locals: LocalPose): Float32Array {
  if (locals.length !== rig.bones.length * 10)
    throw new Error("local pose does not match skeleton");
  const world: Float32Array[] = [];
  const joints = new Float32Array(rig.bones.length * 16);
  for (let joint = 0; joint < rig.bones.length; joint++) {
    const bone = rig.bones[joint];
    if (!Number.isInteger(bone.parent) || bone.parent < -1 || bone.parent >= joint)
      throw new Error(`bone ${joint} must follow its parent`);
    const offset = joint * 10;
    const local = mat4FromTRS(
      locals.subarray(offset, offset + 3),
      locals.subarray(offset + 3, offset + 7),
      locals.subarray(offset + 7, offset + 10),
    );
    world[joint] = bone.parent < 0 ? local : mat4Mul(world[bone.parent], local);
    joints.set(mat4Mul(world[joint], bone.inverseBind), joint * 16);
  }
  return joints;
}

export function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** out = a * b (column-major, so applying `out` = apply b then a). */
export function mat4Mul(a: ArrayLike<number>, b: ArrayLike<number>) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

/** Compose a column-major mat4 from translation, quaternion (x,y,z,w), scale. */
export function mat4FromTRS(t: NumericArray, q: NumericArray, s: NumericArray) {
  const [x, y, z, w] = q;
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;
  const [sx, sy, sz] = s;
  const m = new Float32Array(16);
  m[0] = (1 - (yy + zz)) * sx;
  m[1] = (xy + wz) * sx;
  m[2] = (xz - wy) * sx;
  m[3] = 0;
  m[4] = (xy - wz) * sy;
  m[5] = (1 - (xx + zz)) * sy;
  m[6] = (yz + wx) * sy;
  m[7] = 0;
  m[8] = (xz + wy) * sz;
  m[9] = (yz - wx) * sz;
  m[10] = (1 - (xx + yy)) * sz;
  m[11] = 0;
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  m[15] = 1;
  return m;
}

function scalarLerp(a: number, b: number, u: number) {
  // Frozen interruptions may be blended indefinitely. Preserve the exact scalar
  // endpoint range rather than accumulating a depth-dependent rounding allowance.
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), a + (b - a) * u));
}

function vec3Lerp(a: NumericArray, b: NumericArray, u: number) {
  return [scalarLerp(a[0], b[0], u), scalarLerp(a[1], b[1], u), scalarLerp(a[2], b[2], u)];
}

/** Shortest-arc quaternion slerp (x,y,z,w), normalized. */
export function quatSlerp(a: NumericArray, b: NumericArray, u: number) {
  let [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    dot = -dot;
  }
  let s0, s1;
  if (dot > 0.9995) {
    s0 = 1 - u;
    s1 = u; // near-parallel: lerp
  } else {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    s0 = Math.sin((1 - u) * theta) / sin;
    s1 = Math.sin(u * theta) / sin;
  }
  let qx = s0 * ax + s1 * bx,
    qy = s0 * ay + s1 * by,
    qz = s0 * az + s1 * bz,
    qw = s0 * aw + s1 * bw;
  const len = Math.hypot(qx, qy, qz, qw) || 1;
  return [qx / len, qy / len, qz / len, qw / len];
}

/** Sample a keyframe channel `{ times:[t...], values:[v...] }` at time `t`.
 *  `kind` is 'vec3' (translation/scale) or 'quat' (rotation). Holds the
 *  endpoints outside the range; linear between (slerp for quats). */
export function sampleChannel(ch: RigChannel, t: number, kind: "vec3" | "quat") {
  const { times, values } = ch;
  const n = times.length;
  const stride = kind === "quat" ? 4 : 3;
  const at = (i: number) => values.slice(i * stride, i * stride + stride);
  if (n === 0) return kind === "quat" ? [0, 0, 0, 1] : [0, 0, 0];
  if (t <= times[0]) return at(0);
  if (t >= times[n - 1]) return at(n - 1);
  let i = 0;
  while (i < n - 1 && times[i + 1] < t) i++;
  if (ch.interpolation === "STEP") return at(times[i + 1] === t ? i + 1 : i);
  const u = (t - times[i]) / (times[i + 1] - times[i] || 1);
  return kind === "quat" ? quatSlerp(at(i), at(i + 1), u) : vec3Lerp(at(i), at(i + 1), u);
}

/** Apply a column-major mat4 to a homogeneous point (x,y,z,1) -> [x,y,z]. */
export function transformPoint(m: ArrayLike<number>, p: NumericArray) {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}
