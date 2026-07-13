// Real-skeleton tracer bake: the Quaternius Universal Animation Library
// mannequin (assets/incoming/, CC0 — see PROVENANCE.md) → the crowd pipeline's
// existing contracts. Produces two web assets for the class listed in
// kit.classVats/classMeshes:
//   baked/ual-mannequin.vat.json  — VatBake, 53 bones, the 8 contract clips
//   baked/ual-mannequin.mesh.json — stride-11 interleaved mesh, ONE flat color
//
// The crowd shader skins with a single bone index per vertex, so this bake
// collapses the mannequin's 4-weight skinning to the dominant joint. That is
// the tracer's known quality ceiling (hard creases at elbows/knees), not a
// pipeline property — 4-weight skinning is the follow-up slice.
//
// Space conversion: the glTF rig is y-up, +Z-facing, metres; the engine is
// z-up, +Y-facing. Both the bind-pose vertices and every baked joint matrix
// are conjugated through the same proper rotation R (det +1, no mirroring)
// with a uniform scale to placeholder stature, so skinning commutes:
//   v' = s·R·v,  M' = R·M·Rᵀ (translation × s)  ⇒  M'·v' = s·R·(M·v).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeGltfJson } from './gltf.mjs';

const GLTF = new URL('../assets/incoming/AnimationLibrary.gltf', import.meta.url);
const BIN = new URL('../assets/incoming/AnimationLibrary_Godot_Standard.bin', import.meta.url);
const WEB_VAT = new URL('../../../web/public/assets/soldiers/baked/ual-mannequin.vat.json', import.meta.url);
const WEB_MESH = new URL('../../../web/public/assets/soldiers/baked/ual-mannequin.mesh.json', import.meta.url);

const FPS = 12;
const SKELETON = 'ual-rigify-human';
// Placeholder soldiers stand ~2.0 units to the helmet; the mannequin is 1.83 m.
const SCALE = 1.1;
// One flat clay color for every vertex — the "1 color skin" tracer look.
const FLAT_COLOR = [0.66, 0.55, 0.42, 1];

/** Source clip → contract clip id. shoot is a stand-in (no CC0 bow clip). */
const CLIP_NAMES = {
  Idle_Loop: 'idle',
  Walk_Formal_Loop: 'march',
  Jog_Fwd_Loop: 'run',
  Sword_Attack: 'attack_a',
  Hit_Chest: 'hit_a',
  Spell_Simple_Shoot: 'shoot',
  Death01: 'death_a',
  Sword_Idle: 'at_ease',
};

// R: gltf (y-up, +Z fwd) → engine (z-up, +Y fwd): (x,y,z) → (-x, z, y).
const rot = ([x, y, z]) => [-x, z, y];

const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(gltf, bin, index) {
  const acc = gltf.accessors[index];
  const view = gltf.bufferViews[acc.bufferView];
  const comps = TYPE_COMPONENTS[acc.type];
  const compSize = COMPONENT_SIZE[acc.componentType];
  const stride = view.byteStride ?? comps * compSize;
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const read = {
    5121: (o) => dv.getUint8(o),
    5123: (o) => dv.getUint16(o, true),
    5125: (o) => dv.getUint32(o, true),
    5126: (o) => dv.getFloat32(o, true),
  }[acc.componentType];
  if (!read) throw new Error(`unsupported componentType ${acc.componentType}`);
  const out = new Array(acc.count * comps);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < comps; c++) out[i * comps + c] = read(base + i * stride + c * compSize);
  }
  return { data: out, comps, count: acc.count };
}

/** Skin-order joint slot → VAT bone row (the importer reorders parent-first). */
function jointPermutation(gltf, boneNames) {
  const skin = gltf.skins[0];
  return skin.joints.map((node) => {
    const name = gltf.nodes[node].name;
    const row = boneNames.indexOf(name);
    if (row < 0) throw new Error(`joint ${name} missing from baked bone order`);
    return row;
  });
}

