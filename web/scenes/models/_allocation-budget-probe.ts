type Counters = ReturnType<typeof counters>;

// The app's legacy global GPU interfaces widen descriptors to unknown and omit
// writeBuffer's range parameters. Keep this observer's boundary fully specified.
export type AllocationProbeDevice = {
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  queue: {
    writeBuffer(
      buffer: GPUBuffer,
      bufferOffset: number,
      data: AllowSharedBufferSource,
      dataOffset?: number,
      size?: number,
    ): void;
    writeTexture(
      destination: GPUTexelCopyTextureInfo,
      data: AllowSharedBufferSource,
      dataLayout: GPUTexelCopyBufferLayout,
      size: GPUExtent3D,
    ): void;
    copyExternalImageToTexture(
      source: GPUCopyExternalImageSourceInfo,
      destination: GPUCopyExternalImageDestInfo,
      copySize: GPUExtent3D,
    ): void;
  };
};

function counters(liveBytes = 0) {
  return {
    bufferCreatedBytes: 0,
    textureCreatedBytes: 0,
    createdResources: 0,
    destroyedResources: 0,
    mappedAtCreationBytes: 0,
    writeBufferBytes: 0,
    writeBufferCalls: 0,
    writeTextureBytes: 0,
    writeTextureCalls: 0,
    writeTextureSourceSpanBytes: 0,
    externalImageBytes: 0,
    externalImageCalls: 0,
    unknownTextureAllocations: 0,
    unknownTextureUploads: 0,
    startLiveBytes: liveBytes,
    liveBytes,
    peakLiveBytes: liveBytes,
  };
}

/** Scene-only API accounting, not physical GPU memory or transfer completion.
 * Install before creating the measured assets; dispose in the caller's finally.
 * Buffer mapped-at-creation bytes are capacity exposed for initialization, not
 * bytes proven written. Texture bytes exclude driver padding/metadata; opaque
 * formats are reported as unknown. Existing allocations and encoder copies are
 * outside this observer. Run allocation observation separately from CPU timing.
 */
export function installAllocationBudgetProbe(
  device: AllocationProbeDevice,
  { excludeLabelPrefix = "budget-probe:" } = {},
) {
  const total = counters();
  const phases: Record<string, Counters> = Object.create(null);
  let current = (phases.unassigned = counters());
  const restorers = new Set<() => void>();
  let disposed = false;

  function wrap<T extends object, K extends keyof T>(object: T, key: K, value: T[K]) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { configurable: true, writable: true, value });
    const restore = () => {
      if (descriptor) Object.defineProperty(object, key, descriptor);
      else Reflect.deleteProperty(object, key);
      restorers.delete(restore);
    };
    restorers.add(restore);
    return restore;
  }
  function add(key: keyof Counters, value: number) {
    total[key] += value;
    current[key] += value;
  }
  function live(delta: number) {
    total.liveBytes += delta;
    current.liveBytes = total.liveBytes;
    total.peakLiveBytes = Math.max(total.peakLiveBytes, total.liveBytes);
    current.peakLiveBytes = Math.max(current.peakLiveBytes, total.liveBytes);
  }
  const excluded = (resource: { label?: string }) =>
    !!resource.label?.startsWith(excludeLabelPrefix);

  function track(resource: GPUBuffer | GPUTexture, bytes: number, kind: "buffer" | "texture") {
    add("createdResources", 1);
    add(kind === "buffer" ? "bufferCreatedBytes" : "textureCreatedBytes", bytes);
    live(bytes);
    const destroy = resource.destroy;
    const restore = wrap(resource, "destroy", () => {
      destroy.call(resource);
      add("destroyedResources", 1);
      live(-bytes);
      restore();
    });
  }

  try {
    const createBuffer = device.createBuffer;
    wrap(device, "createBuffer", (descriptor) => {
      const resource = createBuffer.call(device, descriptor);
      if (!excluded(descriptor)) {
        track(resource, descriptor.size, "buffer");
        if (descriptor.mappedAtCreation) add("mappedAtCreationBytes", descriptor.size);
      }
      return resource;
    });
    const createTexture = device.createTexture;
    wrap(device, "createTexture", (descriptor) => {
      const resource = createTexture.call(device, descriptor);
      if (!excluded(descriptor)) {
        const bytes = textureBytes(descriptor);
        if (bytes === null) add("unknownTextureAllocations", 1);
        track(resource, bytes ?? 0, "texture");
      }
      return resource;
    });
    const queue = device.queue;
    const writeBuffer = queue.writeBuffer;
    wrap(queue, "writeBuffer", (...args) => {
      writeBuffer.apply(queue, args);
      const [buffer, , data, offset = 0, size] = args;
      if (!excluded(buffer)) {
        const unit = "BYTES_PER_ELEMENT" in data ? Number(data.BYTES_PER_ELEMENT) : 1;
        add("writeBufferBytes", size === undefined ? data.byteLength - offset * unit : size * unit);
        add("writeBufferCalls", 1);
      }
    });
    const writeTexture = queue.writeTexture;
    wrap(queue, "writeTexture", (...args) => {
      writeTexture.apply(queue, args);
      const [destination, , layout, size] = args;
      if (!excluded(destination.texture)) {
        add("writeTextureCalls", 1);
        const block = texelBlock(destination.texture.format);
        if (!block) add("unknownTextureUploads", 1);
        else {
          const [width, height, depth] = extent(size);
          const rowBytes = Math.ceil(width / block.width) * block.bytes;
          const rows = Math.ceil(height / block.height);
          add("writeTextureBytes", rowBytes * rows * depth);
          const span =
            width && height && depth
              ? (layout.bytesPerRow ?? rowBytes) *
                  ((layout.rowsPerImage ?? rows) * (depth - 1) + rows - 1) +
                rowBytes
              : 0;
          add("writeTextureSourceSpanBytes", span);
        }
      }
    });
    const copyExternal = queue.copyExternalImageToTexture;
    wrap(queue, "copyExternalImageToTexture", (...args) => {
      copyExternal.apply(queue, args);
      const [, destination, size] = args;
      if (!excluded(destination.texture)) {
        add("externalImageCalls", 1);
        const block = texelBlock(destination.texture.format);
        if (!block) add("unknownTextureUploads", 1);
        else {
          const [width, height, depth] = extent(size);
          add(
            "externalImageBytes",
            Math.ceil(width / block.width) * Math.ceil(height / block.height) * depth * block.bytes,
          );
        }
      }
    });
  } catch (error) {
    for (const restore of restorers) restore();
    throw error;
  }
  return {
    phase(name: string) {
      if (disposed) throw new Error("Allocation probe is disposed");
      current = phases[name] ??= counters(total.liveBytes);
      current.liveBytes = total.liveBytes;
      current.peakLiveBytes = Math.max(current.peakLiveBytes, total.liveBytes);
    },
    snapshot() {
      return structuredClone({ total, phases });
    },
    dispose() {
      for (const restore of restorers) restore();
      disposed = true;
    },
  };
}

