type GPUTextureFormat = string;
type GPUColor = { r: number; g: number; b: number; a: number };
interface GPUBuffer {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
}
type GPUCommandBuffer = object;
type GPUBindGroup = unknown;
type GPUBindGroupLayout = unknown;
type GPURenderPipeline = unknown;
type GPUSampler = unknown;
type GPUCompilationMessageType = "error" | "warning" | "info";
interface GPUCompilationMessage {
  readonly message: string;
  readonly type: GPUCompilationMessageType;
  readonly lineNum: number;
  readonly linePos: number;
  readonly offset: number;
  readonly length: number;
}
interface GPUCompilationInfo {
  readonly messages: ReadonlyArray<GPUCompilationMessage>;
}
interface GPUShaderModule {
  getCompilationInfo(): Promise<GPUCompilationInfo>;
}
type GPUTexture = { createView(): GPUTextureView; destroy(): void };
type GPUTextureView = unknown;

interface GPUDeviceLostInfo {
  readonly reason: "destroyed" | "unknown";
  readonly message: string;
}

interface GPUUncapturedErrorEvent {
  readonly error: { readonly message: string };
}

declare const GPUBufferUsage: {
  readonly COPY_DST: number;
  readonly COPY_SRC: number;
  readonly INDEX: number;
  readonly MAP_READ: number;
  readonly QUERY_RESOLVE: number;
  readonly STORAGE: number;
  readonly UNIFORM: number;
  readonly VERTEX: number;
};

declare const GPUMapMode: {
  readonly READ: number;
  readonly WRITE: number;
};

declare const GPUShaderStage: {
  readonly COMPUTE: number;
  readonly FRAGMENT: number;
  readonly VERTEX: number;
};

declare const GPUTextureUsage: {
  readonly COPY_SRC: number;
  readonly COPY_DST: number;
  readonly RENDER_ATTACHMENT: number;
  readonly STORAGE_BINDING: number;
  readonly TEXTURE_BINDING: number;
};

type GPUComputePipeline = unknown;

interface GPUAdapterInfo {
  readonly vendor?: string;
  readonly architecture?: string;
  readonly description?: string;
}

interface GPUDeviceDescriptor {
  requiredFeatures?: string[];
  requiredLimits?: Record<string, number>;
}

interface GPUAdapter {
  readonly features: Set<string>;
  readonly limits: Record<string, number>;
  readonly info?: GPUAdapterInfo;
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
}

interface GPU {
  getPreferredCanvasFormat(): GPUTextureFormat;
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
}

interface GPUCanvasContext {
  configure(config: {
    device: GPUDevice;
    format: GPUTextureFormat;
    alphaMode?: "opaque" | "premultiplied";
  });
  getConfiguration?(): unknown;
  getCurrentTexture(): GPUTexture;
  unconfigure?(): void;
}

interface GPUQueue {
  onSubmittedWorkDone(): Promise<void>;
  submit(commands: unknown[]): void;
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource): void;
  writeTexture(destination: unknown, data: BufferSource, dataLayout: unknown, size: unknown): void;
  copyExternalImageToTexture(source: unknown, destination: unknown, copySize: unknown): void;
}

interface GPUQuerySet {
  destroy(): void;
}

interface GPUDevice {
  readonly queue: GPUQueue;
  readonly features: Set<string>;
  readonly limits: Record<string, number>;
  createBindGroup(descriptor: unknown): GPUBindGroup;
  createQuerySet(descriptor: {
    type: "timestamp" | "occlusion";
    count: number;
    label?: string;
  }): GPUQuerySet;
  createBindGroupLayout(descriptor: unknown): GPUBindGroupLayout;
  createBuffer(descriptor: { label?: string; size: number; usage: number }): GPUBuffer;
  createCommandEncoder(descriptor?: unknown): GPUCommandEncoder;
  createPipelineLayout(descriptor: unknown): unknown;
  createComputePipeline(descriptor: unknown): GPUComputePipeline;
  createRenderPipeline(descriptor: unknown): GPURenderPipeline;
  createSampler(descriptor?: unknown): GPUSampler;
  createShaderModule(descriptor: { label?: string; code: string }): GPUShaderModule;
  createTexture(descriptor: unknown): GPUTexture;
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: unknown): GPURenderPassEncoder;
  beginComputePass(descriptor?: unknown): GPUComputePassEncoder;
  resolveQuerySet(
    querySet: GPUQuerySet,
    firstQuery: number,
    queryCount: number,
    destination: GPUBuffer,
    destinationOffset: number,
  ): void;
  copyBufferToBuffer(
    source: GPUBuffer,
    sourceOffset: number,
    destination: GPUBuffer,
    destinationOffset: number,
    size: number,
  ): void;
  finish(): GPUCommandBuffer;
}

interface GPUComputePassEncoder {
  setPipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  dispatchWorkgroups(
    workgroupCountX: number,
    workgroupCountY?: number,
    workgroupCountZ?: number,
  ): void;
  end(): void;
}

interface GPURenderPassEncoder {
  draw(vertexCount: number, instanceCount?: number): void;
  drawIndexed(indexCount: number, instanceCount?: number): void;
  end(): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  setIndexBuffer(buffer: GPUBuffer, indexFormat: "uint16" | "uint32"): void;
  setPipeline(pipeline: GPURenderPipeline): void;
  setVertexBuffer(slot: number, buffer: GPUBuffer): void;
  setScissorRect(x: number, y: number, width: number, height: number): void;
  setViewport(
    x: number,
    y: number,
    width: number,
    height: number,
    minDepth: number,
    maxDepth: number,
  ): void;
}

interface GPURequestAdapterOptions {
  powerPreference?: "high-performance" | "low-power";
}

interface Navigator {
  readonly gpu?: GPU;
}

interface HTMLCanvasElement {
  getContext(contextId: "webgpu"): GPUCanvasContext | null;
}
