/** Logical texel payload only. Depth24 and packed depth/stencil storage is
 * implementation-dependent. Compressed/unknown formats remain unavailable. */
export function textureAllocationBytes(descriptor: GPUTextureDescriptor): number | null {
  const format = descriptor.format;
  let bytes: number;
  if (/^r8(unorm|snorm|uint|sint)$/.test(format)) bytes = 1;
  else if (
    /^(r16(uint|sint|float|unorm|snorm)|rg8(unorm|snorm|uint|sint)|depth16unorm)$/.test(format)
  )
    bytes = 2;
  else if (
    /^(r32(uint|sint|float)|rg16(uint|sint|float|unorm|snorm)|rgba8(unorm(-srgb)?|snorm|uint|sint)|bgra8unorm(-srgb)?|rgb10a2(uint|unorm)|rg11b10ufloat|rgb9e5ufloat|depth32float)$/.test(
      format,
    )
  )
    bytes = 4;
  else if (/^(rg32(uint|sint|float)|rgba16(uint|sint|float|unorm|snorm))$/.test(format)) bytes = 8;
  else if (/^rgba32(uint|sint|float)$/.test(format)) bytes = 16;
  else if (format === "stencil8") bytes = 1;
  else return null;
  const size = descriptor.size;
  const extent = Symbol.iterator in Object(size) ? Array.from(size as Iterable<number>) : null;
  const dictionary = size as GPUExtent3DDict;
  const width = extent ? extent[0]! : dictionary.width;
  const height = extent ? (extent[1] ?? 1) : (dictionary.height ?? 1);
  const depth = extent ? (extent[2] ?? 1) : (dictionary.depthOrArrayLayers ?? 1);
  let texels = 0;
  for (let mip = 0; mip < (descriptor.mipLevelCount ?? 1); mip++) {
    const divisor = 2 ** mip;
    texels +=
      Math.max(1, Math.floor(width / divisor)) *
      Math.max(1, Math.floor(height / divisor)) *
      (descriptor.dimension === "3d" ? Math.max(1, Math.floor(depth / divisor)) : depth);
  }
  const result = texels * bytes * (descriptor.sampleCount ?? 1);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}
