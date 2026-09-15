import {
  compute,
  draw,
  geometry,
  storage,
  type Gpu,
  type FramePass,
  type StorageBuffer,
} from "vgpu";
import { beginGpuAdmission } from "../gpuAdmission";
import { grassUniformData, type GrassFrame, type GrassGeometry } from "../grassData";
import { grassRoutingShader, grassDrawShader } from "../shaders/grassPasses";
import { destroyVgpuStorage } from "./storageLifetime";
import type { VgpuEnvironment } from "./environment";
// Keep ordinary borrowed ArrayBuffer views zero-copy; vgpu excludes SharedArrayBuffer uploads.
function upload(v: Float32Array): Float32Array<ArrayBuffer> {
  return v.buffer instanceof ArrayBuffer
    ? new Float32Array(v.buffer, v.byteOffset, v.length)
    : v.slice();
}
/** vgpu public dispatch submits reset and route separately. Caller renders a later Frame on the same context. */
export async function createVgpuGrass(
  gpu: Gpu,
  camera: ReturnType<Gpu["device"]["createBuffer"]>,
  environment: VgpuEnvironment,
  tiers: readonly GrassGeometry[],
  samples: 1 | 4 = 1,
) {
  if (tiers.length !== 3) throw Error("Grass requires all three tiers");
  const owned = new Set<StorageBuffer>(),
    other: { destroy(): void }[] = [];
  let disposed = false,
    count = 0,
    capacity = 1;
  const check = () => {
    if (disposed) throw Error("vgpu grass disposed");
  };
  const alloc = (size: number, indirect = false) => {
    const b = storage(gpu, size, { indirect });
    owned.add(b);
    return b;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const b of owned) destroyVgpuStorage(b);
    for (const r of other) r.destroy();
  };
  const native = gpu.device.gpu;
  const admit = beginGpuAdmission(native);
  try {
    const params = gpu.device.createBuffer({ size: 224, usage: ["uniform", "copy_dst"] }),
      active = gpu.device.createBuffer({ size: 16, usage: ["uniform", "copy_dst"] });
    other.push(params, active);
    active.write(new Uint32Array(4));
    const commands = alloc(60, true);
    const allocate = (n: number) => {
      const added: StorageBuffer[] = [];
      try {
        const records = alloc(n * 64);
        added.push(records);
        const visible = Array.from({ length: 3 }, () => {
          const b = alloc(n * 4);
          added.push(b);
          return b;
        });
        return { records, visible, added };
      } catch (error) {
        for (const b of added) {
          destroyVgpuStorage(b);
          owned.delete(b);
        }
        throw error;
      }
    };
    let buffers = allocate(1);
    const routeShader = grassRoutingShader(tiers.map((t) => t.indices.length));
    const reset = compute(gpu, routeShader, { entry: "reset" }),
      route = compute(gpu, routeShader, { entry: "route" });
    const routingSet = (b: typeof buffers) => ({
      records: b.records,
      params,
      commands,
      nearList: b.visible[0],
      midList: b.visible[1],
      farList: b.visible[2],
      activeCount: active,
    });
    const meshes = tiers.map((t) => {
      const g = geometry(gpu, {
        buffers: [
          { data: new Float32Array(t.positions), stride: 12, attributes: { local: "float32x3" } },
        ],
        indices: new Uint16Array(t.indices),
      });
      other.push(g);
      return g;
    });
    const shader = grassDrawShader(environment.shader, 1, 2);
    const beauty = meshes.map((mesh) =>
      draw(gpu, {
        shader,
        geometry: mesh,
        entry: { vertex: "vertex", fragment: "beauty" },
        cull: "none",
        depth: { write: true, compare: "greater-equal" },
      }),
    );
    const prepass = meshes.map((mesh) =>
      draw(gpu, {
        shader,
        geometry: mesh,
        entry: { vertex: "vertex", fragment: "depth" },
        writeMask: [],
        cull: "none",
        depth: { write: true, compare: "greater-equal" },
      }),
    );
    const bind = (b: typeof buffers) => {
      reset.set(routingSet(b));
      route.set(routingSet(b));
      for (let i = 0; i < 3; i++) {
        const set = {
          cam: camera,
          records: b.records,
          visible: b.visible[i],
          grass: params,
          ...environment.bindings,
        };
        beauty[i].set(set);
        prepass[i].set(set);
      }
    };
    bind(buffers);
    await Promise.all(
      [...beauty, ...prepass].map((p) =>
        p.compile({ colors: ["rgba16float"], depth: "depth32float", sampleCount: samples }),
      ),
    );
    // Public compute has no compile-only operation; empty admission dispatch initializes both pipelines.
    reset.dispatch(1);
    route.dispatch(1);
    await admit();
    return {
      async updateRecords(next: Float32Array) {
        check();
        if (next.length % 16) throw Error("Grass expects complete records");
        if (
          next.byteLength > native.limits.maxStorageBufferBindingSize ||
          next.byteLength > native.limits.maxBufferSize
        )
          throw Error("Grass storage limit");
        const n = next.length / 16;
        if (n > capacity) {
          const finish = beginGpuAdmission(native);
          let staged: typeof buffers | undefined;
          try {
            staged = allocate(n);
            staged.records.write(upload(next));
            bind(staged);
            await finish();
            check();
          } catch (error) {
            try {
              await finish();
            } finally {
              if (!disposed) bind(buffers);
              if (staged)
                for (const b of staged.added) {
                  destroyVgpuStorage(b);
                  owned.delete(b);
                }
            }
            throw error;
          }
          for (const b of buffers.added) {
            destroyVgpuStorage(b);
            owned.delete(b);
          }
          buffers = staged;
          capacity = n;
        } else if (n) buffers.records.write(upload(next));
        count = n;
        active.write(new Uint32Array([n, 0, 0, 0]));
      },
      update(frame: GrassFrame) {
        check();
        params.write(grassUniformData(frame));
      },
      route(_encoder: undefined) {
        check();
        reset.dispatch(1);
        if (count) route.dispatch(Math.ceil(count / 64));
      },
      draw(
        pass: FramePass,
        _camera: undefined,
        depthPrepass = false,
        farVisible = true,
        stage: "combined" | "depth" | "beauty" = "combined",
        onlyTier?: number,
      ) {
        check();
        if (depthPrepass && stage !== "beauty")
          for (let i = 0; i < 2; i++)
            if (onlyTier === undefined || onlyTier === i)
              pass.draw(prepass[i], { indirect: { buffer: commands, offset: i * 20 } });
        if (stage !== "depth")
          for (let i = 0; i < (farVisible ? 3 : 2); i++)
            if (onlyTier === undefined || onlyTier === i)
              pass.draw(beauty[i], { indirect: { buffer: commands, offset: i * 20 } });
      },
      stats: () => ({
        recordCount: count,
        capacity,
        pipelineBuilds: 8,
        pipelineMetric:
          "2 compute handles and 6 draw compile requests; cache may share GPU pipelines",
      }),
      readRouting: async () => ({
        commands: new Uint32Array(await commands.read()),
        visible: await Promise.all(
          buffers.visible.map(async (b) => new Uint32Array(await b.read())),
        ),
      }),
      dispose,
    };
  } catch (error) {
    try {
      await admit();
    } finally {
      dispose();
    }
    throw error;
  }
}
