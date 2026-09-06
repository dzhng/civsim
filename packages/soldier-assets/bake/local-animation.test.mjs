import assert from 'node:assert/strict';
import { bakeLocalAnimation, resolveLocalSample, decodeLocalSample, packLocalPose } from '../src/localAnimation.ts';
import { mat4Identity, sampleRigLocalPose, sampleRigLocalPoseSeconds, localPoseToJointMatrices, blendLocalPoses, composeMaskedLocals } from '../src/localPose.ts';
import { decodeSoldierMesh } from '../src/appearanceBundle.ts';
import { poseSoldierMesh } from '../src/skin.ts';
import { readFile } from 'node:fs/promises';

const bone = { name: 'root', parent: -1, bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] }, inverseBind: mat4Identity() };
const rig = { bones: [bone], clips: [{ name: 'step', duration: 1, loop: true, markers: { release: .371 }, tracks: { 0: {
  T: { times: [0, .371, 1], values: [0, 0, 0, 0, 2, 0, 0, 3, 0], interpolation: 'STEP' },
} } }] };
const animation = bakeLocalAnimation(rig);
for (const [phase, y] of [[.371 - 1e-10, 0], [.371, 2], [.371 + 1e-10, 2], [1, 3], [2, 3], [-1, 0]]) {
  const resolved = resolveLocalSample(animation, 'step', phase);
  assert.equal(decodeLocalSample(animation, resolved)[1], y, `STEP boundary at ${phase}`);
}
assert.equal(resolveLocalSample(animation, 'step', .371 - 1e-10).fraction, 1, 'Float32 alpha rounds to one before the boundary; STEP must still hold left');
assert.equal(resolveLocalSample(animation, 'step', 1).sampleA, resolveLocalSample(animation, 'step', 1).sampleB);
assert.equal(animation.clips[0].markers.release, .371);
const roundedKey = structuredClone(rig);
roundedKey.clips[0].duration = .17;
roundedKey.clips[0].tracks[0].T.times = [0, .09, 1];
assert.equal(sampleRigLocalPoseSeconds(roundedKey, 'step', .09)[1], 2);
assert.equal(sampleRigLocalPose(roundedKey, 'step', .09 / .17)[1], 0, 'round-tripping through phase loses this exact key');
const roundedBake = bakeLocalAnimation(roundedKey);
assert.equal(decodeLocalSample(roundedBake, { sampleA: 1, sampleB: 1, fraction: 0, stepMaskOffset: 0 })[1], 2, 'bake uses seconds at authored keys');
assert.equal(roundedBake.clips[0].times.at(-1), .17, 'source keys beyond duration do not extend the clip');

const staticRig = { bones: [{ ...bone, bind: { T: [3, -2, 1], R: [0, 0, 0, 1], S: [2, 3, 4] } }], clips: [{ name: 'static', duration: 0, tracks: {} }] };
const staticBake = bakeLocalAnimation(staticRig);
assert.deepEqual(Array.from(decodeLocalSample(staticBake, resolveLocalSample(staticBake, 'static', 1))), [3, -2, 1, 0, 0, 0, 1, 2, 3, 4]);
const frozen = sampleRigLocalPose(staticRig, 'static', 0), frozenBefore = frozen.slice();
assert.deepEqual(packLocalPose(frozen), staticBake.data, 'frozen snapshots and authored samples share one packing owner');
assert.deepEqual(frozen, frozenBefore, 'packing never mutates controller-owned locals');
assert.deepEqual(bakeLocalAnimation(rig), animation, 'identical source produces identical bytes and metadata');
const broken = structuredClone(rig); broken.clips[0].tracks[0].T.times = [0, .371, .371];
assert.throws(() => bakeLocalAnimation(broken), /invalid local channel/);

// Mixed interpolation on one joint, an unrelated channel key and bind-only child.
const angle = 3 * Math.PI / 180;
const hostile = { bones: [bone, { ...bone, name: 'child', parent: 0 }], clips: [{ name: 'mixed', duration: 1, tracks: {
  0: { T: rig.clips[0].tracks[0].T,
    R: { times: [0, 1], values: [0, 0, 0, 1, 0, 0, -Math.sin(angle / 2), -Math.cos(angle / 2)] },
    S: { times: [0, .29, .371, 1], values: [1, 1, 1, 1.2, 1.2, 1.2, 1.1, 1.1, 1.1, 1, 1, 1] } },
} }] };
const hostileBake = bakeLocalAnimation(hostile);
let hostileError = 0;
for (let i = 0; i <= 1000; i++) {
  const phase = i / 1000, source = sampleRigLocalPose(hostile, 'mixed', phase);
  const decoded = decodeLocalSample(hostileBake, resolveLocalSample(hostileBake, 'mixed', phase));
  assert.equal(decoded[1], source[1], 'STEP translation never leaks into unrelated rotation/scale interpolation');
  assert.deepEqual(decoded.slice(10), source.slice(10), 'missing child tracks preserve bind locals');
  const sourceMatrix = localPoseToJointMatrices(hostile, source), decodedMatrix = localPoseToJointMatrices(hostile, decoded);
  const error = Math.hypot(...[0, 1, 2].map(axis => decodedMatrix[16 + axis] + decodedMatrix[28 + axis] - sourceMatrix[16 + axis] - sourceMatrix[28 + axis]));
  hostileError = Math.max(hostileError, error);
  assert.ok(error < 1e-5, `near-parallel shortest-arc subdivision: ${error}m`);
}
for (const field of ['R', 'S']) {
  const mixed = structuredClone(hostile); mixed.clips[0].tracks[0][field].interpolation = 'STEP';
  const baked = bakeLocalAnimation(mixed), offset = field === 'R' ? 3 : 7, width = field === 'R' ? 4 : 3;
  for (const phase of [.29 - 1e-10, .29, .371 - 1e-10, .371, 1]) {
    assert.deepEqual(Array.from(decodeLocalSample(baked, resolveLocalSample(baked, 'mixed', phase)).slice(offset, offset + width)),
      Array.from(sampleRigLocalPose(mixed, 'mixed', phase).slice(offset, offset + width), Math.fround));
  }
}

