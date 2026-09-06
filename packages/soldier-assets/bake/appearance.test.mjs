import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { bakeAppearance } from './appearance.mjs';
import { bakeGltf, parseGlb } from './gltf.mjs';
import { bakeRig } from './vat.mjs';
import { loadAppearanceBundle, decodeSoldierMesh } from '../src/appearanceBundle.ts';
import { poseSoldierMesh } from '../src/skin.ts';

function editGlb(bytes, edit) {
  const { json, bin } = parseGlb(bytes);
  const binary = Buffer.from(bin);
  edit(json, binary);
  const text = Buffer.from(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const result = Buffer.alloc(28 + jsonLength + binary.length);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonLength, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  result.fill(0x20, 20, 20 + jsonLength);
  text.copy(result, 20);
  result.writeUInt32LE(binary.length, 20 + jsonLength);
  result.writeUInt32LE(0x004e4942, 24 + jsonLength);
  binary.copy(result, 28 + jsonLength);
  return result;
}

const sourceRoot = new URL('../assets/test/blender-reference/', import.meta.url);
const human = await readFile(new URL('human.glb', sourceRoot));
const defaults = { name: 'diagnostic', tiers: [human, human, human], fps: 24, loopClips: [] };
assert.throws(() => bakeAppearance({ ...defaults, tiers: [human] }), /three explicit GLB/);
assert.throws(() => bakeAppearance({ ...defaults, loopClips: ['unknown'] }), /loop clip unknown/);
assert.throws(() => bakeAppearance({ ...defaults, loopClips: undefined }), /declare loopClips/);
assert.throws(() => bakeAppearance({ ...defaults, tiers: [human, editGlb(human, (json) => {
  json.nodes[json.skins[0].joints[0]].translation[0] += 0.2;
}), human] }), /bind or parent differs/);
const oppositeQuaternions = editGlb(human, (json) => {
  for (const node of json.nodes) if (node.rotation) node.rotation = node.rotation.map((value) => -value);
});
assert.doesNotThrow(() => bakeAppearance({ ...defaults, tiers: [human, oppositeQuaternions, human] }), 'q and -q encode the same bind rotation');

// Reordering glTF skin slots must not change the shared rig used by the other tiers.
const reordered = editGlb(human, (json, bin) => {
  const skin = json.skins[0];
  const count = skin.joints.length;
  skin.joints.reverse();
  const accessor = json.accessors[skin.inverseBindMatrices];
  const matrixStart = (json.bufferViews[accessor.bufferView].byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const matrices = Buffer.from(bin.subarray(matrixStart, matrixStart + count * 64));
  for (let slot = 0; slot < count; slot++) matrices.copy(bin, matrixStart + slot * 64, (count - slot - 1) * 64, (count - slot) * 64);
  const jointAccessors = new Set(json.meshes.flatMap((mesh) => mesh.primitives.map((primitive) => primitive.attributes.JOINTS_0)));
  for (const index of jointAccessors) {
    const joints = json.accessors[index];
    assert.equal(joints.componentType, 5121, 'fixture joint slots are bytes');
    const view = json.bufferViews[joints.bufferView];
    const start = (view.byteOffset ?? 0) + (joints.byteOffset ?? 0);
    for (let vertex = 0; vertex < joints.count; vertex++) {
      for (let influence = 0; influence < 4; influence++) {
        const offset = start + vertex * (view.byteStride ?? 4) + influence;
        bin[offset] = count - bin[offset] - 1;
      }
    }
  }
});
const remapped = bakeAppearance({ ...defaults, tiers: [human, reordered, human] });
for (const field of Object.keys(remapped['tier-0.mesh.json'])) {
  if (field !== 'materialIds') assert.deepEqual(remapped['tier-1.mesh.json'][field], remapped['tier-0.mesh.json'][field], `remapped tier ${field}`);
}
for (let vertex = 0; vertex < remapped['tier-0.mesh.json'].materialIds.length; vertex++) {
  const near = remapped['materials.json'][remapped['tier-0.mesh.json'].materialIds[vertex]];
  const mid = remapped['materials.json'][remapped['tier-1.mesh.json'].materialIds[vertex]];
  assert.deepEqual([near.baseColor, near.roughness, near.metallic], [mid.baseColor, mid.roughness, mid.metallic]);
}

let currentFiles;
const server = createServer((request, response) => {
  const file = currentFiles[decodeURIComponent(request.url.slice(1))];
  if (file == null) return response.writeHead(404).end();
  response.writeHead(200, { 'Content-Type': file instanceof Uint8Array ? 'model/gltf-binary' : 'application/json' });
  response.end(file instanceof Uint8Array ? file : JSON.stringify(file));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const report = [];
try {
  for (const name of ['human', 'mounted']) {
    const bytes = await readFile(new URL(`${name}.glb`, sourceRoot));
    const oracle = JSON.parse(await readFile(new URL(`${name}.landmarks.json`, sourceRoot), 'utf8'));
    const source = bakeGltf(bytes, { fps: oracle.fps });
    const options = { name: `${name}-diagnostic`, mounted: name === 'mounted', tiers: [bytes, bytes, bytes], fps: oracle.fps,
      loopClips: name === 'mounted' ? ['gait'] : [] };
    currentFiles = bakeAppearance(options);
    assert.deepEqual(bakeAppearance(options), currentFiles, 'candidate bake must be deterministic');
    const bundle = await loadAppearanceBundle(`http://127.0.0.1:${server.address().port}/appearance.json`);
    assert.equal(bundle.manifest.mounted, name === 'mounted');
    for (const clip of bundle.animation.clips) {
      assert.equal(clip.loop, options.loopClips.includes(clip.name));
      assert.equal(clip.duration, source.rig.clips.find((candidate) => candidate.name === clip.name).duration);
    }
    for (const material of bundle.materials) {
      const original = parseGlb(currentFiles[material.source.file]).json.materials[material.source.materialIndex];
      assert.deepEqual(material.baseColor, original.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1]);
      assert.equal(material.roughness, original.pbrMetallicRoughness?.roughnessFactor ?? 1);
      assert.equal(material.metallic, original.pbrMetallicRoughness?.metallicFactor ?? 1);
    }
    // Prove that retained local tracks can compose the oracle's independent rider mask.
    // Runtime composition remains06; this is a source-data retention check.
    if (name === 'mounted') {
      const tracks = {};
      for (const clip of bundle.rig.clips) {
        for (const [bone, track] of Object.entries(clip.tracks)) {
          const inMask = oracle.riderUpperBodyMask.includes(bundle.rig.bones[bone].name);
          if (inMask === (clip.name === 'rider-action')) tracks[bone] = track;
        }
      }
      bundle.rig.clips.push({ name: 'composed', duration: 1, tracks });
    }
    const composedBake = bakeRig(bundle.rig, oracle.fps);
    let maximumError = 0, checkedVertices = 0;
    for (const sample of oracle.samples) {
      const animation = sample.clip === 'composed' ? composedBake : bundle.animation;
      const clip = animation.clips.find((clip) => clip.name === sample.clip);
      const sourceClip = bundle.rig.clips.find((clip) => clip.name === sample.clip);
      const frame = clip.start + Math.round(sample.seconds / sourceClip.duration * (clip.frames - 1));
      for (const mesh of bundle.tiers) {
        const posed = poseSoldierMesh(mesh, animation, frame);
        let offset = 0;
        for (const primitive of source.primitives) {
          const mapping = oracle.meshes.find((mapping) => mapping.node === primitive.nodeName && mapping.primitive === primitive.primitiveIndex);
          for (let vertex = 0; vertex < primitive.positions.length / 3; vertex++) {
            const [x, y, z] = sample.positions[mapping.node][mapping.sourceVertexByGltfVertex[vertex]];
            const expected = [x, -z, y];
            const actual = posed.positions.subarray((offset + vertex) * 3, (offset + vertex + 1) * 3);
            const error = Math.hypot(...actual.map((value, axis) => value - expected[axis]));
            maximumError = Math.max(maximumError, error);
            checkedVertices++;
            assert.ok(error < oracle.toleranceMetres, `${name}/${sample.name}/${mapping.node}/${vertex}: ${error}m`);
          }
          offset += primitive.positions.length / 3;
        }
      }
    }
    report.push({ fixture: name, samples: oracle.samples.length, checkedVertices, maximumError });
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

// Individually Uint16 primitives require Uint32 after concatenation crosses the limit.
const large = editGlb(human, (json) => {
  const primitive = json.meshes[0].primitives[0];
  const count = json.accessors[primitive.attributes.POSITION].count;
  json.meshes[0].primitives = Array.from({ length: Math.ceil(65537 / count) }, () => primitive);
});
const largeFiles = bakeAppearance({ ...defaults, tiers: [large, large, large], fps: 1 });
const largeMesh = decodeSoldierMesh(largeFiles['tier-0.mesh.json']);
assert.equal(largeFiles['tier-0.mesh.json'].indexFormat, 'uint32');
assert.ok(largeMesh.indices.some((index) => index > 65535));
assert.ok(largeMesh.indices.every((index) => index < largeMesh.positions.length / 3));

const directory = await mkdtemp(join(tmpdir(), 'appearance-bake-test-'));
try {
  const cli = fileURLToPath(new URL('./appearance.mjs', import.meta.url));
  const input = fileURLToPath(new URL('human.glb', sourceRoot));
  const args = [cli, '--near', input, '--mid', input, '--far', input, '--out', directory, '--name', 'cli-diagnostic', '--loop', ''];
  execFileSync(process.execPath, args, { stdio: 'pipe' });
  const first = await readFile(join(directory, 'animation.json'));
  execFileSync(process.execPath, args, { stdio: 'pipe' });
  assert.deepEqual(await readFile(join(directory, 'animation.json')), first);
  assert.deepEqual(await readFile(join(directory, 'source/tier-0.glb')), human);
  assert.equal(JSON.parse(await readFile(join(directory, 'appearance.json'), 'utf8')).name, 'cli-diagnostic');
  const invalid = spawnSync(process.execPath, [cli, '--near', input, '--out', directory, '--name', 'bad', '--loop', ''], { encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.ok(invalid.stderr.includes('missing --mid'));
  assert.equal(JSON.parse(await readFile(join(directory, 'appearance.json'), 'utf8')).name, 'cli-diagnostic');
} finally {
  await rm(directory, { recursive: true });
}
console.log(JSON.stringify({ fixtures: report, uint32Merge: true, cli: true, deterministic: true }));