function textureBytes(descriptor: GPUTextureDescriptor): number | null {
  const bytes = texelBlock(descriptor.format);
  if (!bytes) return null;
  const [width, height, depth] = extent(descriptor.size);
  let total = 0;
  for (let mip = 0; mip < (descriptor.mipLevelCount ?? 1); mip++) {
    const divisor = 2 ** mip;
    total +=
      Math.ceil(Math.max(1, Math.floor(width / divisor)) / bytes.width) *
      Math.ceil(Math.max(1, Math.floor(height / divisor)) / bytes.height) *
      (descriptor.dimension === "3d" ? Math.max(1, Math.floor(depth / divisor)) : depth) *
      bytes.bytes *
      (descriptor.sampleCount ?? 1);
  }
  return total;
}

function extent(size: GPUExtent3D): [number, number, number] {
  if (Symbol.iterator in size) {
    const [width, height = 1, depth = 1] = size;
    return [width, height, depth];
  }
  return [size.width, size.height ?? 1, size.depthOrArrayLayers ?? 1];
}

function texelBlock(format: GPUTextureFormat) {
  const scalar = /^(r|rg|rgba)(8|16|32)(unorm|snorm|uint|sint|float)(-srgb)?$/.exec(format);
  if (scalar) return { width: 1, height: 1, bytes: (scalar[1].length * Number(scalar[2])) / 8 };
  if (
    [
      "bgra8unorm",
      "bgra8unorm-srgb",
      "rgb9e5ufloat",
      "rgb10a2uint",
      "rgb10a2unorm",
      "rg11b10ufloat",
      "depth32float",
    ].includes(format)
  )
    return { width: 1, height: 1, bytes: 4 };
  if (format === "depth16unorm") return { width: 1, height: 1, bytes: 2 };
  if (format === "stencil8") return { width: 1, height: 1, bytes: 1 };
  if (/^bc[1-7]/.test(format))
    return { width: 4, height: 4, bytes: /^bc[14]-/.test(format) ? 8 : 16 };
  if (/^(etc2|eac)-/.test(format))
    return { width: 4, height: 4, bytes: /^(etc2-rgba8|eac-rg11)/.test(format) ? 16 : 8 };
  const astc = /^astc-(\d+)x(\d+)-/.exec(format);
  if (astc) return { width: Number(astc[1]), height: Number(astc[2]), bytes: 16 };
  return null;
}
