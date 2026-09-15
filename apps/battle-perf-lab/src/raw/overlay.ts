import {
  prepareBattleLineVertices,
  writeBattleLineVertices,
  writeBattleTriangleVertices,
  writeBattleRingInstances,
  writeBattleMarkerInstances,
  type BattleLinePlacement,
  type MarkerInstance,
} from "../../../../packages/game-renderer/src/battle/overlayData";
import {
  GrowableBuffer,
  makeVertexBuffer,
  makeIndexBuffer,
} from "../../../../packages/renderer-core/src/gpuBuffers";
import { overlayShader, type OverlayKind } from "../shaders/overlay";

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
  const instanced = kind === "ring" || kind === "marker";
  try {
    const sizes = instanced ? [4, 4] : kind === "line" ? [3, 3, 1] : [3, 4];
    const buffers = sizes.map((size, i) =>
      own(new GrowableBuffer(device, `${kind} attribute${i}`, GPUBufferUsage.VERTEX, size * 4)),
    );
    const quad = instanced
      ? own(
          makeVertexBuffer(
            device,
            `${kind} quad`,
            new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]),
          ),
        )
      : null;
    const indices = instanced
      ? own(makeIndexBuffer(device, `${kind} indices`, new Uint16Array([0, 1, 2, 2, 1, 3])))
      : null;
    const basis =
      kind === "marker"
        ? own(
            device.createBuffer({
              size: 32,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            }),
          )
        : null;
    const basisLayout = basis
      ? device.createBindGroupLayout({
          entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
        })
      : null;
    const basisGroup =
      basis && basisLayout
        ? device.createBindGroup({
            layout: basisLayout,
            entries: [{ binding: 0, resource: { buffer: basis } }],
          })
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
        bindGroupLayouts: [cameraLayout, ...(basisLayout ? [basisLayout] : [])],
      }),
      vertex: { module, entryPoint: "vertex", buffers: attributes },
      fragment: {
        module,
        entryPoint: "fragment",
        targets: [
          {
            format: "rgba16float",
            blend:
              kind === "marker"
                ? undefined
                : {
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
      setBasis(right: readonly [number, number, number], up: readonly [number, number, number]) {
        assertLive();
        if (!basis) throw Error("Only markers use a camera basis");
        device.queue.writeBuffer(basis, 0, new Float32Array([...right, 0, ...up, 0]));
      },
      encode(pass: GPURenderPassEncoder, camera: GPUBindGroup) {
        assertLive();
        if (count === 0) return;
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, camera);
        if (basisGroup) pass.setBindGroup(1, basisGroup);
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

/** Retained CPU staging, with active uploads separate from allocation capacity. */
function staging(sizes: readonly number[], floor: number) {
  let capacity = 0,
    arrays: Float32Array[] = [];
  return (count: number) => {
    if (count > capacity) {
      capacity = Math.max(count, capacity * 2, floor);
      arrays = sizes.map((s) => new Float32Array(capacity * s));
    }
    return { arrays, active: () => arrays.map((a, i) => a.subarray(0, count * sizes[i])) };
  };
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
    stage = staging([3, 3, 1], 128);
  return {
    ...draw,
    upload(vertices: Float32Array) {
      const { source, stride, zOff } = prepareBattleLineVertices(vertices, placement),
        count = Math.floor(source.length / stride);
      if (!count) {
        draw.upload([], 0);
        return;
      }
      const s = stage(count);
      writeBattleLineVertices(
        source,
        stride,
        zOff,
        placement,
        s.arrays[0],
        s.arrays[1],
        s.arrays[2],
      );
      draw.upload(s.active(), count);
    },
  };
}
export async function createRawTriangleLayer(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  samples: 1 | 4,
) {
  const draw = await createOverlayDraw(device, cameraLayout, samples, "triangle", false),
    stage = staging([3, 4], 192);
  return {
    ...draw,
    upload(vertices: Float32Array) {
      const count = Math.floor(vertices.length / 6);
      if (!count) {
        draw.upload([], 0);
        return;
      }
      const s = stage(count);
      writeBattleTriangleVertices(vertices, s.arrays[0], s.arrays[1]);
      draw.upload(s.active(), count);
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
    stage = staging([4, 4], 256);
  return {
    ...draw,
    upload(rings: Float32Array) {
      const count = Math.floor(rings.length / 7);
      if (!count) {
        draw.upload([], 0);
        return;
      }
      const s = stage(count);
      writeBattleRingInstances(rings, heightAt, lift, s.arrays[0], s.arrays[1]);
      draw.upload(s.active(), count);
    },
  };
}
export async function createRawMarkerLayer(
  device: GPUDevice,
  cameraLayout: GPUBindGroupLayout,
  samples: 1 | 4,
) {
  const draw = await createOverlayDraw(device, cameraLayout, samples, "marker", false),
    stage = staging([4, 4], 256);
  return {
    ...draw,
    upload(markers: readonly MarkerInstance[]) {
      if (!markers.length) {
        draw.upload([], 0);
        return;
      }
      const s = stage(markers.length);
      writeBattleMarkerInstances(markers, s.arrays[0], s.arrays[1]);
      draw.upload(s.active(), markers.length);
    },
  };
}
