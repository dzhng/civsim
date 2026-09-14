/** Transport exact display bytes without Playwright serializing one object per channel.
 * Chunking avoids the argument-count limit on full-frame images. Decode with Buffer.from(value, "base64"). */
export function encodeRgba8Base64(bytes: Uint8Array): string {
  if (bytes.length % 4 !== 0) throw new Error("RGBA8 requires complete pixels");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
