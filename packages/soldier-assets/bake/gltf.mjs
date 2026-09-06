// Authored glTF/GLB → weighted primitives and local-TRS rig. Source Y-up space
// is preserved; the renderer's basis conversion belongs at asset packaging.

import { bakeRig } from './vat.mjs';
import { mat4FromTRS, mat4Identity } from '../src/localPose.ts';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function componentReader(componentType) {
  switch (componentType) {
    case 5120: return (dv, o) => dv.getInt8(o);
    case 5121: return (dv, o) => dv.getUint8(o);
    case 5122: return (dv, o) => dv.getInt16(o, true);
    case 5123: return (dv, o) => dv.getUint16(o, true);
    case 5125: return (dv, o) => dv.getUint32(o, true);
    case 5126: return (dv, o) => dv.getFloat32(o, true);
    default: throw new Error(`unsupported glTF componentType ${componentType}`);
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

function readAccessor(gltf, glbBin, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`missing glTF accessor ${accessorIndex}`);
  if (accessor.sparse) throw new Error(`accessor ${accessorIndex}: sparse data unsupported; export dense mesh and animation buffers`);
  const view = gltf.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`accessor ${accessorIndex}: missing bufferView; export dense buffers`);
  if (view.extensions && Object.keys(view.extensions).length) throw new Error(`accessor ${accessorIndex}: compressed buffer views unsupported; export uncompressed core glTF`);
  const bytes = bufferBytes(gltf, glbBin, view.buffer);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const components = TYPE_COMPONENTS[accessor.type];
  const componentSize = COMPONENT_SIZE[accessor.componentType];
  const elementSize = components * componentSize;
  const baseOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || elementSize;
  const read = componentReader(accessor.componentType);
  const out = [];
  for (let i = 0; i < accessor.count; i++) {
    const element = [];
    for (let c = 0; c < components; c++) {
      const value = read(dv, baseOffset + i * stride + c * componentSize);
      if (!Number.isFinite(value)) throw new Error(`accessor ${accessorIndex}: nonfinite data; repair and re-export the source`);
      const scale = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[accessor.componentType];
      element.push(accessor.normalized ? Math.max(-1, value / scale) : value);
    }
    out.push(components === 1 ? element[0] : element);
  }
  return out;
}

function nodeTRS(node) {
  if (node.matrix) {
    return decomposeMatrix(node.matrix);
  }
  const trs = {
    T: node.translation ? node.translation.slice(0, 3) : [0, 0, 0],
    R: node.rotation ? node.rotation.slice(0, 4) : [0, 0, 0, 1],
    S: node.scale ? node.scale.slice(0, 3) : [1, 1, 1],
  };
  validateScale(trs.S);
  return trs;
}

function validateScale(scale) {
  if (scale.some((value) => !Number.isFinite(value) || value <= 0)
    || Math.max(...scale) - Math.min(...scale) > Math.max(...scale) * 1e-5) {
    throw new Error('nonuniform, mirrored or zero scale is unsupported; apply scale in Blender and re-export the deform rig');
  }
}

// glTF node.matrix is column-major TRS; decompose back to T/R/S for the bake.
function decomposeMatrix(m) {
  const T = [m[12], m[13], m[14]];
  const sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  validateScale([sx, sy, sz]);
  const determinant = m[0] * (m[5] * m[10] - m[6] * m[9])
    - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
  if (determinant <= 0) throw new Error('mirrored scale is unsupported; apply scale in Blender and re-export the deform rig');
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
  const R = [qx, qy, qz, qw];
  const S = [sx, sy, sz];
  const reconstructed = mat4FromTRS(T, R, S);
  if (m.some((value, i) => !Number.isFinite(value) || Math.abs(value - reconstructed[i]) > 1e-5 * Math.max(1, Math.abs(value)))) {
    throw new Error('shear or non-TRS matrix is unsupported; apply transforms and bake deform animation in Blender');
  }
  return { T, R, S };
}