function buildMesh(gltf, bin, perm) {
  const mesh = gltf.meshes.find((m) => m.name === 'Mannequin');
  if (!mesh) throw new Error('Mannequin mesh not found');
  const vertices = [];
  const indices = [];
  let vertexBase = 0;
  for (const prim of mesh.primitives) {
    const pos = readAccessor(gltf, bin, prim.attributes.POSITION);
    const nrm = readAccessor(gltf, bin, prim.attributes.NORMAL);
    const joints = readAccessor(gltf, bin, prim.attributes.JOINTS_0);
    const weights = readAccessor(gltf, bin, prim.attributes.WEIGHTS_0);
    for (let i = 0; i < pos.count; i++) {
      const p = rot(pos.data.slice(i * 3, i * 3 + 3)).map((c) => c * SCALE);
      const n = rot(nrm.data.slice(i * 3, i * 3 + 3));
      let best = 0;
      let bestW = -1;
      for (let k = 0; k < 4; k++) {
        const w = weights.data[i * 4 + k];
        if (w > bestW) { bestW = w; best = joints.data[i * 4 + k]; }
      }
      vertices.push(...p, ...n, ...FLAT_COLOR, perm[best]);
    }
    const idx = readAccessor(gltf, bin, prim.indices);
    for (const j of idx.data) indices.push(vertexBase + j);
    vertexBase += pos.count;
  }
  if (vertexBase > 0xffff) throw new Error(`vertex count ${vertexBase} exceeds Uint16 indices`);
  return { vertices, indices };
}

/** Conjugate every baked joint matrix in place: M' = R·M·Rᵀ, translation × s.
 *  Columns land as: c0' = R·(-c0), c1' = R·c2, c2' = R·c1, c3' = s·R·c3. */
function conjugateVat(bake) {
  const { width, height, data } = bake;
  const col = (b, c, f) => ((b * 4 + c) * width + f) * 4;
  for (let b = 0; b < bake.bones; b++) {
    for (let f = 0; f < width; f++) {
      const o0 = col(b, 0, f);
      const o1 = col(b, 1, f);
      const o2 = col(b, 2, f);
      const o3 = col(b, 3, f);
      const c0 = [data[o0], data[o0 + 1], data[o0 + 2]];
      const c1 = [data[o1], data[o1 + 1], data[o1 + 2]];
      const c2 = [data[o2], data[o2 + 1], data[o2 + 2]];
      const c3 = [data[o3], data[o3 + 1], data[o3 + 2]];
      const n0 = rot([-c0[0], -c0[1], -c0[2]]);
      const n1 = rot(c2);
      const n2 = rot(c1);
      const n3 = rot(c3).map((c) => c * SCALE);
      [data[o0], data[o0 + 1], data[o0 + 2]] = n0;
      [data[o1], data[o1 + 1], data[o1 + 2]] = n1;
      [data[o2], data[o2 + 1], data[o2 + 2]] = n2;
      [data[o3], data[o3 + 1], data[o3 + 2]] = n3;
    }
  }
  if (height !== bake.bones * 4) throw new Error('VAT height/bones mismatch');
}

function hashNumbers(numbers) {
  const floats = new Float32Array(numbers);
  return createHash('sha256').update(Buffer.from(floats.buffer)).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value)}\n`;
}

export async function bakeUalMannequin({ write = true } = {}) {
  const gltf = JSON.parse(await readFile(GLTF, 'utf8'));
  const bin = new Uint8Array(await readFile(BIN));
  delete gltf.buffers[0].uri; // the sibling .bin plays the GLB binary chunk
  gltf.animations = gltf.animations.filter((a) => a.name in CLIP_NAMES);

  const { bake, boneNames } = bakeGltfJson(gltf, bin, { fps: FPS, skeleton: SKELETON, clipNames: CLIP_NAMES });
  conjugateVat(bake);
  bake.data = bake.data.map((v) => Number(v.toFixed(8)));
  bake.sha256 = hashNumbers(bake.data);

  const perm = jointPermutation(gltf, boneNames);
  const { vertices, indices } = buildMesh(gltf, bin, perm);
  const mesh = {
    schema: 1,
    source: 'Quaternius Universal Animation Library Mannequin (CC0) — assets/incoming/PROVENANCE.md',
    skeleton: SKELETON,
    vertexStrideFloats: 11,
    vertices: vertices.map((v) => Number(v.toFixed(5))),
    indices,
  };

  if (write) {
    await mkdir(dirname(fileURLToPath(WEB_VAT)), { recursive: true });
    await writeFile(WEB_VAT, stableJson(bake));
    await writeFile(WEB_MESH, stableJson(mesh));
  }
  return { bake, mesh };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { bake, mesh } = await bakeUalMannequin();
  console.log(`ual-mannequin: ${bake.bones} bones, ${bake.width}x${bake.height} VAT, clips [${bake.clips.map((c) => c.name).join(', ')}]`);
  console.log(`mesh: ${mesh.vertices.length / 11} verts, ${mesh.indices.length / 3} tris`);
}
