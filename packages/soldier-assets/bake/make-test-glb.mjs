// Generates a tiny, deterministic test .glb: a 2-bone "arm" skin with one
// rotation-animated clip per required human clip name. Checked in as a fixture
// so gltf.test.mjs and the asset workbench have a real rigged asset without a
// hand-authored binary blob. Run: node packages/soldier-assets/bake/make-test-glb.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_HUMAN_CLIP_NAMES } from './clip-contract.mjs';

const OUT = new URL('../assets/test/two-bone.glb', import.meta.url);
const WEB_OUT = new URL('../../../web/public/assets/soldiers/test/two-bone.glb', import.meta.url);

const qz = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const IDENTITY_MAT4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const TRANSLATE_NEG_X = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 1];

// A small swing per clip so each baked clip is distinct; amplitude varies the
// clip but the structure (2 bones, rotation on the tip) is shared.
function clipSwing(index) {
  const amp = 0.18 + index * 0.06;
  return [qz(0), qz(amp), qz(0)];
}

export function buildTestGltf() {
  const floats = [];
  const pushFloats = (values) => {
    const start = floats.length * 4;
    for (const v of values) floats.push(v);
    return { byteOffset: start, byteLength: values.length * 4 };
  };

  const bufferViews = [];
  const accessors = [];
  const addAccessor = (values, componentType, type, count, extra = {}) => {
    const view = pushFloats(values);
    bufferViews.push({ buffer: 0, byteOffset: view.byteOffset, byteLength: view.byteLength });
    accessors.push({ bufferView: bufferViews.length - 1, componentType, type, count, ...extra });
    return accessors.length - 1;
  };

  const ibmAccessor = addAccessor([...IDENTITY_MAT4, ...TRANSLATE_NEG_X], 5126, 'MAT4', 2);
  const times = [0, 0.5, 1];
  const timeAccessor = addAccessor(times, 5126, 'SCALAR', 3, { min: [0], max: [1] });

  const animations = REQUIRED_HUMAN_CLIP_NAMES.map((name, index) => {
    const rotAccessor = addAccessor(clipSwing(index).flat(), 5126, 'VEC4', 3);
    return {
      name,
      samplers: [{ input: timeAccessor, output: rotAccessor, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }],
    };
  });

  const gltf = {
    asset: { version: '2.0', generator: 'soldier-assets test fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'root', children: [1], translation: [0, 0, 0] },
      { name: 'tip', translation: [1, 0, 0] },
    ],
    bufferViews,
    accessors,
    skins: [{ joints: [0, 1], inverseBindMatrices: ibmAccessor }],
    animations,
  };
  return { gltf, floats };
}

function pad4(length) {
  return (4 - (length % 4)) % 4;
}

export function encodeGlb({ gltf, floats }) {
  const bin = new Uint8Array(floats.length * 4);
  const binView = new DataView(bin.buffer);
  floats.forEach((v, i) => binView.setFloat32(i * 4, v, true));
  gltf.buffers = [{ byteLength: bin.byteLength }];

  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = pad4(jsonBytes.length);
  const binPad = pad4(bin.byteLength);
  const jsonLen = jsonBytes.length + jsonPad;
  const binLen = bin.byteLength + binPad;
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  let o = 12;
  dv.setUint32(o, jsonLen, true); dv.setUint32(o + 4, 0x4e4f534a, true); o += 8;
  out.set(jsonBytes, o); for (let i = 0; i < jsonPad; i++) out[o + jsonBytes.length + i] = 0x20; o += jsonLen;
  dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  out.set(bin, o); o += binLen;
  return out;
}

export function makeTestGlb() {
  return encodeGlb(buildTestGltf());
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const glb = makeTestGlb();
  await mkdir(dirname(fileURLToPath(OUT)), { recursive: true });
  await mkdir(dirname(fileURLToPath(WEB_OUT)), { recursive: true });
  await writeFile(OUT, glb);
  await writeFile(WEB_OUT, glb);
  console.log(`wrote ${fileURLToPath(OUT)} (${glb.byteLength} bytes)`);
}