const CHANNEL_KEY = { translation: 'T', rotation: 'R', scale: 'S' };

/** Decode a glTF skin + animations into the rig shape `bakeRig()` consumes. */
export function gltfToRig(gltf, glbBin, { clipNames } = {}) {
  const skin = gltf.skins?.[0];
  if (!skin || !Array.isArray(skin.joints) || skin.joints.length === 0) {
    throw new Error('glTF has no skin/joints to bake');
  }
  if (gltf.skins.length !== 1) throw new Error('export one composite deform skin per appearance');
  const joints = skin.joints;
  const parentOfNode = new Map();
  gltf.nodes.forEach((node, index) => {
    for (const child of node.children || []) {
      if (parentOfNode.has(child)) throw new Error(`node ${child} has multiple parents; export a tree hierarchy`);
      parentOfNode.set(child, index);
    }
  });
  const inverseBinds = skin.inverseBindMatrices != null
    ? readAccessor(gltf, glbBin, skin.inverseBindMatrices)
    : null;
  for (const matrix of inverseBinds || []) decomposeMatrix(matrix);

  // A transform between joints (or above the root) cannot be dropped or
  // folded into world tracks: mounted masks compose these LOCAL transforms.
  const order = [];
  const boneOfNode = new Map();
  const visiting = new Set();
  const visit = (node) => {
    if (boneOfNode.has(node)) return;
    if (!gltf.nodes[node]) throw new Error(`missing skeleton node ${node}`);
    if (visiting.has(node)) throw new Error(`cycle at skeleton node ${node}; export a tree hierarchy`);
    visiting.add(node);
    if (parentOfNode.has(node)) visit(parentOfNode.get(node));
    visiting.delete(node);
    boneOfNode.set(node, order.length);
    order.push(node);
  };
  for (const node of joints) visit(node);
  const jointOfNode = new Map(joints.map((node, slot) => [node, slot]));
  const bones = order.map((nodeIndex) => {
    const node = gltf.nodes[nodeIndex];
    const slot = jointOfNode.get(nodeIndex);
    return {
      name: node.name || `node_${nodeIndex}`,
      sourceNode: nodeIndex,
      parent: parentOfNode.has(nodeIndex) ? boneOfNode.get(parentOfNode.get(nodeIndex)) : -1,
      bind: nodeTRS(node),
      inverseBind: slot != null && inverseBinds ? Float32Array.from(inverseBinds[slot]) : mat4Identity(),
    };
  });

  const clips = (gltf.animations || []).map((animation, index) =>
    animationToClip(animation, index, gltf, glbBin, boneOfNode, clipNames));
  return { bones, clips, skinJoints: joints.map((node) => boneOfNode.get(node)) };
}

function animationToClip(animation, index, gltf, glbBin, boneOfNode, clipNames) {
  const tracks = {};
  let duration = 0;
  for (const channel of animation.channels) {
    const targetNode = channel.target.node;
    const key = CHANNEL_KEY[channel.target.path];
    if (key === undefined) throw new Error(`animation target ${channel.target.path} unsupported; bake skeletal TRS animation`);
    if (!boneOfNode.has(targetNode)) throw new Error(`animation node ${targetNode} is outside the deform hierarchy; bake motion onto deform bones`);
    const boneIndex = boneOfNode.get(targetNode);
    const sampler = animation.samplers[channel.sampler];
    if (sampler.interpolation != null && !['LINEAR', 'STEP'].includes(sampler.interpolation)) {
      throw new Error(`animation ${animation.name || index}: unsupported ${sampler.interpolation} interpolation; bake sampled LINEAR deform tracks in Blender`);
    }
    const times = readAccessor(gltf, glbBin, sampler.input);
    const values = readAccessor(gltf, glbBin, sampler.output);
    const input = gltf.accessors[sampler.input];
    const output = gltf.accessors[sampler.output];
    if (input.type !== 'SCALAR' || input.componentType !== 5126 || input.normalized
      || output.type !== (key === 'R' ? 'VEC4' : 'VEC3') || output.componentType !== 5126 || output.normalized
      || input.count === 0 || output.count !== input.count) {
      throw new Error('animation sampler type/count mismatch; export matching FLOAT time and TRS tracks');
    }
    if (times.some((time, i) => time < 0 || (i > 0 && time <= times[i - 1]))) {
      throw new Error('animation sampler times must be nonnegative and strictly increasing; re-export sampled tracks');
    }
    if (key === 'S') for (const scale of values) validateScale(scale);
    duration = Math.max(duration, times.length ? times[times.length - 1] : 0);
    tracks[boneIndex] = tracks[boneIndex] || {};
    tracks[boneIndex][key] = { times, values: values.flat(), interpolation: sampler.interpolation ?? 'LINEAR' };
  }
  const rawName = animation.name || `clip_${index}`;
  const name = clipNames?.[rawName] ?? clipNames?.[index] ?? rawName;
  return { name, duration, tracks };
}

