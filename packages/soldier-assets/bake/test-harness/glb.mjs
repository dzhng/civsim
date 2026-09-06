import { parseGlb } from '../gltf.mjs';

/** Mutate real exported GLB JSON/binary without changing unrelated source channels. */
export function editGlb(bytes, edit) {
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
