import { beginGpuAdmission } from "../../src/gpuAdmission";
import { tgpu, d } from "typegpu";
import type { ImportedRig } from "../../../../packages/soldier-assets/src/rig";
import type { LocalAnimation } from "../../../../packages/soldier-assets/src/localAnimation";
import {
  snapshotBank,
  snapshotBankFloatOffset,
} from "../../../../packages/renderer-core/src/posePaletteStorage";
import { PoseUpload } from "../../src/poseUpload";
import { typegpuPoseKernel } from "./poseKernel";
const layout = tgpu.bindGroupLayout({
  samples: { storage: d.arrayOf(d.vec4f) },
  metadata: { storage: d.arrayOf(d.u32) },
  inverseBinds: { storage: d.arrayOf(d.mat4x4f) },
  controls: { storage: d.arrayOf(d.vec4u) },
  snapshots0: { storage: d.arrayOf(d.vec4f) },
  snapshots1: { storage: d.arrayOf(d.vec4f) },
  palettes: { storage: d.arrayOf(d.mat4x4f), access: "mutable" },
  dispatch: { uniform: d.vec4u },
});
export const typegpuPaletteLayout = tgpu
  .bindGroupLayout({ palette: { storage: d.arrayOf(d.mat4x4f) } })
  .$idx(1);
export async function createTypegpuPosePalette(
  device: GPUDevice,
  rig: ImportedRig,
  animation: LocalAnimation,
  appearances: ConstructorParameters<typeof PoseUpload>[2],
) {
  const state = new PoseUpload(rig, animation, appearances, device.limits),
    root = tgpu.initFromDevice({ device });
  const owned = new Set<{ destroy(): void }>();
  let disposed = false;
  const own = <T extends { destroy(): void }>(x: T) => {
    owned.add(x);
    return x;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    state.packer.reset();
    for (const b of owned) b.destroy();
    root.destroy();
  };
  const assertLive = () => {
    if (disposed) throw new Error("TypeGPU pose is disposed");
  };
  const vector = (bytes: number) =>
    own(root.createBuffer(d.arrayOf(d.vec4f, bytes / 16)).$usage("storage"));
  const controlsBuffer = (bytes: number) =>
    own(root.createBuffer(d.arrayOf(d.vec4u, bytes / 16)).$usage("storage"));
  const paletteBuffer = (bytes: number) =>
    own(root.createBuffer(d.arrayOf(d.mat4x4f, bytes / 64)).$usage("storage"));
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
    for (const a of [animation.data, state.staticData.metadata, state.staticData.inverseBinds])
      state.check(a.byteLength);
    const samples = vector(animation.data.byteLength),
      metadata = own(
        root.createBuffer(d.arrayOf(d.u32, state.staticData.metadata.length)).$usage("storage"),
      ),
      inverseBinds = paletteBuffer(state.staticData.inverseBinds.byteLength);
    samples.write(animation.data.slice().buffer);
    metadata.write(state.staticData.metadata.buffer);
    inverseBinds.write(state.staticData.inverseBinds.buffer);
    let controls = controlsBuffer(16),
      snapshots = [vector(16), vector(16)],
      palette = paletteBuffer(64);
    const dispatch = own(root.createBuffer(d.vec4u).$usage("uniform"));
    const bindings = () =>
      root.createBindGroup(layout, {
        samples,
        metadata,
        inverseBinds,
        controls,
        snapshots0: snapshots[0],
        snapshots1: snapshots[1],
        palettes: palette,
        dispatch,
      });
    let group = bindings(),
      renderGroup = root.createBindGroup(typegpuPaletteLayout, { palette });
    const kernel = typegpuPoseKernel(state.bones);
    const entry = tgpu
      .computeFn({ workgroupSize: [64], in: { id: d.builtin.globalInvocationId } })(
        `{ prepare(&resources.samples,&resources.metadata,&resources.inverseBinds,&resources.controls,&resources.snapshots0,&resources.snapshots1,&resources.palettes,in.id.x,resources.dispatch.x,resources.dispatch.y); }`,
      )
      .$uses({ prepare: kernel, resources: layout.$ });
    const pipeline = root.createComputePipeline({ compute: entry });
    await pipeline.initAsync();
    await admission();
    return {
      get buffer() {
        assertLive();
        return palette;
      },
      get bindGroup() {
        assertLive();
        return renderGroup;
      },
      get bones() {
        return state.bones;
      },
      async upload(...args: Parameters<PoseUpload["prepare"]>) {
        assertLive();
        const plan = state.prepare(...args);
        const prior = [controls, ...snapshots, palette];
        const added: { destroy(): void }[] = [];
        const finishGrowth = plan.sizes.some((n, i) => n !== state.sizes[i])
          ? beginGpuAdmission(device)
          : undefined;
        try {
          const next = plan.sizes.map((size, i) => {
            if (size === state.sizes[i]) return prior[i];
            const b = i === 0 ? controlsBuffer(size) : i === 3 ? paletteBuffer(size) : vector(size);
            added.push(b);
            return b;
          });
          // Each slot retains its concrete schema; heterogeneous list only drives resource lifetime.
          const nextControls = next[0] as typeof controls,
            nextSnapshots = [next[1], next[2]] as typeof snapshots,
            nextPalette = next[3] as typeof palette;
          const nextGroup = added.length
            ? root.createBindGroup(layout, {
                samples,
                metadata,
                inverseBinds,
                controls: nextControls,
                snapshots0: nextSnapshots[0],
                snapshots1: nextSnapshots[1],
                palettes: nextPalette,
                dispatch,
              })
            : group;
          const nextRender = added.length
            ? root.createBindGroup(typegpuPaletteLayout, { palette: nextPalette })
            : renderGroup;
          if (finishGrowth) {
            root.unwrap(nextGroup);
            root.unwrap(nextRender);
          }
          if (plan.frame.controls.byteLength)
            nextControls.write(plan.frame.controls.slice().buffer);
          for (const u of plan.frame.uploads)
            nextSnapshots[snapshotBank(u.slot)].write(u.data.slice().buffer, {
              startOffset: snapshotBankFloatOffset(u.slot, state.bones) * 4,
            });
          dispatch.write(plan.dispatch.buffer);
          if (finishGrowth) await finishGrowth();
          assertLive();
          state.commit(plan);
          for (let i = 0; i < prior.length; i++)
            if (prior[i] !== next[i]) {
              prior[i].destroy();
              owned.delete(prior[i]);
            }
          controls = nextControls;
          snapshots = nextSnapshots;
          palette = nextPalette;
          group = nextGroup;
          renderGroup = nextRender;
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
          for (const b of added) {
            b.destroy();
            owned.delete(b);
          }
          throw failure;
        }
      },
      precompute(encoder: GPUCommandEncoder) {
        assertLive();
        if (state.count)
          pipeline
            .with(group)
            .with(encoder)
            .dispatchWorkgroups(Math.ceil(state.count / 64));
      },
      async read() {
        assertLive();
        return Float32Array.from((await palette.read()).flatMap((m) => Array.from(m)));
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
