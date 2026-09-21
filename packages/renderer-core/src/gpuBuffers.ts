import { alignedBufferBytes, growableBufferCapacity } from "./bufferCapacity";
export class GrowableBuffer {
  private currentBuffer: GPUBuffer;
  private currentCapacityBytes: number;
  private readonly usage: GPUBufferUsageFlags;
  private disposed = false;

  constructor(
    private readonly device: GPUDevice,
    private readonly label: string,
    usage: GPUBufferUsageFlags,
    floorBytes: number,
  ) {
    this.usage = usage | GPUBufferUsage.COPY_DST;
    this.currentCapacityBytes = alignedBufferBytes(floorBytes);
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
    if (this.disposed) throw new Error(`${this.label} is disposed`);
    const requiredBytes = alignedBufferBytes(data.byteLength);
    const reallocated = requiredBytes > this.currentCapacityBytes;
    if (reallocated) {
      const capacity = growableBufferCapacity(this.currentCapacityBytes, requiredBytes);
      const replacement = this.allocate(capacity);
      // Previously submitted GPU work retains its resources; callers must rebuild
      // bind groups before submitting new work, as the return contract requires.
      this.currentBuffer.destroy();
      this.currentBuffer = replacement;
      this.currentCapacityBytes = capacity;
    }
    if (data.byteLength > 0) this.device.queue.writeBuffer(this.currentBuffer, 0, data);
    return reallocated;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.currentBuffer.destroy();
  }

  private allocate(size: number): GPUBuffer {
    return this.device.createBuffer({ label: this.label, size, usage: this.usage });
  }
}

export function makeVertexBuffer(device: GPUDevice, label: string, data: Float32Array): GPUBuffer {
  return makeStaticBuffer(device, label, data, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
}

export function makeIndexBuffer(
  device: GPUDevice,
  label: string,
  data: Uint16Array | Uint32Array,
): GPUBuffer {
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
  const buffer = device.createBuffer({ label, size: alignedBufferBytes(data.byteLength), usage });
  try {
    if (data.byteLength > 0) device.queue.writeBuffer(buffer, 0, data);
  } catch (error) {
    buffer.destroy();
    throw error;
  }
  return buffer;
}
