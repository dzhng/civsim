// glTF→VAT round-trip: the checked-in test .glb must parse to the same rig a
// hand-built equivalent describes, bake to a byte-identical VAT, and the parser
// must reject malformed input with a specific error. No browser, no deps.
// Run: node packages/soldier-assets/bake/gltf.test.mjs

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bakeRig, mat4FromTRS, readJoint, transformPoint } from './vat.mjs';
import { bakeGltf, bakeGltfJson, gltfToRig, parseGlb } from './gltf.mjs';
import { makeTestGlb, buildTestGltf, encodeGlb } from './make-test-glb.mjs';
import { REQUIRED_HUMAN_CLIP_NAMES } from './clip-contract.mjs';

const GLB = new URL('../assets/test/two-bone.glb', import.meta.url);
const FPS = 12;
const qz = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];

// The hand-built rig the fixture encodes — gltfToRig must reproduce this.
function handRig() {
  const identity = mat4FromTRS([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
  const negX = mat4FromTRS([-1, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
  const bones = [
    { name: 'root', parent: -1, bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] }, inverseBind: identity },
    { name: 'tip', parent: 0, bind: { T: [1, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] }, inverseBind: negX },
  ];
  const clips = REQUIRED_HUMAN_CLIP_NAMES.map((name, index) => {
    const amp = 0.18 + index * 0.06;
    return {
      name,
      duration: 1,
      tracks: { 1: { R: { times: [0, 0.5, 1], values: [qz(0), qz(amp), qz(0)].flat() } } },
    };
  });
  return { bones, clips };
}

// 1. The checked-in fixture is byte-identical to the generator (no stale blob).
{
  const onDisk = new Uint8Array(await readFile(GLB));
  const fresh = makeTestGlb();
  assert.deepEqual(Array.from(onDisk), Array.from(fresh), 'checked-in two-bone.glb is out of date — re-run make-test-glb.mjs');
}

// 2. gltfToRig reproduces the hand-built rig (names, parents, bind, clips).
{
  const { gltf, floats } = buildTestGltf();
  const bin = new Uint8Array(floats.length * 4);
  const dv = new DataView(bin.buffer);
  floats.forEach((v, i) => dv.setFloat32(i * 4, v, true));
  gltf.buffers = [{ byteLength: bin.byteLength }];
  const rig = gltfToRig(gltf, bin);
  const expected = handRig();
  assert.equal(rig.bones.length, 2);
  assert.deepEqual(rig.bones.map((b) => b.name), ['root', 'tip']);
  assert.deepEqual(rig.bones.map((b) => b.parent), [-1, 0]);
  assert.deepEqual(rig.clips.map((c) => c.name), REQUIRED_HUMAN_CLIP_NAMES);
  for (let b = 0; b < 2; b++) {
    rig.bones[b].inverseBind.forEach((v, i) => assert.ok(Math.abs(v - expected.bones[b].inverseBind[i]) < 1e-6));
  }
}

// 3. The rig-only numeric fixture matches the hand-built rig bake.
{
  const { json, bin } = parseGlb(makeTestGlb());
  const bake = bakeRig(gltfToRig(json, bin), FPS);
  const golden = bakeRig(handRig(), FPS);
  assert.equal(bake.width, golden.width, 'VAT width mismatch');
  assert.equal(bake.height, golden.height, 'VAT height mismatch');
  assert.equal(bake.bones, 2);
  assert.deepEqual(bake.clips.map((c) => c.name), REQUIRED_HUMAN_CLIP_NAMES);
  assert.equal(bake.data.length, golden.data.length);
  for (let i = 0; i < golden.data.length; i++) {
    assert.ok(Math.abs(bake.data[i] - golden.data[i]) < 1e-6, `VAT float ${i} differs: ${bake.data[i]} vs ${golden.data[i]}`);
  }
}

// 4. Malformed input fails with a specific, non-crash error.
{
  assert.throws(() => parseGlb(new Uint8Array([1, 2, 3, 4])), /bad magic/, 'non-GLB bytes must be rejected');
  const noSkin = { asset: { version: '2.0' }, nodes: [{ name: 'a' }] };
  assert.throws(() => gltfToRig(noSkin, null), /no skin/, 'glTF without a skin must be rejected');
}

// A non-joint scene ancestor participates in skin deformation and remains a
// local transform, so later rider masks can compose before hierarchy evaluation.
{
  const source = buildTestGltf();
  source.gltf.nodes.push({ name: 'placement', children: [0], translation: [4, 5, 6] });
  source.gltf.scenes[0].nodes = [2];
  const { json, bin } = parseGlb(encodeGlb(source));
  const rig = gltfToRig(json, bin);
  const bake = bakeRig(rig, FPS);
  const root = rig.bones.findIndex((bone) => bone.name === 'root');
  const actual = transformPoint(readJoint(bake, root, 0), [1, 0, 0]);
  assert.deepEqual(actual, [5, 5, 6], 'the scene ancestor must affect the deformed surface');
  assert.deepEqual(rig.bones[rig.bones[root].parent].bind.T, [4, 5, 6]);
}

// The accepted human fixture is an independent Blender-evaluated surface
// oracle, including its four-weight elbow and constrained forearm animation.
for (const id of ['human', 'mounted']) {
  const base = new URL('../assets/test/blender-reference/', import.meta.url);
  const expected = JSON.parse(await readFile(new URL(`${id}.landmarks.json`, base), 'utf8'));
  const imported = bakeGltf(await readFile(new URL(`${id}.glb`, base)), { fps: expected.fps });
  if (id === 'mounted') {
    const tracks = {};
    for (const clip of imported.rig.clips) {
      for (const [bone, track] of Object.entries(clip.tracks)) {
        const inMask = expected.riderUpperBodyMask.includes(imported.rig.bones[bone].name);
        if (inMask === (clip.name === 'rider-action')) tracks[bone] = track;
      }
    }
    imported.rig.clips.push({ name: 'composed', duration: 1, tracks });
    imported.bake = bakeRig(imported.rig, expected.fps);
  }
  let maximumError = 0;
  for (const sample of expected.samples) {
    const clip = imported.bake.clips.find((clip) => clip.name === sample.clip);
    for (const mapping of expected.meshes) {
      const mesh = imported.primitives.find((p) => p.nodeName === mapping.node && p.primitiveIndex === mapping.primitive);
      for (let vertex = 0; vertex < mapping.sourceVertexByGltfVertex.length; vertex++) {
        const actual = skinPosition(mesh, vertex, imported.bake, clip.start + Math.round(sample.seconds * expected.fps));
        const target = sample.positions[mapping.node][mapping.sourceVertexByGltfVertex[vertex]];
        const error = Math.hypot(...actual.map((value, i) => value - target[i]));
        maximumError = Math.max(maximumError, error);
        assert.ok(error < expected.toleranceMetres, `${sample.name}/${mapping.node}/${vertex}: ${error}m`);
      }
    }
  }
  console.log(`${id} Blender surface parity: maximum error ${maximumError}m`);
}

function skinPosition(mesh, vertex, bake, frame) {
  const point = mesh.positions.subarray(vertex * 3, vertex * 3 + 3);
  const result = [0, 0, 0];
  for (let influence = 0; influence < 4; influence++) {
    const offset = vertex * 4 + influence;
    const posed = transformPoint(readJoint(bake, mesh.joints[offset], frame), point);
    for (let axis = 0; axis < 3; axis++) result[axis] += mesh.weights[offset] * posed[axis];
  }
  return result;
}

// glTF normalized unsigned weights decode to fractions, never integer-sized
// influences. Imported skinning must actually land on the blended position.
{
  const { gltf, bin } = weightedTriangle({ integerWeights: true });
  const imported = bakeGltfJson(gltf, bin, { fps: 2 });
  const mesh = imported.primitives[0];
  assert.ok(Math.abs(mesh.weights[0] - 64 / 255) < 1e-7);
  assert.ok(Math.abs(mesh.weights[1] - 191 / 255) < 1e-7);
  assert.deepEqual(Array.from(mesh.colors.subarray(0, 4)), [1, 1, 1, 1]);
  const angle = 0.18;
  const actual = skinPosition(mesh, 0, imported.bake, 1);
  const target = [64 / 255 * 2 + 191 / 255 * (1 + Math.cos(angle)), 191 / 255 * Math.sin(angle), 0];
  assert.ok(Math.hypot(...actual.map((v, i) => v - target[i])) < 1e-6);
}

// A source with a fifth influence must fail at export import, never render a
// plausible but different dominant-joint (or first-four-only) approximation.
{
  const { gltf, bin } = weightedTriangle();
  gltf.meshes[0].primitives[0].attributes.WEIGHTS_1 = gltf.meshes[0].primitives[0].attributes.WEIGHTS_0;
  assert.throws(() => bakeGltfJson(gltf, bin), /four.*influence|influence.*four/);
}

// Large meshes retain the actual last index; malformed small meshes cannot
// become apparently valid when their out-of-range index is cast to Uint16.
{
  const source = weightedTriangle({ vertexCount: 65537 });
  const { primitives: [mesh] } = bakeGltfJson(source.gltf, source.bin);
  assert.ok(mesh.indices instanceof Uint32Array);
  assert.equal(mesh.indices[2], 65536);
  const small = weightedTriangle();
  const accessor = small.gltf.accessors[small.gltf.meshes[0].primitives[0].indices];
  const view = small.gltf.bufferViews[accessor.bufferView];
  new DataView(small.bin.buffer).setUint32(view.byteOffset + 8, 65536, true);
  assert.throws(() => bakeGltfJson(small.gltf, small.bin), /index.*outside|index.*range/);
}

// Current crowd normals support rigid/positive-uniform joint transforms.
// Unsupported authoring transforms must be corrected before they reach a GPU.
{
  for (const scale of [[2, 1, 1], [-1, 1, 1], [0, 0, 0]]) {
    const source = buildTestGltf();
    source.gltf.nodes[0].scale = scale;
    assert.throws(() => bakeGltf(encodeGlb(source)), /scale.*apply|apply.*scale/);
  }
  const source = buildTestGltf();
  source.gltf.nodes[0].matrix = [...mat4FromTRS([0, 0, 0], [0, 0, 0, 1], [1, 1, 1])];
  source.gltf.nodes[0].matrix[4] = .3;
  assert.throws(() => bakeGltf(encodeGlb(source)), /scale|shear/);
}

// Blender emits STEP for constant tracks; preserve held values. Cubic source
// curves require baking because this boundary accepts sampled LINEAR/STEP TRS.
{
  const cubic = buildTestGltf();
  cubic.gltf.animations[0].samplers[0].interpolation = 'CUBICSPLINE';
  assert.throws(() => bakeGltf(encodeGlb(cubic)), /interpolation.*bake|bake.*LINEAR/);
  const step = buildTestGltf();
  step.gltf.animations[0].samplers[0].interpolation = 'STEP';
  const { json, bin } = parseGlb(encodeGlb(step));
  const bake = bakeRig(gltfToRig(json, bin), 4);
  assert.deepEqual(transformPoint(readJoint(bake, 1, 1), [2, 0, 0]), [2, 0, 0]);
}

// The scale contract also applies to inverse binds and animation, not just
// node defaults; otherwise normals can be wrong only after a pose changes.
{
  const source = weightedTriangle();
  const sampler = source.gltf.animations[0].samplers[0];
  sampler.output = source.gltf.meshes[0].primitives[0].attributes.NORMAL;
  source.gltf.animations[0].channels[0].target.path = 'scale';
  assert.throws(() => bakeGltfJson(source.gltf, source.bin), /scale.*apply|apply.*scale/);
  const inverse = weightedTriangle();
  const accessor = inverse.gltf.accessors[inverse.gltf.skins[0].inverseBindMatrices];
  new DataView(inverse.bin.buffer).setFloat32(inverse.gltf.bufferViews[accessor.bufferView].byteOffset, 2, true);
  assert.throws(() => bakeGltfJson(inverse.gltf, inverse.bin), /scale.*apply|apply.*scale/);
}

// Unsupported source encodings cannot silently render their base geometry.
{
  const sparse = weightedTriangle();
  sparse.gltf.accessors[sparse.gltf.meshes[0].primitives[0].attributes.POSITION].sparse = { count: 1 };
  assert.throws(() => bakeGltfJson(sparse.gltf, sparse.bin), /sparse.*export/);
}

{
  assert.throws(() => bakeGltf(makeTestGlb()), /no skinned mesh/);
  for (const [field, value, error] of [
    ['targets', [{ POSITION: 0 }], /morph.*bake/],
    ['mode', 1, /triangles/],
    ['extensions', { KHR_draco_mesh_compression: {} }, /compression|extension/],
  ]) {
    const source = weightedTriangle();
    source.gltf.meshes[0].primitives[0][field] = value;
    assert.throws(() => bakeGltfJson(source.gltf, source.bin), error);
  }
}

{
  const source = weightedTriangle();
  source.gltf.animations[0].channels[0].target.node = 2;
  assert.throws(() => bakeGltfJson(source.gltf, source.bin), /outside.*hierarchy.*bake/);
  source.gltf.animations[0].channels[0].target.node = 0;
  source.gltf.animations[0].channels[0].target.path = 'weights';
  assert.throws(() => bakeGltfJson(source.gltf, source.bin), /weights.*bake/);
}

// Invalid skin weights cannot be repaired by silently choosing another skin.
{
  const source = weightedTriangle();
  const accessor = source.gltf.accessors[source.gltf.meshes[0].primitives[0].attributes.WEIGHTS_0];
  new DataView(source.bin.buffer).setFloat32(source.gltf.bufferViews[accessor.bufferView].byteOffset, 2, true);
  assert.throws(() => bakeGltfJson(source.gltf, source.bin), /weights.*normalized/);
}

{
  const source = weightedTriangle();
  source.gltf.accessors[source.gltf.meshes[0].primitives[0].attributes.NORMAL].count--;
  assert.throws(() => bakeGltfJson(source.gltf, source.bin), /NORMAL.*count/);
}

{
  const source = weightedTriangle();
  const accessor = source.gltf.accessors[source.gltf.meshes[0].primitives[0].attributes.POSITION];
  new DataView(source.bin.buffer).setFloat32(source.gltf.bufferViews[accessor.bufferView].byteOffset, NaN, true);
  assert.throws(() => bakeGltfJson(source.gltf, source.bin), /nonfinite.*export/);
}

{
  const source = weightedTriangle();
  source.gltf.accessors[source.gltf.animations[0].samplers[0].output].count--;
  assert.throws(() => bakeGltfJson(source.gltf, source.bin), /sampler.*count/);
}

{
  const source = weightedTriangle();
  source.gltf.nodes.push({ name: 'unused-prop', mesh: 0 });
  const imported = bakeGltfJson(source.gltf, source.bin);
  assert.deepEqual(imported.primitives.map((mesh) => mesh.nodeName), ['weighted-triangle']);
}

{
  const source = weightedTriangle();
  const accessor = source.gltf.accessors[source.gltf.meshes[0].primitives[0].attributes.JOINTS_0];
  accessor.normalized = true;
  const view = source.gltf.bufferViews[accessor.bufferView];
  source.bin.fill(0, view.byteOffset, view.byteOffset + view.byteLength);
  assert.throws(() => bakeGltfJson(source.gltf, source.bin), /JOINTS_0.*encoding/);
}

function weightedTriangle({ integerWeights = false, vertexCount = 3 } = {}) {
  const { gltf, floats } = buildTestGltf();
  const chunks = [new Uint8Array(new Float32Array(floats).buffer)];
  let length = chunks[0].byteLength;
  const append = (array, type, componentType, normalized = false) => {
    const padding = (4 - length % 4) % 4;
    chunks.push(new Uint8Array(padding));
    length += padding;
    gltf.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: array.byteLength });
    chunks.push(new Uint8Array(array.buffer));
    length += array.byteLength;
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
    gltf.accessors.push({ bufferView: gltf.bufferViews.length - 1, componentType, type,
      count: array.length / components, normalized });
    return gltf.accessors.length - 1;
  };
  const repeat = (values, Type) => Type.from(Array.from({ length: vertexCount }, () => values).flat());
  const attributes = {
    POSITION: append(repeat([2, 0, 0], Float32Array), 'VEC3', 5126),
    NORMAL: append(repeat([0, 1, 0], Float32Array), 'VEC3', 5126),
    TANGENT: append(repeat([1, 0, 0, 1], Float32Array), 'VEC4', 5126),
    TEXCOORD_0: append(repeat([0, 0], Float32Array), 'VEC2', 5126),
    JOINTS_0: append(repeat([0, 1, 0, 0], Uint8Array), 'VEC4', 5121),
    WEIGHTS_0: integerWeights
      ? append(repeat([64, 191, 0, 0], Uint8Array), 'VEC4', 5121, true)
      : append(repeat([.25, .75, 0, 0], Float32Array), 'VEC4', 5126),
  };
  const indices = append(new Uint32Array([0, 1, vertexCount - 1]), 'SCALAR', 5125);
  gltf.meshes = [{ primitives: [{ attributes, indices }] }];
  gltf.nodes.push({ name: 'weighted-triangle', mesh: 0, skin: 0 });
  gltf.scenes[0].nodes.push(2);
  const bin = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bin.set(chunk, offset); offset += chunk.byteLength; }
  gltf.buffers = [{ byteLength: length }];
  return { gltf, bin };
}

console.log('gltf.test.mjs: all glTF→VAT round-trip checks passed');
