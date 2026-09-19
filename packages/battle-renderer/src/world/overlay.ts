import {
  GrowableBuffer,
  makeVertexBuffer,
  makeIndexBuffer,
} from "../../../renderer-core/src/gpuBuffers";
import { overlayShader } from "../shaders/overlay";
import {
  overlayAttributeSizes,
  OVERLAY_QUAD,
  OVERLAY_INDICES,
  lineStaging,
  triangleStaging,
  ringStaging,
  type OverlayKind,
} from "../overlayStaging";
import type { BattleLinePlacement } from "../../../game-renderer/src/battle/overlayData";

/** Each layer owns its stable pipeline and growable vertex/instance buffers.
 * The caller supplies the shared camera, target and semantic frame ordering. */
async function createOverlayDraw(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  samples: 1 | 4,
  kind: OverlayKind,
  depthTest: boolean,
  alpha = 1,
) {
  const releases: (() => void)[] = [];
  const own = <T extends { dispose(): void } | { destroy(): void }>(r: T): T => {
    releases.push(() => ("dispose" in r ? r.dispose() : r.destroy()));
    return r;
  };
  let disposed = false;
  const assertLive = () => {
    if (disposed) throw Error("Overlay is disposed");
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const release of releases.reverse()) release();
  };
  const instanced = kind === "ring";
  try {
    const sizes = overlayAttributeSizes(kind);
    const buffers = sizes.map((size, i) =>
      own(new GrowableBuffer(device, `${kind} attribute${i}`, GPUBufferUsage.VERTEX, size * 4)),
    );
    const quad = instanced ? own(makeVertexBuffer(device, `${kind} quad`, OVERLAY_QUAD)) : null;
    const indices = instanced
      ? own(makeIndexBuffer(device, `${kind} indices`, OVERLAY_INDICES))
      : null;
    const attributes: GPUVertexBufferLayout[] = sizes.map((size, i) => ({
      arrayStride: size * 4,
      stepMode: instanced ? "instance" : "vertex",
      attributes: [
        {
          shaderLocation: i + (instanced ? 1 : 0),
          offset: 0,
          format: size === 1 ? "float32" : size === 3 ? "float32x3" : "float32x4",
        },
      ],
    }));
    if (instanced)
      attributes.unshift({
        arrayStride: 12,
        attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
      });
    const module = device.createShaderModule({
      label: `${kind} overlay`,
      code: overlayShader(kind, alpha),
    });
    const pipeline = await device.createRenderPipelineAsync({
      label: `${kind} overlay`,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [cameraLayout],
      }),
      vertex: { module, entryPoint: "vertex", buffers: attributes },
      fragment: {
        module,
        entryPoint: "fragment",
        targets: [
          {
            format: "rgba16float",
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            },
          },
        ],
      },
      primitive: { topology: kind === "line" ? "line-list" : "triangle-list", cullMode: "none" },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: false,
        depthCompare: depthTest ? "greater-equal" : "always",
      },
      multisample: { count: samples },
    });
    let count = 0;
    return {
      upload(values: Float32Array[], active: number) {
        assertLive();
        if (active > 0) for (let i = 0; i < buffers.length; i++) buffers[i].write(values[i]);
        count = active;
      },
      encode(pass: GPURenderPassEncoder, camera: GPUBindGroup) {
        assertLive();
        if (count === 0) return;
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, camera);
        if (quad) pass.setVertexBuffer(0, quad);
        for (let i = 0; i < buffers.length; i++)
          pass.setVertexBuffer(i + (instanced ? 1 : 0), buffers[i].buffer);
        if (indices) {
          pass.setIndexBuffer(indices, "uint16");
          pass.drawIndexed(6, count);
        } else pass.draw(count);
      },
      stats() {
        return { count, capacityBytes: buffers.reduce((n, b) => n + b.capacityBytes, 0) };
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export async function createRawLineLayer(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  samples: 1 | 4,
  placement: BattleLinePlacement,
  alpha: number,
  depthTest: boolean,
) {
  const draw = await createOverlayDraw(device, cameraLayout, samples, "line", depthTest, alpha),
    prepare = lineStaging(placement);
  return {
    ...draw,
    upload(vertices: Float32Array) {
      const p = prepare(vertices);
      draw.upload(p.values, p.count);
    },
  };
}
export async function createRawTriangleLayer(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  samples: 1 | 4,
) {
  const draw = await createOverlayDraw(device, cameraLayout, samples, "triangle", false),
    prepare = triangleStaging();
  return {
    ...draw,
    upload(vertices: Float32Array) {
      const p = prepare(vertices);
      draw.upload(p.values, p.count);
    },
  };
}
export async function createRawRingLayer(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  samples: 1 | 4,
  heightAt: (x: number, y: number) => number,
  lift: number,
) {
  const draw = await createOverlayDraw(device, cameraLayout, samples, "ring", true),
    prepare = ringStaging(heightAt, lift);
  return {
    ...draw,
    upload(vertices: Float32Array) {
      const p = prepare(vertices);
      draw.upload(p.values, p.count);
    },
  };
}
