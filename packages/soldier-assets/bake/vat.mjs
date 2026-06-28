// VAT (vertex/bone animation texture) bake core, kept from the closed WebGPU
// renderer foundation documented in specs/done/webgpu-skinned-crowd-foundation.
// Pure math, zero deps, no browser, no WebGPU:
// given a skeleton (bones with parent + inverse-bind) and animation clips
// (per-bone TRS keyframe samplers), it samples every clip at a fixed fps and
// packs each bone's JOINT matrix (world * inverseBind) per frame into a float
// "texture" the runtime vertex shader samples to skin instances on the GPU.
//
// This module is engine-agnostic and unit-testable in isolation (vat.test.mjs):
// a glTF reader is a thin adapter on top (bones/clips in the shape below) added
// once a rigged asset exists. Determinism matters — the output must be
// byte-stable so the screenshot harness stays reproducible.
//
// Texture layout (documented here, mirrored by the WGSL/GLSL skinning shader):
//   RGBA32F, width = total frames across all clips (concatenated),
//   height = bones * 4. Column-major mat4 packed as 4 consecutive rows:
//   pixel (x = globalFrame, y = bone*4 + c) holds matrix COLUMN c (xyzw).
//   The shader, for vertex bone b at clip frame f, reads the 4 texels at
//   (clipStart + f, b*4 + 0..3) and assembles mat4(col0,col1,col2,col3).

// ---- minimal column-major mat4 / quat math (glTF convention) ----------------

export function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** out = a * b (column-major, so applying `out` = apply b then a). */
export function mat4Mul(a, b) {
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
export function mat4FromTRS(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  const m = new Float32Array(16);
  m[0] = (1 - (yy + zz)) * sx; m[1] = (xy + wz) * sx; m[2] = (xz - wy) * sx; m[3] = 0;
  m[4] = (xy - wz) * sy; m[5] = (1 - (xx + zz)) * sy; m[6] = (yz + wx) * sy; m[7] = 0;
  m[8] = (xz + wy) * sz; m[9] = (yz - wx) * sz; m[10] = (1 - (xx + yy)) * sz; m[11] = 0;
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}

function vec3Lerp(a, b, u) {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/** Shortest-arc quaternion slerp (x,y,z,w), normalized. */
export function quatSlerp(a, b, u) {
  let [ax, ay, az, aw] = a;
  let [bx, by, bz, bw] = b;
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }
  let s0, s1;
  if (dot > 0.9995) {
    s0 = 1 - u; s1 = u; // near-parallel: lerp
  } else {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    s0 = Math.sin((1 - u) * theta) / sin;
    s1 = Math.sin(u * theta) / sin;
  }
  let qx = s0 * ax + s1 * bx, qy = s0 * ay + s1 * by, qz = s0 * az + s1 * bz, qw = s0 * aw + s1 * bw;
  const len = Math.hypot(qx, qy, qz, qw) || 1;
  return [qx / len, qy / len, qz / len, qw / len];
}

/** Sample a keyframe channel `{ times:[t...], values:[v...] }` at time `t`.
 *  `kind` is 'vec3' (translation/scale) or 'quat' (rotation). Holds the
 *  endpoints outside the range; linear between (slerp for quats). */
export function sampleChannel(ch, t, kind) {
  const { times, values } = ch;
  const n = times.length;
  const stride = kind === 'quat' ? 4 : 3;
  const at = (i) => values.slice(i * stride, i * stride + stride);
  if (n === 0) return kind === 'quat' ? [0, 0, 0, 1] : [0, 0, 0];
  if (t <= times[0]) return at(0);
  if (t >= times[n - 1]) return at(n - 1);
  let i = 0;
  while (i < n - 1 && times[i + 1] < t) i++;
  const u = (t - times[i]) / (times[i + 1] - times[i] || 1);
  return kind === 'quat' ? quatSlerp(at(i), at(i + 1), u) : vec3Lerp(at(i), at(i + 1), u);
}

// ---- the bake ---------------------------------------------------------------

/**
 * @param {object} rig
 * @param {{name:string,parent:number,bind:{T:number[],R:number[],S:number[]},
 *           inverseBind:Float32Array}[]} rig.bones
 *   parent = index of parent bone or -1 for a root; bones in parent-before-child
 *   order (a topological order — asserted). `bind` is the rest-pose LOCAL TRS
 *   (the node's own transform), used wherever a clip leaves a component
 *   unanimated; `inverseBind` is the glTF inverse-bind matrix for this joint.
 * @param {{name:string,duration:number,tracks:Object<number,{T?,R?,S?}>}[]} rig.clips
 *   tracks keyed by bone index; T/S are vec3 channels, R a quat channel. A
 *   missing component holds that bone's bind-local default (NOT identity).
 * @param {number} fps
 * @returns {{width:number,height:number,data:Float32Array,bones:number,fps:number,
 *            clips:{name:string,start:number,frames:number}[]}}
 */
export function bakeRig(rig, fps) {
  const { bones, clips } = rig;
  const B = bones.length;
  for (let i = 0; i < B; i++) {
    if (bones[i].parent >= i) throw new Error(`bone ${i} (${bones[i].name}) must come after its parent`);
  }
  const clipMeta = [];
  let totalFrames = 0;
  for (const c of clips) {
    const frames = Math.max(1, Math.round(c.duration * fps) + 1);
    clipMeta.push({ name: c.name, start: totalFrames, frames });
    totalFrames += frames;
  }
  const width = totalFrames;
  const height = B * 4;
  const data = new Float32Array(width * height * 4);

  const world = new Array(B);
  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci];
    const meta = clipMeta[ci];
    for (let f = 0; f < meta.frames; f++) {
      const t = meta.frames > 1 ? (f / (meta.frames - 1)) * clip.duration : 0;
      const col = meta.start + f;
      for (let b = 0; b < B; b++) {
        const tr = clip.tracks[b] || {};
        const bind = bones[b].bind;
        const T = tr.T ? sampleChannel(tr.T, t, 'vec3') : bind.T;
        const R = tr.R ? sampleChannel(tr.R, t, 'quat') : bind.R;
        const S = tr.S ? sampleChannel(tr.S, t, 'vec3') : bind.S;
        const local = mat4FromTRS(T, R, S);
        const p = bones[b].parent;
        world[b] = p >= 0 ? mat4Mul(world[p], local) : local;
        const joint = mat4Mul(world[b], bones[b].inverseBind);
        // pack the 4 columns of `joint` into rows b*4 .. b*4+3 at column `col`
        for (let c = 0; c < 4; c++) {
          const row = b * 4 + c;
          const o = (row * width + col) * 4;
          data[o] = joint[c * 4 + 0];
          data[o + 1] = joint[c * 4 + 1];
          data[o + 2] = joint[c * 4 + 2];
          data[o + 3] = joint[c * 4 + 3];
        }
      }
    }
  }
  return { width, height, data, bones: B, fps, clips: clipMeta };
}

/** Read a baked bone's joint matrix at a global frame column (column-major
 *  mat4) — the CPU twin of the shader fetch, for tests/verification. */
export function readJoint(baked, bone, frameCol) {
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    const row = bone * 4 + c;
    const o = (row * baked.width + frameCol) * 4;
    m[c * 4 + 0] = baked.data[o];
    m[c * 4 + 1] = baked.data[o + 1];
    m[c * 4 + 2] = baked.data[o + 2];
    m[c * 4 + 3] = baked.data[o + 3];
  }
  return m;
}

/** Apply a column-major mat4 to a homogeneous point (x,y,z,1) -> [x,y,z]. */
export function transformPoint(m, p) {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}
