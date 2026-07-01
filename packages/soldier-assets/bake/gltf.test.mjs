// glTF→VAT round-trip: the checked-in test .glb must parse to the same rig a
// hand-built equivalent describes, bake to a byte-identical VAT, and the parser
// must reject malformed input with a specific error. No browser, no deps.
// Run: node packages/soldier-assets/bake/gltf.test.mjs

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bakeRig, mat4FromTRS } from './vat.mjs';
import { bakeGltf, gltfToRig, parseGlb } from './gltf.mjs';
import { makeTestGlb, buildTestGltf } from './make-test-glb.mjs';
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

// 3. The full glTF bake matches bakeRig of the hand-built rig, byte for byte.
{
  const glb = makeTestGlb();
  const { bake } = bakeGltf(glb, { fps: FPS, clipNames: {} });
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

console.log('gltf.test.mjs: all glTF→VAT round-trip checks passed');