const json = async url => JSON.parse(await readFile(url, 'utf8'));
const groups = new Map();
for (const path of ['catalog.json', 'candidates/blender-reference/catalog.json', 'candidates/material-swatches/catalog.json']) {
  const catalogUrl = new URL(`../assets/${path}`, import.meta.url), catalog = await json(catalogUrl);
  for (const [id, path] of Object.entries(catalog.appearances)) {
    const url = new URL(path, catalogUrl), manifest = await json(url), rigUrl = new URL(manifest.skeleton, url);
    if (!groups.has(rigUrl.href)) groups.set(rigUrl.href, { rig: await json(rigUrl), meshes: [], ids: [] });
    const group = groups.get(rigUrl.href); group.ids.push(id);
    for (const tier of manifest.tiers) group.meshes.push(decodeSoldierMesh(await json(new URL(tier, url))));
  }
}
let vertices = 0, maximumError = 0, mountedVertices = 0, mountedMaximumError = 0;
const compare = (group, source, decoded, mounted = false) => {
  const a = localPoseToJointMatrices(group.rig, source), b = localPoseToJointMatrices(group.rig, decoded);
  for (const mesh of group.meshes) {
    const pa = poseSoldierMesh(mesh, { width: 1, data: a }, 0).positions, pb = poseSoldierMesh(mesh, { width: 1, data: b }, 0).positions;
    for (let vertex = 0; vertex < pa.length; vertex += 3) {
      const error = Math.hypot(pb[vertex] - pa[vertex], pb[vertex + 1] - pa[vertex + 1], pb[vertex + 2] - pa[vertex + 2]);
      assert.ok(error < 1e-5, `${group.ids}: original source versus local encoding ${error}m`);
      if (mounted) { mountedMaximumError = Math.max(mountedMaximumError, error); mountedVertices++; }
      else { maximumError = Math.max(maximumError, error); vertices++; }
    }
  }
};
const storage = [];
for (const group of groups.values()) {
  const baked = bakeLocalAnimation(group.rig);
  storage.push({ appearances: group.ids, gpuPoseBytes: baked.data.byteLength, stepMaskBytes: baked.stepMasks.byteLength, cpuTimeBytes: baked.clips.reduce((sum, clip) => sum + clip.times.length * 8, 0) });
  for (const clip of baked.clips) {
    const phases = [0, 1, ...Array.from({ length: 31 }, (_, i) => (i + .37) / 31), ...clip.times.flatMap(time => [Math.max(0, (time - 1e-8) / clip.duration), time / clip.duration, Math.min(1, (time + 1e-8) / clip.duration)])];
    for (const phase of phases) compare(group, sampleRigLocalPose(group.rig, clip.name, phase), decodeLocalSample(baked, resolveLocalSample(baked, clip.name, phase)));
  }
  if (group.ids.includes('41')) {
    const mask = group.rig.bones.flatMap((bone, joint) => ['rider-spine', 'rider-arm', 'rider-head'].includes(bone.name) ? [joint] : []);
    for (let i = 0; i < 100; i++) {
      const gaitPhase = (i + .371) / 100, upperPhase = ((i * 37) % 100 + .29) / 100, weight = ((i * 13) % 100) / 100;
      const a = sampleRigLocalPose(group.rig, 'gait', gaitPhase), b = sampleRigLocalPose(group.rig, 'rider-action', upperPhase);
      const da = decodeLocalSample(baked, resolveLocalSample(baked, 'gait', gaitPhase)), db = decodeLocalSample(baked, resolveLocalSample(baked, 'rider-action', upperPhase));
      compare(group, composeMaskedLocals(a, blendLocalPoses(a, b, weight), mask), composeMaskedLocals(da, blendLocalPoses(da, db, Math.fround(weight)), mask), true);
    }
  }
}
console.log(JSON.stringify({ vertices, maximumError, hostileError, mountedVertices, mountedMaximumError, storage }));
