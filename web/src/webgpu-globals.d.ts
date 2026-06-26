type GPUTextureFormat = string;
type GPUColor = { r: number; g: number; b: number; a: number };
type GPUBuffer = unknown;
type GPUBindGroup = unknown;
type GPUBindGroupLayout = unknown;
type GPURenderPipeline = unknown;
type GPUSampler = unknown;
type GPUShaderModule = unknown;
type GPUTexture = { createView(): GPUTextureView };
type GPUTextureView = unknown;

declare const GPUBufferUsage: {
  readonly COPY_DST: number;
  readonly INDEX: number;
  readonly STORAGE: number;
  readonly UNIFORM: number;
  readonly VERTEX: number;
};

declare const GPUShaderStage: {
  readonly FRAGMENT: number;
  readonly VERTEX: number;
};

declare const GPUTextureUsage: {
  readonly COPY_DST: number;
  readonly RENDER_ATTACHMENT: number;
  readonly TEXTURE_BINDING: number;
};

interface GPUAdapterInfo {
  readonly vendor?: string;
  readonly architecture?: string;
  readonly description?: string;
}

interface GPUAdapter {
  readonly features: Set<string>;
  readonly limits: Record<string, number>;
  readonly info?: GPUAdapterInfo;
  requestDevice(): Promise<GPUDevice>;
}

interface GPU {
  getPreferredCanvasFormat(): GPUTextureFormat;
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
}

interface GPUCanvasContext {
  configure(config: { device: GPUDevice; format: GPUTextureFormat; alphaMode?: 'opaque' | 'premultiplied' });
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

interface GPUDevice {
  readonly queue: GPUQueue;
  createBindGroup(descriptor: unknown): GPUBindGroup;
  createBindGroupLayout(descriptor: unknown): GPUBindGroupLayout;
  createBuffer(descriptor: { label?: string; size: number; usage: number }): GPUBuffer;
  createCommandEncoder(descriptor?: unknown): GPUCommandEncoder;
  createPipelineLayout(descriptor: unknown): unknown;
  createRenderPipeline(descriptor: unknown): GPURenderPipeline;
  createSampler(descriptor?: unknown): GPUSampler;
  createShaderModule(descriptor: { label?: string; code: string }): GPUShaderModule;
  createTexture(descriptor: unknown): GPUTexture;
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: unknown): GPURenderPassEncoder;
  finish(): unknown;
}

interface GPURenderPassEncoder {
  draw(vertexCount: number, instanceCount?: number): void;
  drawIndexed(indexCount: number, instanceCount?: number): void;
  end(): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  setIndexBuffer(buffer: GPUBuffer, indexFormat: 'uint16' | 'uint32'): void;
  setPipeline(pipeline: GPURenderPipeline): void;
  setVertexBuffer(slot: number, buffer: GPUBuffer): void;
}

interface GPURequestAdapterOptions {
  powerPreference?: 'high-performance' | 'low-power';
}

interface Navigator {
  readonly gpu?: GPU;
}

interface HTMLCanvasElement {
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
}
