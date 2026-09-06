import { createHash } from 'node:crypto';
import { SOLDIER_MATERIAL_TEXTURE_CHANNELS } from '../src/material.ts';

function noExtensions(value, label) {
  if (value.extensions && Object.keys(value.extensions).length) throw new Error(`${label}: unsupported extensions; export core glTF materials without transforms`);
}

function samplerFrom(source = {}) {
  noExtensions(source, 'sampler');
  const filters = { 9728: 'nearest', 9729: 'linear' };
  const minFilters = {
    9728: ['nearest', 'none'], 9729: ['linear', 'none'],
    9984: ['nearest', 'nearest'], 9985: ['linear', 'nearest'],
    9986: ['nearest', 'linear'], 9987: ['linear', 'linear'],
  };
  const wraps = { 10497: 'repeat', 33071: 'clamp-to-edge', 33648: 'mirror-repeat' };
  // Match the installed GLTFLoader policy when glTF leaves sampler fields absent.
  const magFilter = filters[source.magFilter ?? 9729];
  const min = minFilters[source.minFilter ?? 9987];
  const wrapS = wraps[source.wrapS ?? 10497], wrapT = wraps[source.wrapT ?? 10497];
  if (!magFilter || !min || !wrapS || !wrapT) throw new Error('unsupported glTF sampler filter or wrap mode');
  return { magFilter, minFilter: min[0], mipmapFilter: min[1], wrapS, wrapT };
}

function embeddedImage(json, bin, index) {
  if (!Number.isInteger(index) || index < 0) throw new Error('invalid image index');
  const image = json.images?.[index];
  if (!image) throw new Error(`texture references missing image ${index}`);
  noExtensions(image, 'image');
  let bytes, mimeType = image.mimeType;
  if (image.uri !== undefined) {
    const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]*={0,2})$/.exec(image.uri);
    if (!match || image.bufferView !== undefined) throw new Error('images must be embedded PNG/JPEG buffer views or base64 data URIs');
    if (mimeType !== undefined && mimeType !== match[1]) throw new Error('image MIME type differs from its data URI');
    mimeType = match[1];
    bytes = Buffer.from(match[2], 'base64');
  } else {
    if (!Number.isInteger(image.bufferView) || image.bufferView < 0) throw new Error('invalid image buffer view index');
    const view = json.bufferViews?.[image.bufferView];
    if (!view || view.buffer !== 0 || json.buffers?.[0]?.uri || !bin) throw new Error('image requires an embedded GLB buffer view');
    noExtensions(view, 'image buffer view');
    const start = view.byteOffset ?? 0, length = view.byteLength;
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(length) || length <= 0 || start + length > bin.byteLength) {
      throw new Error('image buffer view is outside the embedded GLB binary chunk');
    }
    bytes = Buffer.from(bin.subarray(start, start + length));
  }
  if (!['image/png', 'image/jpeg'].includes(mimeType)) throw new Error('only embedded PNG/JPEG images are supported');
  const signature = mimeType === 'image/png' ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) : Buffer.from([255, 216, 255]);
  if (!bytes.subarray(0, signature.length).equals(signature)) throw new Error('embedded image bytes do not match their PNG/JPEG MIME type');
  return { bytes, mimeType };
}

/** One shared source texture set and material-slot registry across independently exported tiers. */
export function appearanceMaterials(files) {
  const materials = [], textures = {}, channels = new Map(), slots = new Map();
  function useTexture(json, bin, info, channel) {
    noExtensions(info, `${channel} texture info`);
    if ((info.texCoord ?? 0) !== 0) throw new Error(`${channel}: only UV0 is supported`);
    const texture = json.textures?.[info.index];
    if (!texture) throw new Error(`${channel}: missing texture ${info.index}`);
    noExtensions(texture, `${channel} texture`);
    if (texture.sampler !== undefined && (!Number.isInteger(texture.sampler) || texture.sampler < 0)) throw new Error(`${channel}: invalid sampler index`);
    const samplerSource = texture.sampler === undefined ? undefined : json.samplers?.[texture.sampler];
    if (texture.sampler !== undefined && !samplerSource) throw new Error(`${channel}: missing sampler ${texture.sampler}`);
    const sampler = samplerFrom(samplerSource);
    const { bytes, mimeType } = embeddedImage(json, bin, texture.source);
    const prior = channels.get(channel);
    if (prior && (!prior.bytes.equals(bytes) || prior.mimeType !== mimeType || JSON.stringify(prior.sampler) !== JSON.stringify(sampler))) {
      throw new Error(`${channel}: conflicting image bytes or samplers across material slots/tiers; author one shared texture set`);
    }
    if (!prior) {
      const image = `images/${createHash('sha256').update(bytes).digest('hex')}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
      files[image] = bytes;
      textures[channel] = { image, mimeType, sampler };
      channels.set(channel, { bytes, mimeType, sampler });
    }
  }
  return {
    surface: { materials, textures },
    slot(json, bin, index) {
      if (json.extensionsRequired?.length) throw new Error(`unsupported required glTF extensions: ${json.extensionsRequired.join(', ')}`);
      const definition = index == null ? {} : json.materials?.[index];
      if (!definition) throw new Error(`material ${index} is missing`);
      noExtensions(definition, `material ${index}`);
      if ((definition.alphaMode ?? 'OPAQUE') !== 'OPAQUE') throw new Error(`material ${index}: transparency unsupported; export opaque materials`);
      if (definition.emissiveTexture || (definition.emissiveFactor ?? [0, 0, 0]).some((value) => value !== 0)) {
        throw new Error(`material ${index}: emissive materials unsupported`);
      }
      const pbr = definition.pbrMetallicRoughness ?? {};
      noExtensions(pbr, 'PBR material');
      const baseColor = pbr.baseColorFactor ?? [1, 1, 1, 1];
      const roughness = pbr.roughnessFactor ?? 1, metallic = pbr.metallicFactor ?? 1;
      if (!Array.isArray(baseColor) || baseColor.length !== 4 || [...baseColor, roughness, metallic].some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
        throw new Error(`material ${index} has invalid PBR factors`);
      }
      const material = { name: definition.name || 'material', baseColor, roughness, metallic };
      const flags = {};
      for (const [flag, info] of [
        ['baseColor', pbr.baseColorTexture], ['normal', definition.normalTexture],
        ['metallicRoughness', pbr.metallicRoughnessTexture], ['occlusion', definition.occlusionTexture],
      ]) {
        if (info === undefined) continue;
        if (!info || !Number.isInteger(info.index) || info.index < 0) throw new Error(`${flag}: invalid texture reference`);
        useTexture(json, bin, info, SOLDIER_MATERIAL_TEXTURE_CHANNELS[flag]);
        flags[flag] = true;
      }
      if (Object.keys(flags).length) material.textures = flags;
      if (flags.normal) {
        const scale = definition.normalTexture.scale ?? 1;
        if (!Number.isFinite(scale)) throw new Error('normal scale must be finite');
        material.normalScale = scale;
      }
      if (flags.occlusion) {
        const strength = definition.occlusionTexture.strength ?? 1;
        if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error('occlusion strength must be between zero and one');
        material.occlusionStrength = strength;
      }
      const key = JSON.stringify(material);
      if (!slots.has(key)) {
        slots.set(key, materials.length);
        materials.push(material);
      }
      return slots.get(key);
    },
  };
}
