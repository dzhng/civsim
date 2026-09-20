/// <reference path="../../../../../web/node_modules/vitest/globals.d.ts" />
import { tgpu, type TgpuCommandEncoder } from "typegpu";
import { vi } from "vitest";

/** A recording device for the CPU lifecycle suites. TypeGPU materializes its
 *  resources lazily, so what reaches this mock is exactly the GPU memory an
 *  owner really made the device commit — not what it declared. Encoders are
 *  real TypeGPU encoders over the same device, so attachment views are
 *  unwrapped through the production path rather than inspected by hand. */
export function recordingGpu() {
  vi.stubGlobal("GPUBufferUsage", { UNIFORM: 64, COPY_DST: 8, COPY_SRC: 4, VERTEX: 32, INDEX: 16 });
  vi.stubGlobal("GPUTextureUsage", {
    COPY_SRC: 1,
    COPY_DST: 2,
    TEXTURE_BINDING: 4,
    STORAGE_BINDING: 8,
    RENDER_ATTACHMENT: 16,
  });
  vi.stubGlobal("GPUShaderStage", { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 });
  const live = new Set<object>();
  const textures: GPUTextureDescriptor[] = [];
  const buffers: GPUBufferDescriptor[] = [];
  const views: GPUTextureViewDescriptor[] = [];
  const passes: GPURenderPassDescriptor[] = [];
  const writes: { buffer: object; bytes: number }[] = [];
  const textureWrites: { texture: object; bytes: number }[] = [];
  let buffersFailAt = Infinity;
  const shaders: string[] = [];
  const errorScopes: GPUErrorFilter[] = [];
  const device = {
    limits: {},
    features: new Set<string>(),
    // Admission scopes are tracked rather than faked clean, so an owner that pops more
    // than it pushed fails here instead of silently reporting no error.
    pushErrorScope: (filter: GPUErrorFilter) => errorScopes.push(filter),
    popErrorScope: async () => {
      if (!errorScopes.pop()) throw Error("popErrorScope without a matching push");
      return null;
    },
    createShaderModule: (descriptor: GPUShaderModuleDescriptor) => {
      shaders.push(descriptor.code);
      return { getCompilationInfo: async () => ({ messages: [] }) };
    },
    createPipelineLayout: () => ({}),
    createRenderPipelineAsync: async () => ({}),
    createTexture: (descriptor: GPUTextureDescriptor) => {
      textures.push(descriptor);
      const texture = {
        destroy: () => live.delete(texture),
        createView: (viewDescriptor?: GPUTextureViewDescriptor) => {
          views.push(viewDescriptor ?? {});
          return { view: viewDescriptor };
        },
      };
      live.add(texture);
      return texture;
    },
    createBuffer: (descriptor: GPUBufferDescriptor) => {
      if (buffers.length + 1 === buffersFailAt) throw Error("injected allocation failure");
      buffers.push(descriptor);
      const buffer = { descriptor, mapState: "unmapped", destroy: () => live.delete(buffer) };
      live.add(buffer);
      return buffer;
    },
    createSampler: () => ({}),
    createBindGroup: () => ({}),
    createBindGroupLayout: () => ({}),
    queue: {
      submit: vi.fn(),
      writeBuffer: (
        buffer: object,
        _offset: number,
        _data: ArrayBuffer,
        _dataOffset: number,
        size: number,
      ) => writes.push({ buffer, bytes: size }),
      writeTexture: (
        destination: { texture: object },
        data: ArrayBufferView,
        _layout: GPUTexelCopyBufferLayout,
        _size: GPUExtent3D,
      ) => textureWrites.push({ texture: destination.texture, bytes: data.byteLength }),
    },
    createCommandEncoder: () => ({
      finish: () => ({}),
      beginRenderPass: (descriptor: GPURenderPassDescriptor) => {
        passes.push(descriptor);
        return { end: vi.fn(), setPipeline: vi.fn() };
      },
    }),
  };
  const native = device as unknown as GPUDevice;
  const root = tgpu.initFromDevice({ device: native });
  return {
    native,
    encoder: (): TgpuCommandEncoder => root["~unstable"].createCommandEncoder(),
    /** Materializes a lazily-built resource through the production path, so a
     *  test reads what the device was actually asked for. */
    unwrap: <T>(resource: T) => root.unwrap(resource as never),
    live,
    textures,
    buffers,
    views,
    passes,
    writes,
    /** The atlas mip bytes this device was asked to commit, upload by upload. */
    textureWrites,
    /** Every shader body this device was actually asked to compile. */
    shaders,
    /** Admission scopes still open. A balanced owner leaves none. */
    errorScopes,
    failBufferAt: (index: number) => {
      buffersFailAt = index;
    },
  };
}

/** The per-layer 2d view a depth attachment actually received. */
export function attachedLayer(descriptor: GPURenderPassDescriptor): GPUTextureViewDescriptor {
  const view = descriptor.depthStencilAttachment!.view as unknown as {
    view: GPUTextureViewDescriptor;
  };
  return view.view;
}
