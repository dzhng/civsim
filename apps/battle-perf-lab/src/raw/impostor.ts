import type { CrowdInstance } from "../../../../packages/crowd-runtime/src/instanceData";
import { corpsePresentationStrength } from "../../../../packages/crowd-runtime/src/instanceData";
import {
  hemiOctTileDirections,
  nearestHemiOctTile,
} from "../../../../packages/photoreal-renderer/src/battle/impostorTile";
import { GrowableBuffer } from "../../../../packages/renderer-core/src/gpuBuffers";
import { GPU_DEPTH_FORMAT } from "../../../../packages/renderer-core/src/depthContract";
import { impostorShader } from "../shaders/impostor";
import type { RawEnvironment } from "./environment";

export interface ImpostorAtlasData {
  columns: number;
  rows: number;
  tileSize: number;
  center: readonly [number, number, number];
  worldSpan: number;
  /** Complete, tightly packed RGBA8 mip chains, including level zero. Albedo is sRGB. */
  albedo: readonly Uint8Array[];
  normal: readonly Uint8Array[];
  orm: readonly Uint8Array[];
}
export interface ImpostorView {
  right: readonly [number, number, number];
  up: readonly [number, number, number];
  eye: readonly [number, number, number];
  fovY: number;
}
/** Mirrors the authored billboard policy. Visibility and LOD selection belong to the caller. */
export function packImpostors(
  atlas: ImpostorAtlasData,
  instances: readonly CrowdInstance[],
  view: ImpostorView,
): Float32Array<ArrayBuffer> {
  const result = new Float32Array(instances.length * 12);
  const dirs = hemiOctTileDirections(atlas.columns, atlas.rows);
  const tanHalf = view.fovY > 0 ? Math.tan(view.fovY / 2) : 0;
  instances.forEach((src, i) => {
    const angle = src.facing - Math.PI / 2,
      c = Math.cos(angle),
      s = Math.sin(angle);
    let dx = view.eye[0] - src.x,
      dy = view.eye[1] - src.y,
      dz = view.eye[2] - (src.elevation ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const divisor = dist || 1;
    dx /= divisor;
    dy /= divisor;
    dz /= divisor;
    const localX = dx * c + dy * s,
      localY = -dx * s + dy * c;
    const length = Math.sqrt(localX * localX + localY * localY + dz * dz) || 1;
    const tile = nearestHemiOctTile(
      localX / length,
      localY / length,
      dz / length,
      atlas.columns,
      atlas.rows,
      dirs,
    );
    let span = atlas.worldSpan;
    if (tanHalf > 0 && dist > 0) {
      const screenFraction = atlas.worldSpan / (2 * dist * tanHalf);
      if (screenFraction < 0.008) span *= 0.008 / screenFraction;
    }
    result.set(
      [
        src.x + atlas.center[0] * c - atlas.center[1] * s,
        src.y + atlas.center[0] * s + atlas.center[1] * c,
        (src.elevation ?? 0) + atlas.center[2],
        src.faction,
        tile,
        span,
        span,
        angle,
        1 - corpsePresentationStrength(src),
        0,
        0,
        0,
      ],
      i * 12,
    );
  });
  return result;
}

/** Owns uploaded captured atlas mips and buffers; device, camera, environment and attachments are borrowed.
 * Native atlas baking remains a separate admission gate; no Three runtime is used here. */
export async function createRawImpostors(
  device: GPUDevice,
  atlas: ImpostorAtlasData,
  cameraLayout: GPUBindGroupLayout,
  environment: RawEnvironment,
  sampleCount = 4,
) {
  const textures: GPUTexture[] = [];
  let instances: GrowableBuffer | undefined;
  let viewBuffer: GPUBuffer | undefined;
  let scopesOpen = false;
  const closeScopes = async () => {
    if (!scopesOpen) return;
    scopesOpen = false;
    const results = await Promise.allSettled([
      device.popErrorScope(),
      device.popErrorScope(),
      device.popErrorScope(),
    ]);
    const errors = results.flatMap((r) =>
      r.status === "rejected" ? [String(r.reason)] : r.value ? [r.value.message] : [],
    );
    if (errors.length) throw new Error(`Impostor GPU admission failed: ${errors.join("; ")}`);
  };
  let disposed = false,
    count = 0;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    instances?.dispose();
    viewBuffer?.destroy();
    for (const t of textures) t.destroy();
  };
  const assertLive = () => {
    if (disposed) throw new Error("Raw impostors are disposed");
  };
  try {
    device.pushErrorScope("out-of-memory");
    device.pushErrorScope("internal");
    device.pushErrorScope("validation");
    scopesOpen = true;
    instances = new GrowableBuffer(device, "impostor instances", GPUBufferUsage.VERTEX, 512 * 48);
    viewBuffer = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const instanceBuffer = instances,
      cameraUniform = viewBuffer;
    const width = atlas.columns * atlas.tileSize,
      height = atlas.rows * atlas.tileSize;
    const levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
    for (const [index, chain] of [atlas.albedo, atlas.normal, atlas.orm].entries()) {
      if (chain.length !== levels) throw new Error("Impostor atlas requires complete mip chains");
      const texture = device.createTexture({
        size: [width, height],
        format: index === 0 ? "rgba8unorm-srgb" : "rgba8unorm",
        mipLevelCount: levels,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      textures.push(texture);
      chain.forEach((bytes, mipLevel) => {
        const w = Math.max(1, width >> mipLevel),
          h = Math.max(1, height >> mipLevel);
        if (bytes.length !== w * h * 4) throw new Error("Impostor mip dimensions mismatch");
        device.queue.writeTexture({ texture, mipLevel }, bytes, { bytesPerRow: w * 4 }, [w, h]);
      });
    }
    const layout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        ...textures.map((_, index) => ({
          binding: index + 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {},
        })),
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const group = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: viewBuffer } },
        ...textures.map((texture, index) => ({
          binding: index + 1,
          resource: texture.createView(),
        })),
        {
          binding: 4,
          resource: device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "linear",
          }),
        },
      ],
    });
    const emptyLayout = device.createBindGroupLayout({ entries: [] });
    const emptyGroup = device.createBindGroup({ layout: emptyLayout, entries: [] });
    const shaderSource = impostorShader(environment.shader, atlas.columns, atlas.rows);
    const clipInvariant = shaderSource.includes("@invariant");
    const shader = device.createShaderModule({ code: shaderSource });
    const pipelinePromise = device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [cameraLayout, layout, emptyLayout, environment.layout],
      }),
      vertex: {
        module: shader,
        entryPoint: "vertex",
        buffers: [
          {
            arrayStride: 48,
            stepMode: "instance",
            attributes: [0, 1, 2].map((i) => ({
              shaderLocation: i,
              offset: i * 16,
              format: "float32x4" as const,
            })),
          },
        ],
      },
      fragment: { module: shader, entryPoint: "fragment", targets: [{ format: "rgba16float" }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        format: GPU_DEPTH_FORMAT,
        depthWriteEnabled: true,
        depthCompare: "greater-equal",
      },
      multisample: { count: sampleCount },
    });
    const [pipeline] = await Promise.all([pipelinePromise, closeScopes()]);
    return {
      update(source: readonly CrowdInstance[], view: ImpostorView) {
        assertLive();
        const data = packImpostors(atlas, source, view);
        instanceBuffer.write(data);
        count = source.length;
        device.queue.writeBuffer(
          cameraUniform,
          0,
          new Float32Array([...view.right, 0, ...view.up, 0]),
        );
        return data;
      },
      draw(pass: GPURenderPassEncoder, camera: GPUBindGroup) {
        assertLive();
        if (!count) return;
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, camera);
        pass.setBindGroup(1, group);
        pass.setBindGroup(2, emptyGroup);
        pass.setBindGroup(3, environment.bindGroup);
        pass.setVertexBuffer(0, instanceBuffer.buffer);
        pass.draw(6, count);
      },
      stats: () => ({
        instances: count,
        draws: count ? 1 : 0,
        clipInvariant,
        castShadow: false,
        receiveShadow: false,
        atlasSource: "captured full mip chain",
      }),
      dispose,
    };
  } catch (error) {
    try {
      await closeScopes();
    } finally {
      dispose();
    }
    throw error;
  }
}