/** Import the authored mesh and bake its deform skeleton. */
export function bakeGltf(buffer, { fps = 12, skeleton = 'imported-gltf', clipNames } = {}) {
  const { json, bin } = parseGlb(buffer);
  return bakeGltfJson(json, bin, { fps, skeleton, clipNames });
}

export function bakeGltfJson(gltf, glbBin, { fps = 12, skeleton = 'imported-gltf', clipNames } = {}) {
  const rig = gltfToRig(gltf, glbBin, { clipNames });
  const baked = bakeRig(rig, fps);
  const primitives = importedPrimitives(gltf, glbBin, rig);
  return { rig, bake: vatBakeFrom(baked, skeleton, fps), boneNames: rig.bones.map((b) => b.name), primitives };
}

function importedPrimitives(gltf, glbBin, rig) {
  if (rig.bones.length > 65535) throw new Error('expanded skeleton exceeds 65535 rows; reduce the deform hierarchy');
  const result = [];
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  if (!scene) throw new Error('glTF has no default scene; export the appearance in a scene');
  const activeNodes = new Set();
  const visit = (index) => {
    if (activeNodes.has(index)) return;
    if (!gltf.nodes[index]) throw new Error(`scene references missing node ${index}`);
    activeNodes.add(index);
    for (const child of gltf.nodes[index].children || []) visit(child);
  };
  for (const root of scene.nodes || []) visit(root);
  gltf.nodes.forEach((node, nodeIndex) => {
    if (!activeNodes.has(nodeIndex) || node.mesh == null) return;
    if (node.skin !== 0) throw new Error(`mesh node ${node.name || nodeIndex}: skin rigid equipment to the single deform skeleton`);
    const mesh = gltf.meshes[node.mesh];
    mesh.primitives.forEach((primitive, primitiveIndex) => {
      const label = `mesh ${node.name || nodeIndex} primitive ${primitiveIndex}`;
      if (primitive.targets?.length) throw new Error(`${label}: morph targets unsupported; bake deformation into skeletal tracks`);
      if (primitive.mode != null && primitive.mode !== 4) throw new Error(`${label}: export indexed triangles`);
      if (primitive.extensions && Object.keys(primitive.extensions).length) throw new Error(`${label}: primitive extensions/compression unsupported; export uncompressed core glTF`);
      const attributes = primitive.attributes;
      if (Object.keys(attributes).some((key) => /^(JOINTS|WEIGHTS)_[1-9]/.test(key))) {
        throw new Error(`${label}: more than four influences; reduce weights in Blender and inspect deformation error before export`);
      }
      const read = (semantic, type) => {
        const index = attributes[semantic];
        if (index == null) throw new Error(`${label}: missing ${semantic}; export normals, UVs, tangents and four skin influences`);
        const accessor = gltf.accessors[index];
        if (accessor.type !== type) throw new Error(`${label}: ${semantic} must be ${type}`);
        const unsigned = [5121, 5123].includes(accessor.componentType);
        const float = accessor.componentType === 5126 && !accessor.normalized;
        const validEncoding = semantic === 'JOINTS_0'
          ? unsigned && !accessor.normalized
          : ['WEIGHTS_0', 'TEXCOORD_0', 'COLOR_0'].includes(semantic)
            ? float || (unsigned && accessor.normalized)
            : float;
        if (!validEncoding) throw new Error(`${label}: ${semantic} encoding unsupported; export core glTF float attributes or normalized unsigned weights/UVs/colors`);
        if (accessor.count !== gltf.accessors[attributes.POSITION].count) {
          throw new Error(`${label}: ${semantic} count must match POSITION; repair the source mesh`);
        }
        return readAccessor(gltf, glbBin, index);
      };
      const positions = Float32Array.from(read('POSITION', 'VEC3').flat());
      const normals = Float32Array.from(read('NORMAL', 'VEC3').flat());
      const tangents = Float32Array.from(read('TANGENT', 'VEC4').flat());
      const uvs = Float32Array.from(read('TEXCOORD_0', 'VEC2').flat());
      const weights = Float32Array.from(read('WEIGHTS_0', 'VEC4').flat());
      const joints = Uint16Array.from(read('JOINTS_0', 'VEC4').flat(), (slot) => {
        if (!Number.isInteger(slot) || rig.skinJoints[slot] == null) throw new Error(`${label}: joint slot ${slot} is outside the skin`);
        return rig.skinJoints[slot];
      });
      const vertices = positions.length / 3;
      for (let vertex = 0; vertex < vertices; vertex++) {
        const influences = weights.subarray(vertex * 4, vertex * 4 + 4);
        const sum = influences.reduce((total, weight) => total + weight, 0);
        if (influences.some((weight) => !Number.isFinite(weight) || weight < 0)
          || Math.abs(sum - 1) > 1e-4) {
          throw new Error(`${label}: vertex ${vertex} weights must be nonnegative and normalized; normalize all four influences in Blender`);
        }
      }
      const colors = attributes.COLOR_0 == null
        ? new Float32Array(vertices * 4).fill(1)
        : Float32Array.from(read('COLOR_0', gltf.accessors[attributes.COLOR_0].type === 'VEC3' ? 'VEC3' : 'VEC4')
          .flatMap((color) => [...color.slice(0, 3), color[3] ?? 1]));
      const factionMasks = attributes._FACTION_MASK === undefined
        ? new Float32Array(vertices)
        : Float32Array.from(read('_FACTION_MASK', 'SCALAR'));
      if (factionMasks.some((value) => value < 0 || value > 1)) {
        throw new Error(`${label}: _FACTION_MASK values must be between zero and one`);
      }
      if (primitive.indices != null) {
        const accessor = gltf.accessors[primitive.indices];
        if (accessor.type !== 'SCALAR' || ![5121, 5123, 5125].includes(accessor.componentType) || accessor.normalized) {
          throw new Error(`${label}: index encoding must be non-normalized unsigned SCALAR; re-export indexed triangles`);
        }
      }
      const sourceIndices = primitive.indices == null
        ? Array.from({ length: vertices }, (_, i) => i)
        : readAccessor(gltf, glbBin, primitive.indices);
      if (sourceIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= vertices)) {
        throw new Error(`${label}: index outside vertex range; repair the source mesh`);
      }
      if (sourceIndices.length % 3 !== 0) throw new Error(`${label}: triangle index count must be divisible by three; triangulate the source mesh`);
      const indices = vertices > 65536 ? Uint32Array.from(sourceIndices) : Uint16Array.from(sourceIndices);
      result.push({ nodeIndex, nodeName: node.name || `node_${nodeIndex}`, meshIndex: node.mesh,
        primitiveIndex, materialIndex: primitive.material ?? null,
        positions, normals, tangents, uvs, colors, factionMasks, joints, weights, indices });
    });
  });
  if (result.length === 0) throw new Error('glTF has no skinned mesh; include the weighted source mesh in the export');
  return result;
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
