import {
  tgpu,
  d,
  std,
  type TgpuBindGroup,
  type TgpuRenderCommands,
  type TgpuRenderPipeline,
  type TgpuVertexLayout,
} from "typegpu";
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
} from "../../src/overlayStaging";
import { overlayFunctions } from "../../src/shaders/overlay";
import { linearAlbedoWgsl } from "../../src/shaders/soldierFaction";
import { beginGpuAdmission } from "../../src/gpuAdmission";
import { typegpuCameraLayout } from "./camera";
const position = tgpu.vertexLayout(d.disarrayOf(d.vec3f)),
  rgb = tgpu.vertexLayout(d.disarrayOf(d.vec3f)),
  rgba = tgpu.vertexLayout(d.disarrayOf(d.vec4f)),
  opacity = tgpu.vertexLayout(d.disarrayOf(d.f32)),
  instance = tgpu.vertexLayout(d.disarrayOf(d.vec4f), "instance"),
  tint = tgpu.vertexLayout(d.disarrayOf(d.vec4f), "instance");
const Vertex = d.struct({ world: d.vec3f, color: d.vec4f, local: d.vec2f });
const varying = { color: d.vec4f, local: d.vec2f };
async function createTypegpuOverlayDraw(
  device: GPUDevice,
  camera: TgpuBindGroup,
  samples: 1 | 4,
  kind: OverlayKind,
  depthTest: boolean,
  alpha = 1,
) {
  const root = tgpu.initFromDevice({ device }),
    owned = new Set<{ destroy(): void }>();
  const own = <T extends { destroy(): void }>(v: T) => {
    owned.add(v);
    return v;
  };
  let disposed = false,
    uploading = false,
    count = 0;
  const check = () => {
    if (disposed) throw Error("Overlay is disposed");
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const v of owned) v.destroy();
    root.destroy();
  };
  const finish = beginGpuAdmission(device);
  try {
    const sizes = overlayAttributeSizes(kind),
      capacities = sizes.map((s) => s * 4);
    const make = (bytes: number) =>
      own(root.createBuffer(d.disarrayOf(d.f32, bytes / 4)).$usage("vertex"));
    const buffers = capacities.map(make),
      layouts: TgpuVertexLayout[] =
        kind === "line"
          ? [position, rgb, opacity]
          : kind === "triangle"
            ? [position, rgba]
            : [instance, tint];
    const quad = kind === "ring" ? make(OVERLAY_QUAD.byteLength) : null;
    quad?.write(OVERLAY_QUAD.slice().buffer);
    const indices =
      kind === "ring"
        ? own(root.createBuffer(d.disarrayOf(d.u16, OVERLAY_INDICES.length)).$usage("index"))
        : null;
    indices?.write(OVERLAY_INDICES.slice().buffer);
    const f = overlayFunctions(kind, alpha),
      vertexFn = tgpu
        .fn(
          [d.vec3f, d.vec4f, d.vec4f],
          Vertex,
        )(f.vertex)
        .$uses({ OverlayVertex: Vertex }),
      linearAlbedo = tgpu.fn([d.vec3f], d.vec3f)(linearAlbedoWgsl),
      shade = tgpu.fn([d.vec4f, d.vec2f], d.vec4f)(f.fragment).$uses({ linearAlbedo });
    const fragment = tgpu.fragmentFn({ in: varying, out: d.vec4f })((v) => {
      "use gpu";
      return shade(v.color, v.local);
    });
    const out = { clip: d.builtin.position, ...varying };
    const line = tgpu.vertexFn({ in: { p: d.vec3f, a: d.vec3f, alpha: d.f32 }, out })((v) => {
      "use gpu";
      const r = vertexFn(v.p, d.vec4f(v.a, v.alpha), d.vec4f(0));
      return {
        clip: std.mul(typegpuCameraLayout.$.cam.viewProj, d.vec4f(r.world, 1)),
        color: r.color,
        local: r.local,
      };
    });
    const triangle = tgpu.vertexFn({ in: { p: d.vec3f, a: d.vec4f }, out })((v) => {
      "use gpu";
      const r = vertexFn(v.p, v.a, d.vec4f(0));
      return {
        clip: std.mul(typegpuCameraLayout.$.cam.viewProj, d.vec4f(r.world, 1)),
        color: r.color,
        local: r.local,
      };
    });
    const ring = tgpu.vertexFn({ in: { p: d.vec3f, a: d.vec4f, b: d.vec4f }, out })((v) => {
      "use gpu";
      const r = vertexFn(v.p, v.a, v.b);
      return {
        clip: std.mul(typegpuCameraLayout.$.cam.viewProj, d.vec4f(r.world, 1)),
        color: r.color,
        local: r.local,
      };
    });
    const common = {
      fragment,
      targets: {
        format: "rgba16float" as const,
        blend: {
          color: { srcFactor: "src-alpha" as const, dstFactor: "one-minus-src-alpha" as const },
          alpha: { srcFactor: "one" as const, dstFactor: "one-minus-src-alpha" as const },
        },
      },
      primitive: {
        topology: kind === "line" ? ("line-list" as const) : ("triangle-list" as const),
        cullMode: "none" as const,
      },
      depthStencil: {
        format: "depth32float" as const,
        depthWriteEnabled: false,
        depthCompare: depthTest ? ("greater-equal" as const) : ("always" as const),
      },
      multisample: { count: samples },
    };
    const pipeline: TgpuRenderPipeline =
      kind === "line"
        ? root.createRenderPipeline({
            ...common,
            vertex: line,
            attribs: { p: position.attrib, a: rgb.attrib, alpha: opacity.attrib },
          })
        : kind === "triangle"
          ? root.createRenderPipeline({
              ...common,
              vertex: triangle,
              attribs: { p: position.attrib, a: rgba.attrib },
            })
          : root.createRenderPipeline({
              ...common,
              vertex: ring,
              attribs: { p: position.attrib, a: instance.attrib, b: tint.attrib },
            });
    for (const b of buffers) root.unwrap(b);
    await pipeline.initAsync();
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
          if (nextSizes.some((n) => n > device.limits.maxBufferSize))
            throw Error("Overlay buffer limit");
          // Finish fallible CPU copies before changing GPU resources.
          const uploads = values.map((value) => value.slice().buffer);
          const next = buffers.slice(),
            changed: number[] = [];
          if (nextSizes.some((n, i) => n !== capacities[i])) {
            const admit = beginGpuAdmission(device);
            try {
              for (let i = 0; i < buffers.length; i++)
                if (nextSizes[i] !== capacities[i]) {
                  next[i] = make(nextSizes[i]);
                  changed.push(i);
                  next[i].write(uploads[i]);
                  root.unwrap(next[i]);
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
              if (!changed.includes(i)) buffers[i].write(uploads[i]);
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
      draw(pass: TgpuRenderCommands) {
        check();
        if (!count) return;
        let bound = pipeline.with(camera).with(pass);
        // Packed byte buffers preserve the native byte-growth policy; these public handles
        // remain TypeGPU-owned and are bound through TypeGPU's vertex-layout API.
        for (let i = 0; i < buffers.length; i++)
          bound = bound.with(layouts[i], root.unwrap(buffers[i]));
        if (quad && indices)
          bound.with(position, root.unwrap(quad)).withIndexBuffer(indices).drawIndexed(6, count);
        else bound.draw(count);
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
export async function createTypegpuLineLayer(
  device: GPUDevice,
  camera: TgpuBindGroup,
  samples: 1 | 4,
  placement: BattleLinePlacement,
  alpha: number,
  depthTest: boolean,
) {
  const draw = await createTypegpuOverlayDraw(device, camera, samples, "line", depthTest, alpha),
    prepare = lineStaging(placement);
  return {
    ...draw,
    upload(vertices: Float32Array) {
      return draw.upload(vertices, prepare);
    },
  };
}
export async function createTypegpuTriangleLayer(
  device: GPUDevice,
  camera: TgpuBindGroup,
  samples: 1 | 4,
) {
  const draw = await createTypegpuOverlayDraw(device, camera, samples, "triangle", false),
    prepare = triangleStaging();
  return {
    ...draw,
    upload(vertices: Float32Array) {
      return draw.upload(vertices, prepare);
    },
  };
}
export async function createTypegpuRingLayer(
  device: GPUDevice,
  camera: TgpuBindGroup,
  samples: 1 | 4,
  heightAt: (x: number, y: number) => number,
  lift: number,
) {
  const draw = await createTypegpuOverlayDraw(device, camera, samples, "ring", true),
    prepare = ringStaging(heightAt, lift);
  return {
    ...draw,
    upload(vertices: Float32Array) {
      return draw.upload(vertices, prepare);
    },
  };
}
