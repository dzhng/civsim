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
