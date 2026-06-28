// glTF/GLB → rig adapter. Decodes only what the VAT bake needs (skeleton, bind
// pose, inverse-bind matrices, animation clips) into the engine-agnostic rig
// shape `bakeRig()` already consumes — see vat.mjs. Pure JS, zero deps, runs in
// Node (the CLI/tests) and the browser (the asset workbench). It does NOT touch
// the VAT output format: a glTF-sourced bake and the placeholder bake produce
// the same `VatBake`.

import { bakeRig, mat4FromTRS } from './vat.mjs';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function componentReader(componentType) {
  switch (componentType) {
    case 5120: return (dv, o) => Math.max(dv.getInt8(o) / 127, -1);
    case 5121: return (dv, o) => dv.getUint8(o) / 255;
    case 5122: return (dv, o) => Math.max(dv.getInt16(o, true) / 32767, -1);
    case 5123: return (dv, o) => dv.getUint16(o, true) / 65535;
    case 5125: return (dv, o) => dv.getUint32(o, true);
    case 5126: return (dv, o) => dv.getFloat32(o, true);
    default: throw new Error(`unsupported glTF componentType ${componentType}`);
  }
}

// Integer indices (joints, parents) must not be normalized; float accessors
// (times, matrices, TRS) read as-is. We only ever read FLOAT and UINT here.
function rawReader(componentType) {
  switch (componentType) {
    case 5121: return (dv, o) => dv.getUint8(o);
    case 5123: return (dv, o) => dv.getUint16(o, true);
    case 5125: return (dv, o) => dv.getUint32(o, true);
    case 5126: return (dv, o) => dv.getFloat32(o, true);
    default: return componentReader(componentType);
  }
}

function toUint8(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  if (ArrayBuffer.isView(buffer)) return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  throw new Error('parseGlb expects an ArrayBuffer or typed array');
}

