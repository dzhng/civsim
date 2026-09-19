import {
  initFromDevice,
  texture,
  sampler,
  geometry,
  draw,
  frame,
  target,
  type FramePass,
} from "vgpu";
import {
  QUAD,
  QUAD_INDEX,
  type BattleReadoutInstance,
} from "../../../../packages/game-renderer/src/battle/readoutData";
import { readoutWgsl } from "../../../../packages/battle-renderer/src/shaders/readout";
import { readoutCamera } from "../../../../packages/battle-renderer/src/readoutCamera";
import { prepareReadouts } from "../readoutPreparation";
import { destroyVgpuTarget } from "./targetLifetime";
import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
/** Public vgpu allocations/draw encoding; native queue only transfers authored canvas pixels. */
export async function createVgpuReadout(device: GPUDevice, samples: 1 | 4) {
  const gpu = await initFromDevice(device),
    pending = new Set<{ destroy(): void }>(),
    fixed = new Set<{ destroy(): void }>();
  const own = <T extends { destroy(): void }>(r: T) => {
    fixed.add(r);
    return r;
  };
  let disposed = false,
    busy = false;
  const finishInitial = beginGpuAdmission(device);
  try {
    const camera = own(gpu.device.createBuffer({ size: 128, usage: ["uniform", "copy_dst"] })),
      linear = sampler(gpu, { minFilter: "linear", magFilter: "linear" });
    const admissionTarget = target(gpu, {
      size: [1, 1],
      format: "rgba16float",
      depth: "depth32float",
      msaa: samples === 4,
    });
    fixed.add({ destroy: () => destroyVgpuTarget(admissionTarget) });
    await finishInitial();
    let current: ReturnType<typeof prepareReadouts> | undefined,
      atlas: ReturnType<typeof makeAtlas> | undefined,
      mesh: ReturnType<typeof makeGeometry> | undefined,
      render: ReturnType<typeof draw> | undefined,
      count = 0,
      spare: { value: ReturnType<typeof makeGeometry>; capacity: number } | undefined,
      capacity = 0,
      admissionSubmissions = 0,
      atlasUploads = 0,
      atlasUploadBytes = 0,
      instanceUploadBytes = 0;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const r of pending) r.destroy();
      pending.clear();
      atlas?.destroy();
      mesh?.destroy();
      spare?.value.destroy();
      for (const r of fixed) r.destroy();
      fixed.clear();
      gpu.dispose();
    };
    function makeAtlas(canvas: HTMLCanvasElement) {
      const t = texture(gpu, {
        kind: "2d",
        size: [canvas.width, canvas.height],
        format: "rgba8unorm-srgb",
        usage: ["copy_dst", "render_attachment", "texture_binding"],
      });
      pending.add(t);
      device.queue.copyExternalImageToTexture(
        { source: canvas, flipY: false },
        { texture: t.gpu, premultipliedAlpha: false, colorSpace: "srgb" },
        [canvas.width, canvas.height],
      );
      return t;
    }
    function makeGeometry(n: number) {
      const owned: { destroy(): void }[] = [];
      const allocation = {
        destroy() {
          for (const b of owned) b.destroy();
        },
      };
      pending.add(allocation);
      const buffer = (size: number, usage: ("vertex" | "index" | "copy_dst")[]) => {
        const b = gpu.device.createBuffer({ size, usage });
        owned.push(b);
        return b;
      };
      const quad = buffer(QUAD.byteLength, ["vertex", "copy_dst"]);
      quad.write(QUAD);
      const a = buffer(n * 16, ["vertex", "copy_dst"]),
        b = buffer(n * 16, ["vertex", "copy_dst"]),
        c = buffer(n * 16, ["vertex", "copy_dst"]),
        indices = buffer(24, ["index", "copy_dst"]);
      indices.write(Uint32Array.from(QUAD_INDEX));
      const value = geometry(gpu, {
        vertexCount: 4,
        instanceCount: n,
        buffers: [
          { buffer: quad.gpu, stride: 12, attributes: { quad: "float32x3" } },
          { buffer: a.gpu, stride: 16, stepMode: "instance", attributes: { chip0: "float32x4" } },
          { buffer: b.gpu, stride: 16, stepMode: "instance", attributes: { chip1: "float32x4" } },
          { buffer: c.gpu, stride: 16, stepMode: "instance", attributes: { cell: "float32x4" } },
        ],
        indexBuffer: indices.gpu,
        indexFormat: "uint32",
        indexCount: 6,
      });
      owned.push(value);
      const result = { value, a, b, c, destroy: allocation.destroy };
      pending.delete(allocation);
      pending.add(result);
      return result;
    }
    const owner = {
      async upload(instances: readonly BattleReadoutInstance[]) {
        if (disposed || busy) throw Error("Readout disposed or upload already pending");
        const next = prepareReadouts(instances, current);
        busy = true;
        const finish = beginGpuAdmission(device);
        let nextAtlas: typeof atlas, nextMesh: typeof mesh;
        try {
          if (!atlas || next.key !== current?.key) nextAtlas = makeAtlas(next.canvas);
          let nextCapacity = Math.max(128, 2 ** Math.ceil(Math.log2(Math.max(1, next.count))));
          if (spare && spare.capacity >= nextCapacity) {
            nextMesh = spare.value;
            nextCapacity = spare.capacity;
            spare = undefined;
            pending.add(nextMesh);
          } else nextMesh = makeGeometry(nextCapacity);
          if (next.count) {
            nextMesh.a.write(next.chip0);
            nextMesh.b.write(next.chip1);
            nextMesh.c.write(next.chipUv);
          }
          const nextDraw = draw(gpu, {
            shader: readoutWgsl,
            geometry: nextMesh.value,
            set: { camera, atlas: nextAtlas ?? atlas!, linear },
            cull: "none",
            depth: { write: false, compare: "always" },
          });
          const compiled = nextDraw.compile({
            colors: ["rgba16float"],
            depth: "depth32float",
            sampleCount: samples,
          });
          // Public frame encoding materializes lazy bind groups before publication.
          // One instance in a private 1px target avoids Chrome's zero-instance warning.
          // This extra draw/submission is reported, not hidden as frame warm-up.
          await Promise.all([finish(), compiled]);
          if (disposed) throw Error("Readout disposed during admission");
          const bindAdmission = beginGpuAdmission(device);
          let admitted;
          try {
            admitted = frame(gpu, (current) =>
              current.pass(
                { target: admissionTarget, clear: [0, 0, 0, 0], clearDepth: 1 },
                (pass) => pass.draw(nextDraw, { instances: 1 }),
              ),
            );
          } catch (error) {
            await bindAdmission();
            throw error;
          }
          await Promise.all([bindAdmission(), admitted.done]);
          if (disposed) throw Error("Readout disposed during admission");
          if (nextAtlas) {
            atlas?.destroy();
            atlas = nextAtlas;
            pending.delete(atlas);
            atlasUploads++;
            atlasUploadBytes += next.canvas.width * next.canvas.height * 4;
          }
          if (nextMesh) {
            spare?.value.destroy();
            spare = mesh ? { value: mesh, capacity } : undefined;
            mesh = nextMesh;
            pending.delete(mesh);
            capacity = nextCapacity;
          }
          admissionSubmissions++;
          current = next;
          count = next.count;
          render = nextDraw;
          instanceUploadBytes += count * 48;
        } catch (error) {
          for (const r of pending) r.destroy();
          pending.clear();
          await finish();
          throw error;
        } finally {
          busy = false;
        }
      },
      setCamera(vp: ArrayLike<number>, world: ArrayLike<number>) {
        if (disposed) throw Error("Readout disposed");
        camera.write(readoutCamera(vp, world));
      },
      draw(pass: FramePass) {
        if (disposed || busy) throw Error("Readout unavailable");
        if (count) pass.draw(render!, { instances: count });
      },
      stats: () => ({
        readouts: current?.readouts ?? 0,
        chips: count,
        atlasWidth: current?.canvas.width ?? 1,
        atlasHeight: current?.canvas.height ?? 1,
        atlasUploads,
        atlasUploadBytes,
        instanceUploadBytes,
        admissionSubmissions,
        instanceBufferBytes: (capacity + (spare?.capacity ?? 0)) * 48,
      }),
      dispose,
    };
    try {
      await owner.upload([]);
    } catch (error) {
      dispose();
      throw error;
    }
    return owner;
  } catch (error) {
    for (const r of pending) r.destroy();
    for (const r of fixed) r.destroy();
    fixed.clear();
    gpu.dispose();
    await finishInitial();
    throw error;
  }
}
