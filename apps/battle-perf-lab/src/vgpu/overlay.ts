import { draw, type Gpu, type FramePass } from "vgpu";
import type { BattleLinePlacement } from "../../../../packages/game-renderer/src/battle/overlayData";
import { growableBufferCapacity } from "../../../../packages/renderer-core/src/bufferCapacity";
import {
  overlayAttributeSizes,
  OVERLAY_QUAD,
  OVERLAY_INDICES,
  lineStaging,
  triangleStaging,
  ringStaging,
  type OverlayKind,
  type OverlayUpload,
} from "../../../../packages/battle-renderer/src/overlayStaging";
import { overlayShader } from "../../../../packages/battle-renderer/src/shaders/overlay";
import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
async function createVgpuOverlayDraw(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  samples: 1 | 4,
  kind: OverlayKind,
  depthTest: boolean,
  alpha = 1,
) {
  const owned = new Set<{ destroy(): void }>(),
    own = <T extends { destroy(): void }>(v: T) => {
      owned.add(v);
      return v;
    };
  let disposed = false,
    uploading = false,
    count = 0;
  const check = () => {
      if (disposed) throw Error("Overlay is disposed");
    },
    dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const r of owned) r.destroy();
    };
  const finish = beginGpuAdmission(gpu.device.gpu);
  try {
    const sizes = overlayAttributeSizes(kind),
      capacities = sizes.map((s) => s * 4),
      make = (size: number) =>
        own(gpu.device.createBuffer({ size, usage: ["vertex", "copy_dst"] })),
      buffers = capacities.map(make);
    const quad = kind === "ring" ? make(OVERLAY_QUAD.byteLength) : null;
    quad?.write(OVERLAY_QUAD);
    const indices =
      kind === "ring"
        ? own(
            gpu.device.createBuffer({
              size: OVERLAY_INDICES.byteLength,
              usage: ["index", "copy_dst"],
            }),
          )
        : null;
    indices?.write(OVERLAY_INDICES);
    const layouts: GPUVertexBufferLayout[] = sizes.map((s, i) => ({
      arrayStride: s * 4,
      stepMode: kind === "ring" ? "instance" : "vertex",
      attributes: [
        {
          shaderLocation: i + (kind === "ring" ? 1 : 0),
          offset: 0,
          format: s === 1 ? "float32" : s === 3 ? "float32x3" : "float32x4",
        },
      ],
    }));
    if (quad)
      layouts.unshift({
        arrayStride: 12,
        attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
      });
    const geometry = {
      vertexBufferLayouts: layouts,
      topology: kind === "line" ? ("line-list" as const) : ("triangle-list" as const),
      get vertexBuffers() {
        return [...(quad ? [quad.gpu] : []), ...buffers.map((b) => b.gpu)];
      },
      ...(indices
        ? { indexBuffer: indices.gpu, indexFormat: "uint16" as const, indexCount: 6 }
        : {}),
    };
    const render = draw(gpu, {
      shader: overlayShader(kind, alpha),
      geometry,
      set: { cam: camera },
      cull: "none",
      depth: { write: false, compare: depthTest ? "greater-equal" : "always" },
      blend: {
        color: { src: "src-alpha", dst: "one-minus-src-alpha" },
        alpha: { src: "one", dst: "one-minus-src-alpha" },
      },
    });
    await render.compile({ colors: ["rgba16float"], depth: "depth32float", sampleCount: samples });
    await finish();
    return {
      async upload(vertices: Float32Array, prepare: (vertices: Float32Array) => OverlayUpload) {
        check();
        if (uploading) throw Error("Overlay upload already in flight");
        uploading = true;
        try {
          const { values, count: active } = prepare(vertices);
          if (!active) {
            count = 0;
            return;
          }
          const nextSizes = values.map((v, i) =>
            growableBufferCapacity(capacities[i], v.byteLength),
          );
          if (nextSizes.some((n) => n > gpu.device.gpu.limits.maxBufferSize))
            throw Error("Overlay buffer limit");
          const next = buffers.slice(),
            changed: number[] = [];
          if (nextSizes.some((n, i) => n !== capacities[i])) {
            const admit = beginGpuAdmission(gpu.device.gpu);
            try {
              for (let i = 0; i < buffers.length; i++)
                if (nextSizes[i] !== capacities[i]) {
                  next[i] = make(nextSizes[i]);
                  changed.push(i);
                  next[i].write(values[i]);
                }
              await admit();
              check();
            } catch (error) {
              try {
                await admit();
              } finally {
                for (const i of changed) {
                  next[i].destroy();
                  owned.delete(next[i]);
                }
              }
              throw error;
            }
          }
          try {
            for (let i = 0; i < buffers.length; i++)
              if (!changed.includes(i)) buffers[i].write(values[i]);
          } catch (error) {
            for (const i of changed) {
              next[i].destroy();
              owned.delete(next[i]);
            }
            throw error;
          }
          for (const i of changed) {
            buffers[i].destroy();
            owned.delete(buffers[i]);
            buffers[i] = next[i];
            capacities[i] = nextSizes[i];
          }
          count = active;
        } finally {
          uploading = false;
        }
      },
      draw(pass: FramePass) {
        check();
        if (count) pass.draw(render, kind === "ring" ? { instances: count } : { vertices: count });
      },
      stats: () => ({ count, capacityBytes: capacities.reduce((a, b) => a + b, 0) }),
      dispose,
    };
  } catch (error) {
    try {
      await finish();
    } finally {
      dispose();
    }
    throw error;
  }
}
export async function createVgpuLineLayer(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  samples: 1 | 4,
  placement: BattleLinePlacement,
  alpha: number,
  depthTest: boolean,
) {
  const draw = await createVgpuOverlayDraw(gpu, camera, samples, "line", depthTest, alpha),
    prepare = lineStaging(placement);
  return {
    ...draw,
    upload(vertices: Float32Array) {
      return draw.upload(vertices, prepare);
    },
  };
}
export async function createVgpuTriangleLayer(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  samples: 1 | 4,
) {
  const draw = await createVgpuOverlayDraw(gpu, camera, samples, "triangle", false),
    prepare = triangleStaging();
  return {
    ...draw,
    upload(vertices: Float32Array) {
      return draw.upload(vertices, prepare);
    },
  };
}
export async function createVgpuRingLayer(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  samples: 1 | 4,
  heightAt: (x: number, y: number) => number,
  lift: number,
) {
  const draw = await createVgpuOverlayDraw(gpu, camera, samples, "ring", true),
    prepare = ringStaging(heightAt, lift);
  return {
    ...draw,
    upload(vertices: Float32Array) {
      return draw.upload(vertices, prepare);
    },
  };
}
