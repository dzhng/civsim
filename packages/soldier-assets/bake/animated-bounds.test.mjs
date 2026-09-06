import assert from 'node:assert/strict';
import { deriveAnimatedBounds } from './animated-bounds.mjs';
import { bakeRig } from './vat.mjs';
import { mat4Identity, sampleRigLocalPose, localPoseToJointMatrices, blendLocalPoses, composeMaskedLocals } from '../src/localPose.ts';
import { poseSoldierMesh } from '../src/skin.ts';
import { decodeSoldierMesh } from '../src/appearanceBundle.ts';
import { readFile } from 'node:fs/promises';

const bone = name => ({ name, parent: -1, bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] }, inverseBind: mat4Identity() });
const rig = { bones: [bone('root'), { ...bone('rotor'), parent: 0 }], clips: [{ name: 'turn', duration: 1, tracks: { 1: { R: { times: [0, 1], values: [0, 0, 0, 1, 0, 0, -1, 0] } } } }] };
const mesh = { positions: new Float32Array([1, 0, 0, 0, 1, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1]), tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1]), materialIds: new Float32Array([0, 0]), joints: new Uint16Array([1, 0, 0, 0, 0, 0, 0, 0]), weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]) };
const materials = [{ textures: {} }];
const bounds = deriveAnimatedBounds([mesh], bakeRig(rig, 1), materials, rig);
const positions = poseSoldierMesh(mesh, { width: 1, data: localPoseToJointMatrices(rig, sampleRigLocalPose(rig, 'turn', .5)) }, 0).positions;
const distance = Math.hypot(...bounds.center.map((value, axis) => positions[axis] - value));
assert.ok(distance <= bounds.radius, `quaternion arc escapes bounds: ${distance} > ${bounds.radius}`);
assert.ok(bounds.radius < 1.001, 'operation-count rounding adds a small allowance, not a blanket size multiplier');
assert.deepEqual(deriveAnimatedBounds([mesh], bakeRig(rig, 60), materials, rig), bounds, 'bound does not depend on sampling more arc positions');

