export class GrowableBuffer {
  private currentBuffer: GPUBuffer;
  private currentCapacityBytes: number;
  private readonly usage: GPUBufferUsageFlags;

  constructor(
    private readonly device: GPUDevice,
    private readonly label: string,
    usage: GPUBufferUsageFlags,
    floorBytes: number,
  ) {
    this.usage = usage | GPUBufferUsage.COPY_DST;
    this.currentCapacityBytes = alignedBytes(floorBytes);
    this.currentBuffer = this.allocate(this.currentCapacityBytes);
  }

  get buffer(): GPUBuffer {
    return this.currentBuffer;
  }

  get capacityBytes(): number {
    return this.currentCapacityBytes;
  }

  /** true when reallocated — rebuild any bind group that holds it */
  write(data: ArrayBufferView): boolean {
    const requiredBytes = alignedBytes(data.byteLength);
    const reallocated = requiredBytes > this.currentCapacityBytes;
    if (reallocated) {
      this.currentCapacityBytes = Math.max(requiredBytes, this.currentCapacityBytes * 2, 128);
      this.currentBuffer = this.allocate(this.currentCapacityBytes);
    }
    if (data.byteLength > 0) this.device.queue.writeBuffer(this.currentBuffer, 0, data);
    return reallocated;
  }

  private allocate(size: number): GPUBuffer {
    return this.device.createBuffer({ label: this.label, size, usage: this.usage });
  }
}

export function makeVertexBuffer(device: GPUDevice, label: string, data: Float32Array): GPUBuffer {
  return makeStaticBuffer(device, label, data, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
}

export function makeIndexBuffer(device: GPUDevice, label: string, data: Uint16Array | Uint32Array): GPUBuffer {
  // writeBuffer requires a multiple of four bytes, even for uint16 triangles.
  const upload = data.byteLength % 4 === 0 ? data : new Uint16Array(data.length + 1);
  if (upload !== data) upload.set(data);
  return makeStaticBuffer(device, label, upload, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);
}

function makeStaticBuffer(
  device: GPUDevice,
  label: string,
  data: ArrayBufferView,
  usage: GPUBufferUsageFlags,
): GPUBuffer {
  const buffer = device.createBuffer({ label, size: alignedBytes(data.byteLength), usage });
  if (data.byteLength > 0) device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function alignedBytes(byteLength: number): number {
  return Math.max(4, Math.ceil(byteLength / 4) * 4);
}
