import { assertClipMarkers } from '../src/schema.ts';
import { sampleRigLocalPose, localPoseToJointMatrices } from '../src/localPose.ts';

// VAT (vertex/bone animation texture) bake core for the skinned-crowd renderer.
// Pure math, zero deps, no browser, no WebGPU:
// given a skeleton (bones with parent + inverse-bind) and animation clips
// (per-bone TRS keyframe samplers), it samples every clip at a fixed fps and
// packs each bone's JOINT matrix (world * inverseBind) per frame into a float
// "texture" the runtime vertex shader samples to skin instances on the GPU.
//
// Determinism matters — the output must be byte-stable so the screenshot
// harness stays reproducible. Source and runtime share local-pose sampling.
//
// Texture layout (documented here, mirrored by the WGSL/GLSL skinning shader):
//   RGBA32F, width = total frames across all clips (concatenated),
//   height = bones * 4. Column-major mat4 packed as 4 consecutive rows:
//   pixel (x = globalFrame, y = bone*4 + c) holds matrix COLUMN c (xyzw).
//   The shader, for vertex bone b at clip frame f, reads the 4 texels at
//   (clipStart + f, b*4 + 0..3) and assembles mat4(col0,col1,col2,col3).

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
 *            clips:{name:string,start:number,frames:number,duration:number,loop:boolean}[]}}
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
    assertClipMarkers(c.markers);
    const frames = Math.max(1, Math.round(c.duration * fps) + 1);
    clipMeta.push({ name: c.name, start: totalFrames, frames, duration: c.duration, loop: c.loop ?? false, ...(c.markers === undefined ? {} : { markers: c.markers }) });
    totalFrames += frames;
  }
  const width = totalFrames;
  const height = B * 4;
  const data = new Float32Array(width * height * 4);

  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci];
    const meta = clipMeta[ci];
    for (let f = 0; f < meta.frames; f++) {
      const locals = sampleRigLocalPose(rig, clip.name, meta.frames > 1 ? f / (meta.frames - 1) : 0);
      const joints = localPoseToJointMatrices(rig, locals);
      const col = meta.start + f;
      for (let b = 0; b < B; b++) {
        const joint = joints.subarray(b * 16, b * 16 + 16);
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
