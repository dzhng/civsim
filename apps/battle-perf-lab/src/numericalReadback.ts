// Shared numerical-test readback/comparison utilities; never a renderer hot-path API.
export function decodeFloat16(value: number) {
  const sign = value & 0x8000 ? -1 : 1,
    exponent = (value >> 10) & 31,
    mantissa = value & 1023;
  return (
    sign *
    (exponent === 0
      ? (2 ** -14 * mantissa) / 1024
      : exponent === 31
        ? mantissa
          ? NaN
          : Infinity
        : 2 ** (exponent - 15) * (1 + mantissa / 1024))
  );
}
export async function readHdrTexture(device: GPUDevice, target: GPUTexture) {
  const bytesPerRow = Math.ceil((target.width * 8) / 256) * 256;
  const buffer = device.createBuffer({
    size: bytesPerRow * target.height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: target }, { buffer, bytesPerRow }, [
      target.width,
      target.height,
    ]);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const raw = new Uint16Array(buffer.getMappedRange());
    return unpackRgba16fRows(raw, target.width, target.height);
  } finally {
    buffer.destroy();
  }
}
export function compareHdr(actual: number[], expected: number[]) {
  if (actual.length !== expected.length) throw new Error("HDR readback dimensions differ");
  let maxAbs = 0,
    maxRelative = 0,
    squared = 0,
    bad = 0,
    peak = 0;
  let actualNonfinite = 0,
    expectedNonfinite = 0,
    nonfiniteMismatch = 0;
  const nonfiniteCoordinates: number[] = [];
  for (let i = 0; i < actual.length; i++) {
    const difference = Math.abs(actual[i] - expected[i]);
    if (!Number.isFinite(actual[i]) || !Number.isFinite(expected[i])) {
      bad++;
      actualNonfinite += +!Number.isFinite(actual[i]);
      expectedNonfinite += +!Number.isFinite(expected[i]);
      if (!Object.is(actual[i], expected[i])) nonfiniteMismatch++;
      if (nonfiniteCoordinates.length < 24) nonfiniteCoordinates.push(i);
      continue;
    }
    maxAbs = Math.max(maxAbs, difference);
    maxRelative = Math.max(maxRelative, difference / Math.max(0.05, Math.abs(expected[i])));
    squared += difference * difference;
    peak = Math.max(peak, actual[i]);
  }
  return {
    maxAbs,
    maxRelative,
    rmse: Math.sqrt(squared / actual.length),
    nonfinite: bad,
    actualNonfinite,
    expectedNonfinite,
    nonfiniteMismatch,
    nonfiniteCoordinates,
    peak,
    samples: actual.length,
  };
}

/** Three/WebGPU readbacks retain 256-byte row padding; uploads of an aligned LUT do not need repacking. */
export function unpackRgba16fRows(raw: Uint16Array, width: number, height: number) {
  const stride = Math.ceil((width * 8) / 256) * 128;
  if (raw.length < (height - 1) * stride + width * 4) throw new Error("Truncated HDR readback");
  return Array.from({ length: width * height * 4 }, (_, i) =>
    decodeFloat16(raw[Math.floor(i / (width * 4)) * stride + (i % (width * 4))]),
  );
}

export async function readU32Buffer(
  device: GPUDevice,
  source: GPUBuffer,
  byteLength = source.size,
) {
  if (byteLength === 0) return new Uint32Array();
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > source.size ||
    byteLength % 4
  )
    throw Error("Invalid diagnostic readback range");
  const b = device.createBuffer({
    size: byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const e = device.createCommandEncoder();
    e.copyBufferToBuffer(source, 0, b, 0, byteLength);
    device.queue.submit([e.finish()]);
    await b.mapAsync(GPUMapMode.READ);
    return new Uint32Array(b.getMappedRange().slice(0));
  } finally {
    b.destroy();
  }
}
