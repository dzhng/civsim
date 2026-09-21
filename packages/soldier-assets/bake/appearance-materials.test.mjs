import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { bakeAppearance } from './appearance.mjs';
import { parseGlb } from './gltf.mjs';
import { editGlb } from './test-harness/glb.mjs';

const human = await readFile(new URL('../assets/test/blender-reference/human.glb', import.meta.url));
const { PNG } = createRequire(new URL('../../../web/package.json', import.meta.url))('pngjs');
const bake = (tiers = [human, human, human, human]) => bakeAppearance({ presentation: null, name: 'texture-diagnostic', tiers, fps: 1, loopClips: [] });
const files = bake();
const surface = files['materials.json'];
assert.equal(surface.materials.find((material) => material.name === 'neutral-checker').textures.baseColor, true);
assert.equal(surface.materials.find((material) => material.name === 'neutral-diagnostic').textures, undefined);
const image = surface.textures.baseColor;
assert.deepEqual(image.sampler, { magFilter: 'nearest', minFilter: 'nearest', mipmapFilter: 'nearest', wrapS: 'repeat', wrapT: 'repeat' });
const { json, bin } = parseGlb(human);
const view = json.bufferViews[json.images[0].bufferView];
assert.deepEqual(files[image.image], bin.subarray(view.byteOffset, view.byteOffset + view.byteLength), 'preserve the real Blender checker bytes');
assert.deepEqual(bake(), files, 'texture packaging remains deterministic');
const reindexed = editGlb(human, (json) => {
  json.asset.generator = 'independently exported tier';
  json.images.unshift({ ...json.images[0] });
  json.samplers.unshift({ ...json.samplers[0] });
  json.textures.unshift({ ...json.textures[0] });
  json.textures[1] = { source: 1, sampler: 1 };
  json.materials[1].pbrMetallicRoughness.baseColorTexture.index = 1;
});
assert.deepEqual(bake([human, reindexed, human, human])['materials.json'], surface, 'GLB indices and export metadata do not define image or material identity');
const defaultSampler = editGlb(human, (json) => { delete json.textures[0].sampler; });
assert.deepEqual(bake([defaultSampler, defaultSampler, defaultSampler, defaultSampler])['materials.json'].textures.baseColor.sampler,
  { magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', wrapS: 'repeat', wrapT: 'repeat' });
const independent = editGlb(human, (json) => {
  json.materials[0].pbrMetallicRoughness.metallicRoughnessTexture = { index: 0 };
  json.materials[1].occlusionTexture = { index: 0, strength: .35 };
  json.materials[1].normalTexture = { index: 0, scale: .7 };
});
const independentSurface = bake([independent, independent, independent, independent])['materials.json'];
assert.deepEqual(independentSurface.materials[0].textures, { metallicRoughness: true });
assert.deepEqual(independentSurface.materials[1].textures, { baseColor: true, normal: true, occlusion: true });
assert.equal(independentSurface.materials[1].normalScale, .7);
assert.equal(independentSurface.materials[1].occlusionStrength, .35);
assert.equal(independentSurface.textures.orm.image, independentSurface.textures.baseColor.image);
// Channel-coded, asymmetric pixels expose byte changes, flips and unintended repacking.
const pixels = Buffer.from([255, 0, 31, 255, 0, 170, 63, 255, 17, 29, 241, 255, 53, 101, 149, 255, 211, 137, 79, 255, 3, 5, 7, 255]);
const encoded = PNG.sync.write({ width: 3, height: 2, data: pixels });
const channelCoded = editGlb(independent, (json) => {
  json.images[0] = { uri: `data:image/png;base64,${encoded.toString('base64')}` };
});
const codedFiles = bake([channelCoded, channelCoded, channelCoded, channelCoded]);
for (const channel of ['baseColor', 'normal', 'orm']) {
  const actual = codedFiles[codedFiles['materials.json'].textures[channel].image];
  assert.deepEqual(actual, encoded);
  const decoded = PNG.sync.read(actual);
  assert.equal(decoded.width, 3);
  assert.equal(decoded.height, 2);
  assert.deepEqual(decoded.data, pixels);
}
for (let tier = 0; tier < 3; tier++) {
  assert.deepEqual(codedFiles[`tier-${tier}.mesh.json`], files[`tier-${tier}.mesh.json`], 'texture declarations preserve all geometry, UV, tangent, weight, faction and index channels');
  assert.deepEqual(codedFiles[`source/tier-${tier}.glb`], channelCoded, 'full GLBs remain source provenance');
}
for (const path of ['skeleton.json', 'animation.json', 'appearance.json']) assert.deepEqual(codedFiles[path], files[path]);

const reject = (edit, pattern, source = human) => {
  const invalid = editGlb(source, edit);
  assert.throws(() => bake([invalid, invalid, invalid, invalid]), pattern);
};
for (const mode of ['BLEND', 'MASK']) reject((json) => { json.materials[0].alphaMode = mode; }, /transparency unsupported/);
reject((json) => { json.materials[0].emissiveFactor = [.1, 0, 0]; }, /emissive materials unsupported/);
reject((json) => { json.materials[0].emissiveTexture = { index: 0 }; }, /emissive materials unsupported/);
reject((json) => { json.materials[0].extensions = { KHR_materials_unlit: {} }; }, /unsupported extensions/);
reject((json) => { json.extensionsRequired = ['KHR_materials_clearcoat']; }, /unsupported required glTF extensions/);
reject((json) => { json.materials[1].pbrMetallicRoughness.baseColorTexture.extensions = { KHR_texture_transform: { offset: [.1, 0] } }; }, /unsupported extensions/);
reject((json) => { json.materials[1].pbrMetallicRoughness.baseColorTexture.texCoord = 1; }, /only UV0/);
reject((json) => { json.textures[0].extensions = { KHR_texture_basisu: { source: 0 } }; }, /unsupported extensions/);
reject((json) => { json.materials[1].pbrMetallicRoughness.baseColorTexture.index = 8; }, /missing texture/);
reject((json) => { json.textures[0].source = 8; }, /missing image/);
reject((json) => { json.textures[0].sampler = 8; }, /missing sampler/);
for (const value of ['0', -1, .5, null]) {
  reject((json) => { json.textures[0].source = value; }, /invalid image index/);
  reject((json) => { json.textures[0].sampler = value; }, /invalid sampler index/);
  reject((json) => { json.images[0].bufferView = value; }, /invalid image buffer view index/);
}
reject((json) => { json.samplers[0].minFilter = 7; }, /unsupported glTF sampler/);
reject((json) => { json.images[0] = { uri: 'external.png' }; }, /images must be embedded/);
reject((json) => { json.images[0].mimeType = 'image/webp'; }, /only embedded PNG\/JPEG/);
reject((json) => { json.images[0].mimeType = 'image/jpeg'; }, /bytes do not match/);
reject((json) => { json.bufferViews[json.images[0].bufferView].byteLength = 1e9; }, /outside the embedded/);
reject((json) => { json.materials[1].occlusionTexture.strength = 1.1; }, /occlusion strength/, independent);
reject((json) => { json.materials[1].normalTexture.scale = 'invalid'; }, /normal scale/, independent);
reject((json) => { json.materials[1].normalTexture.scale = 1e300; }, /normal scale/, independent);
reject((json) => {
  json.textures.push({ source: 0, sampler: 1 });
  json.samplers.push({ magFilter: 9729 });
  json.materials[1].occlusionTexture.index = 1;
}, /orm: conflicting image bytes or samplers/, independent);
const otherBytes = editGlb(human, (json) => { json.images[0] = { uri: `data:image/png;base64,${encoded.toString('base64')}` }; });
assert.throws(() => bake([human, otherBytes, human, human]), /baseColor: conflicting image bytes or samplers/, 'different tier images are not silently chosen or repacked');
const otherSampler = editGlb(human, (json) => { json.samplers[0].wrapS = 33071; });
assert.throws(() => bake([human, otherSampler, human, human]), /conflicting image bytes or samplers/);
for (const [minFilter, expected] of [[9728, ['nearest', 'none']], [9729, ['linear', 'none']], [9984, ['nearest', 'nearest']], [9985, ['linear', 'nearest']], [9986, ['nearest', 'linear']], [9987, ['linear', 'linear']]]) {
  const input = editGlb(human, (json) => { json.samplers[0] = { minFilter, wrapS: 33071, wrapT: 33648 }; });
  assert.deepEqual(bake([input, input, input, input])['materials.json'].textures.baseColor.sampler,
    { magFilter: 'linear', minFilter: expected[0], mipmapFilter: expected[1], wrapS: 'clamp-to-edge', wrapT: 'mirror-repeat' });
}
console.log('appearance texture material transport passed');
