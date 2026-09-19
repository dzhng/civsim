import { beginGpuAdmission } from "../../../../packages/battle-renderer/src/gpuAdmission";
import { compute, initFromDevice, type Gpu } from "vgpu";
import type { ImportedRig } from "../../../../packages/soldier-assets/src/rig";
import type { LocalAnimation } from "../../../../packages/soldier-assets/src/localAnimation";
import {
  POSE_PALETTE_HELPERS_WGSL,
  posePaletteFunctionWgsl,
} from "../../../../packages/renderer-core/src/posePaletteWgsl";
import {
  POSE_PALETTE_STORAGE_TYPES,
  snapshotBank,
  snapshotBankFloatOffset,
} from "../../../../packages/renderer-core/src/posePaletteStorage";
import { PoseUpload } from "../poseUpload";
/** Public vgpu dispatch owns a separate submission per rig; callers order it before render Frames. */
export async function createVgpuPosePalette(
  device: GPUDevice,
  rig: ImportedRig,
  animation: LocalAnimation,
  appearances: ConstructorParameters<typeof PoseUpload>[2],
) {
  const state = new PoseUpload(rig, animation, appearances, device.limits),
    gpu = await initFromDevice(device);
  const owned = new Set<ReturnType<Gpu["device"]["createBuffer"]>>();
  let disposed = false;
  const alloc = (size: number, uniform = false) => {
    state.check(size);
    const b = gpu.device.createBuffer({
      size,
      usage: uniform ? ["uniform", "copy_dst"] : ["storage", "copy_dst", "copy_src"],
    });
    owned.add(b);
    return b;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    state.packer.reset();
    for (const b of owned) b.destroy();
    gpu.dispose();
  };
  const assertLive = () => {
    if (disposed) throw new Error("vgpu pose is disposed");
  };
  let scopesOpen = true;
  device.pushErrorScope("out-of-memory");
  device.pushErrorScope("internal");
  device.pushErrorScope("validation");
  const admission = async () => {
    scopesOpen = false;
    const errors = await Promise.all([
      device.popErrorScope(),
      device.popErrorScope(),
      device.popErrorScope(),
    ]);
    const failure = errors.find(Boolean);
    if (failure) throw new Error(failure.message);
  };
  try {
    const fixed = [animation.data, state.staticData.metadata, state.staticData.inverseBinds].map(
      (a) => {
        const b = alloc(a.byteLength);
        b.write(a.slice());
        return b;
      },
    );
    let buffers = state.sizes.map((n) => alloc(n));
    const dispatch = alloc(16, true);
    const shader =
      POSE_PALETTE_STORAGE_TYPES.map(
        (type, i) =>
          `@group(0) @binding(${i}) var<storage,${i === 6 ? "read_write" : "read"}> data${i}:array<${type}>;`,
      ).join("\n") +
      `
@group(0) @binding(7) var<uniform> dispatch:vec4u;
${POSE_PALETTE_HELPERS_WGSL}
${posePaletteFunctionWgsl(state.bones)}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){ preparePosePalette(&data0,&data1,&data2,&data3,&data4,&data5,&data6,id.x,dispatch.x,dispatch.y); }`;
    const kernel = compute(gpu, shader, { label: "vgpu authored pose" });
    const bindings = (dynamic: typeof buffers) =>
      Object.fromEntries(
        [...fixed, ...dynamic, dispatch].map((b, i) => [i === 7 ? "dispatch" : `data${i}`, b]),
      );
    kernel.set(bindings(buffers));
    await admission();
    return {
      get buffer() {
        assertLive();
        return buffers[3];
      },
      get bones() {
        return state.bones;
      },
      async upload(...args: Parameters<PoseUpload["prepare"]>) {
        assertLive();
        const plan = state.prepare(...args),
          added: typeof buffers = [];
        const finishGrowth = plan.sizes.some((n, i) => n !== state.sizes[i])
          ? beginGpuAdmission(device)
          : undefined;
        try {
          const next = plan.sizes.map((n, i) => {
            if (n === state.sizes[i]) return buffers[i];
            const b = alloc(n);
            added.push(b);
            return b;
          });
          kernel.set(bindings(next));
          if (plan.frame.controls.byteLength) next[0].write(plan.frame.controls.slice());
          for (const u of plan.frame.uploads)
            next[1 + snapshotBank(u.slot)].write(
              u.data.slice(),
              snapshotBankFloatOffset(u.slot, state.bones) * 4,
            );
          dispatch.write(plan.dispatch);
          if (finishGrowth) await finishGrowth();
          assertLive();
          state.commit(plan);
          for (let i = 0; i < buffers.length; i++)
            if (buffers[i] !== next[i]) {
              buffers[i].destroy();
              owned.delete(buffers[i]);
            }
          buffers = next;
        } catch (error) {
          let failure = error;
          if (finishGrowth)
            try {
              await finishGrowth();
            } catch (admissionError) {
              if (admissionError !== error)
                failure = new AggregateError(
                  [error, admissionError],
                  "Pose growth admission failed",
                );
            }
          state.discard(plan);
          kernel.set(bindings(buffers));
          for (const b of added) {
            b.destroy();
            owned.delete(b);
          }
          throw failure;
        }
      },
      precompute() {
        assertLive();
        if (state.count) kernel.dispatch(Math.ceil(state.count / 64));
      },
      async read() {
        assertLive();
        return new Float32Array(await buffers[3].read(state.sizes[3]));
      },
      stats: () => state.stats(),
      dispose,
    };
  } catch (error) {
    dispose();
    if (scopesOpen) await admission();
    throw error;
  }
}