// Supplement the analytic argument with adversarial Float32 controls in both
// current evaluation orders. These samples do not establish conservativeness.
const stressRig = { bones: [0, 1, 2, 3].map(i => ({ ...bone(`bone-${i}`), parent: i - 1 })), clips: [] };
for (let clip = 0; clip < 2; clip++) {
  const tracks = {};
  for (let joint = 0; joint < 4; joint++) {
    const angle = (joint + clip + 1) * .6;
    tracks[joint] = {
      T: { times: [0, 1], values: [joint * 2, -joint, 1, joint - 3, 2 + clip, 3] },
      R: { times: [0, 1], values: [0, 0, 0, 1, 0, Math.sin(angle / 2), 0, Math.cos(angle / 2)] },
      S: { times: [0, 1], values: [.5, .5, .5, 1 + joint, 1 + joint, 1 + joint] },
    };
  }
  stressRig.clips.push({ name: `clip-${clip}`, duration: 1, tracks });
}
const stressMesh = {
  ...mesh, positions: new Float32Array([3, -4, 5, -8, 7, .1]),
  joints: new Uint16Array([0, 1, 2, 3, 0, 1, 2, 3]), weights: new Float32Array([.1, .2, .3, .4, .4, .3, .2, .1]),
};
const stressBounds = deriveAnimatedBounds([stressMesh], bakeRig(stressRig, 2), materials, stressRig);
let seed = 17;
const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 2 ** 32);
let maximumFraction = 0;
const f = Math.fround;
for (let i = 0; i < 200; i++) {
  const a = sampleRigLocalPose(stressRig, 'clip-0', random()), b = sampleRigLocalPose(stressRig, 'clip-1', random());
  const locals = composeMaskedLocals(blendLocalPoses(a, b, random()), b, i % 2 ? [1, 3] : [2]);
  const palette = localPoseToJointMatrices(stressRig, locals);
  const cpu = poseSoldierMesh(stressMesh, { width: 1, data: palette }, 0).positions;
  for (let vertex = 0; vertex < 2; vertex++) {
    const weighted = new Float32Array(16);
    for (let component = 0; component < 16; component++) {
      for (let k = 0; k < 4; k++) weighted[component] = f(weighted[component] + f(stressMesh.weights[vertex * 4 + k] * palette[stressMesh.joints[vertex * 4 + k] * 16 + component]));
    }
    const p = stressMesh.positions.subarray(vertex * 3, vertex * 3 + 3);
    const gpu = [0, 1, 2].map(axis => f(f(f(f(weighted[axis] * p[0]) + f(weighted[axis + 4] * p[1])) + f(weighted[axis + 8] * p[2])) + weighted[axis + 12]));
    for (const posed of [cpu.subarray(vertex * 3, vertex * 3 + 3), gpu]) {
      const fraction = Math.hypot(...posed.map((value, axis) => value - stressBounds.center[axis])) / stressBounds.radius;
      maximumFraction = Math.max(maximumFraction, fraction);
      assert.ok(fraction <= 1, `continuous masked blend escapes: ${fraction}`);
    }
  }
}
const mapped = [{ textures: { normal: true } }];
assert.throws(() => deriveAnimatedBounds([{ ...mesh, tangents: new Float32Array(8) }], bakeRig(rig, 1), mapped, rig), /normal-mapped vertex/);
const impossible = structuredClone(rig);
impossible.bones[0].bind.S = [1e39, 1e39, 1e39];
assert.throws(() => deriveAnimatedBounds([mesh], bakeRig(rig, 1), materials, impossible), /finite Float32 range/);
// The importer's TRS reconstruction tolerance is not an affine guarantee:
// a tiny projective term amplifies a large root translation after W * inverseBind.
const projective = structuredClone(rig);
projective.bones[0].bind.T = [1e6, 0, 0];
projective.bones[1].inverseBind[3] = 9e-6;
assert.throws(() => deriveAnimatedBounds([mesh], bakeRig(projective, 1), materials, projective), /affine inverse bind/);
const json = async url => JSON.parse(await readFile(url, 'utf8'));
let sourceVertices = 0, sourceMaximumFraction = 0;
for (const path of ['catalog.json', 'candidates/blender-reference/catalog.json', 'candidates/material-swatches/catalog.json']) {
  const catalogUrl = new URL(`../assets/${path}`, import.meta.url), catalog = await json(catalogUrl);
  for (const path of Object.values(catalog.appearances)) {
    const url = new URL(path, catalogUrl), manifest = await json(url);
    const sourceRig = await json(new URL(manifest.skeleton, url));
    const sourceMesh = decodeSoldierMesh(await json(new URL(manifest.tiers[0], url)));
    for (let iteration = 0; iteration < 20; iteration++) {
      const clip = () => sourceRig.clips[Math.floor(random() * sourceRig.clips.length)].name;
      const a = sampleRigLocalPose(sourceRig, clip(), random()), b = sampleRigLocalPose(sourceRig, clip(), random());
      const mask = sourceRig.bones.flatMap((_, joint) => joint % 2 === iteration % 2 ? [joint] : []);
      const local = composeMaskedLocals(blendLocalPoses(a, b, random()), b, mask);
      const posed = poseSoldierMesh(sourceMesh, { width: 1, data: localPoseToJointMatrices(sourceRig, local) }, 0).positions;
      for (let vertex = 0; vertex < posed.length / 3; vertex++) {
        const fraction = Math.hypot(...manifest.bounds.center.map((value, axis) => posed[vertex * 3 + axis] - value)) / manifest.bounds.radius;
        assert.ok(fraction <= 1, `${manifest.name}: source masked blend escapes ${fraction}`);
        sourceMaximumFraction = Math.max(sourceMaximumFraction, fraction); sourceVertices++;
      }
    }
  }
}
console.log(JSON.stringify({ arcRadius: bounds.radius, arcDistance: distance, maskedCases: 200, maximumFraction, sourceVertices, sourceMaximumFraction, samplingIndependent: true }));