/** Split a .glb container into its glTF JSON and binary chunk. */
export function parseGlb(buffer) {
  const u8 = toUint8(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < 12 || dv.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('not a GLB file (bad magic header)');
  }
  const version = dv.getUint32(4, true);
  if (version !== 2) throw new Error(`unsupported GLB version ${version} (expected 2)`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= u8.byteLength) {
    const length = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    const chunk = u8.subarray(start, start + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === CHUNK_BIN) bin = chunk;
    offset = start + length;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

function decodeDataUri(uri) {
  const comma = uri.indexOf(',');
  const meta = uri.slice(5, comma);
  const body = uri.slice(comma + 1);
  const bytes = meta.includes(';base64')
    ? (typeof atob === 'function'
      ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
      : Uint8Array.from(Buffer.from(body, 'base64')))
    : new TextEncoder().encode(decodeURIComponent(body));
  return bytes;
}

function bufferBytes(gltf, glbBin, bufferIndex) {
  const buffer = gltf.buffers[bufferIndex];
  if (!buffer.uri) {
    if (!glbBin) throw new Error('glTF buffer has no uri and no GLB binary chunk');
    return glbBin;
  }
  if (buffer.uri.startsWith('data:')) return decodeDataUri(buffer.uri);
  throw new Error(`external glTF buffer "${buffer.uri}" is not supported — embed it or use .glb`);
}

function readAccessor(gltf, glbBin, accessorIndex, { raw = false } = {}) {
  const accessor = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[accessor.bufferView];
  const bytes = bufferBytes(gltf, glbBin, view.buffer);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const components = TYPE_COMPONENTS[accessor.type];
  const componentSize = COMPONENT_SIZE[accessor.componentType];
  const elementSize = components * componentSize;
  const baseOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || elementSize;
  const read = raw ? rawReader(accessor.componentType) : componentReader(accessor.componentType);
  const out = [];
  for (let i = 0; i < accessor.count; i++) {
    const element = [];
    for (let c = 0; c < components; c++) element.push(read(dv, baseOffset + i * stride + c * componentSize));
    out.push(components === 1 ? element[0] : element);
  }
  return out;
}

function nodeTRS(node) {
  if (node.matrix) {
    return decomposeMatrix(node.matrix);
  }
  return {
    T: node.translation ? node.translation.slice(0, 3) : [0, 0, 0],
    R: node.rotation ? node.rotation.slice(0, 4) : [0, 0, 0, 1],
    S: node.scale ? node.scale.slice(0, 3) : [1, 1, 1],
  };
}

// glTF node.matrix is column-major TRS; decompose back to T/R/S for the bake.
function decomposeMatrix(m) {
  const T = [m[12], m[13], m[14]];
  const sx = Math.hypot(m[0], m[1], m[2]) || 1;
  const sy = Math.hypot(m[4], m[5], m[6]) || 1;
  const sz = Math.hypot(m[8], m[9], m[10]) || 1;
  const r = [
    m[0] / sx, m[1] / sx, m[2] / sx,
    m[4] / sy, m[5] / sy, m[6] / sy,
    m[8] / sz, m[9] / sz, m[10] / sz,
  ];
  const trace = r[0] + r[4] + r[8];
  let qx, qy, qz, qw;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    qw = 0.25 * s; qx = (r[5] - r[7]) / s; qy = (r[6] - r[2]) / s; qz = (r[1] - r[3]) / s;
  } else if (r[0] > r[4] && r[0] > r[8]) {
    const s = Math.sqrt(1 + r[0] - r[4] - r[8]) * 2;
    qw = (r[5] - r[7]) / s; qx = 0.25 * s; qy = (r[3] + r[1]) / s; qz = (r[6] + r[2]) / s;
  } else if (r[4] > r[8]) {
    const s = Math.sqrt(1 + r[4] - r[0] - r[8]) * 2;
    qw = (r[6] - r[2]) / s; qx = (r[3] + r[1]) / s; qy = 0.25 * s; qz = (r[7] + r[5]) / s;
  } else {
    const s = Math.sqrt(1 + r[8] - r[0] - r[4]) * 2;
    qw = (r[1] - r[3]) / s; qx = (r[6] + r[2]) / s; qy = (r[7] + r[5]) / s; qz = 0.25 * s;
  }
  return { T, R: [qx, qy, qz, qw], S: [sx, sy, sz] };
}

const CHANNEL_KEY = { translation: 'T', rotation: 'R', scale: 'S' };
const CHANNEL_KIND = { translation: 'vec3', rotation: 'quat', scale: 'vec3' };

/** Decode a glTF skin + animations into the rig shape `bakeRig()` consumes. */
export function gltfToRig(gltf, glbBin, { clipNames } = {}) {
  const skin = gltf.skins?.[0];
  if (!skin || !Array.isArray(skin.joints) || skin.joints.length === 0) {
    throw new Error('glTF has no skin/joints to bake');
  }
  const joints = skin.joints;
  const jointOfNode = new Map(joints.map((node, j) => [node, j]));
  const parentOfNode = new Map();
  gltf.nodes.forEach((node, index) => {
    for (const child of node.children || []) parentOfNode.set(child, index);
  });
  const inverseBinds = skin.inverseBindMatrices != null
    ? readAccessor(gltf, glbBin, skin.inverseBindMatrices)
    : null;

  const jointBones = joints.map((nodeIndex, j) => {
    const node = gltf.nodes[nodeIndex];
    const parentNode = parentOfNode.get(nodeIndex);
    const parentJoint = parentNode != null && jointOfNode.has(parentNode) ? jointOfNode.get(parentNode) : -1;
    return {
      name: node.name || `bone_${j}`,
      parentJoint,
      bind: nodeTRS(node),
      inverseBind: inverseBinds ? Float32Array.from(inverseBinds[j]) : mat4FromTRS([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]),
    };
  });

  const order = topologicalOrder(jointBones);
  const newIndexOfJoint = new Map(order.map((joint, newIndex) => [joint, newIndex]));
  const bones = order.map((joint) => {
    const bone = jointBones[joint];
    return {
      name: bone.name,
      parent: bone.parentJoint < 0 ? -1 : newIndexOfJoint.get(bone.parentJoint),
      bind: bone.bind,
      inverseBind: bone.inverseBind,
    };
  });

  const clips = (gltf.animations || []).map((animation, index) =>
    animationToClip(animation, index, gltf, glbBin, jointOfNode, newIndexOfJoint, clipNames));
  return { bones, clips };
}

// glTF joint arrays are usually already parent-before-child, but the bake
// asserts it, so sort defensively and remap every parent/track index.
function topologicalOrder(jointBones) {
  const order = [];
  const placed = new Set();
  const visit = (joint) => {
    if (placed.has(joint)) return;
    const parent = jointBones[joint].parentJoint;
    if (parent >= 0) visit(parent);
    placed.add(joint);
    order.push(joint);
  };
  for (let j = 0; j < jointBones.length; j++) visit(j);
  return order;
}

function animationToClip(animation, index, gltf, glbBin, jointOfNode, newIndexOfJoint, clipNames) {
  const tracks = {};
  let duration = 0;
  for (const channel of animation.channels) {
    const targetNode = channel.target.node;
    const key = CHANNEL_KEY[channel.target.path];
    if (key === undefined || !jointOfNode.has(targetNode)) continue; // ignore non-skeleton channels
    const boneIndex = newIndexOfJoint.get(jointOfNode.get(targetNode));
    const sampler = animation.samplers[channel.sampler];
    const times = readAccessor(gltf, glbBin, sampler.input);
    const values = readAccessor(gltf, glbBin, sampler.output);
    duration = Math.max(duration, times.length ? times[times.length - 1] : 0);
    tracks[boneIndex] = tracks[boneIndex] || {};
    tracks[boneIndex][key] = { times, values: values.flat() };
  }
  const rawName = animation.name || `clip_${index}`;
  const name = clipNames?.[rawName] ?? clipNames?.[index] ?? rawName;
  return { name, duration, tracks };
}

/** Full glTF/GLB → VatBake, byte-compatible with the placeholder bake output. */
export function bakeGltf(buffer, { fps = 12, skeleton = 'imported-gltf', clipNames } = {}) {
  const { json, bin } = parseGlb(buffer);
  return bakeGltfJson(json, bin, { fps, skeleton, clipNames });
}

export function bakeGltfJson(gltf, glbBin, { fps = 12, skeleton = 'imported-gltf', clipNames } = {}) {
  const rig = gltfToRig(gltf, glbBin, { clipNames });
  const baked = bakeRig(rig, fps);
  return { rig, bake: vatBakeFrom(baked, skeleton, fps), boneNames: rig.bones.map((b) => b.name) };
}

function vatBakeFrom(baked, skeleton, fps) {
  return {
    schema: 1,
    skeleton,
    fps,
    width: baked.width,
    height: baked.height,
    bones: baked.bones,
    clips: baked.clips,
    layout: 'RGBA32F, mat4 columns in rows bone*4..bone*4+3',
    // The canonical sha256 is stamped by the node CLI bake (crypto); the in-
    // browser import path leaves it empty — nothing renders off the hash.
    sha256: '',
    data: Array.from(baked.data, (v) => Number(v.toFixed(8))),
  };
}
