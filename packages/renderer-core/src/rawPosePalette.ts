import type { ClipSample, SoldierPlayback } from "../../crowd-runtime/src/actionTimeline";
import {
  LOCAL_ANIMATION_FLOATS_PER_JOINT,
  type LocalAnimation,
} from "../../soldier-assets/src/localAnimation";
import type { ImportedRig } from "../../soldier-assets/src/rig";
import { PlaybackPacker, PLAYBACK_WORDS } from "./playbackPacking";
import { packRigPaletteData } from "./rigPaletteData";
import { POSE_PALETTE_HELPERS_WGSL, posePaletteFunctionWgsl } from "./posePaletteWgsl";
import { assertStorageBufferFits, type GpuDeviceCaps } from "./capabilities";
import { compileShader } from "./compileShader";

/** GPU resources for one loaded rig+animation identity, shared by its mesh tiers. */
export class RawPosePalette {
  readonly upperMaskOffsets: Map<number, number>;
  readonly renderLayout: GPUBindGroupLayout;
  readonly bones: number;
  private readonly packer: PlaybackPacker;
  private readonly owned = new Set<GPUBuffer>();
  private readonly computeLayout: GPUBindGroupLayout;
  private readonly pipeline: GPUComputePipeline;
  private readonly staticBuffers: GPUBuffer[] = [];
  private readonly dispatchUniform: GPUBuffer;
  private readonly stepBase: number;
  private controls: GPUBuffer;
  private snapshots: GPUBuffer;
  private palette: GPUBuffer;
  private computeBinding!: GPUBindGroup;
  private renderBinding!: GPUBindGroup;
  private count = 0;
  private disposed = false;
  private snapshotUploadBytes = 0;
  private peakPaletteBytes = 0;
  private peakSnapshotBytes = 0;

  constructor(
    private readonly device: GPUDevice,
    private readonly caps: GpuDeviceCaps,
    rig: ImportedRig,
    readonly animation: LocalAnimation,
    appearances: Parameters<typeof packRigPaletteData>[2],
    private readonly label: string,
    renderLayout?: GPUBindGroupLayout,
  ) {
    this.bones = rig.bones.length;
    this.packer = new PlaybackPacker(rig, animation);
    const data = packRigPaletteData(rig, animation, appearances);
    this.upperMaskOffsets = data.upperMaskOffsets;
    this.stepBase = data.stepBase;
    try {
      this.computeLayout = device.createBindGroupLayout({
        label: `${label}-compute-layout`,
        entries: [
          ...Array.from({ length: 6 }, (_, binding) => ({
            binding,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: binding === 5 ? ("storage" as const) : ("read-only-storage" as const) },
          })),
          { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        ],
      });
      this.renderLayout =
        renderLayout ??
        device.createBindGroupLayout({
          label: `${label}-render-layout`,
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.VERTEX,
              buffer: { type: "read-only-storage" },
            },
          ],
        });
      for (const [name, values] of [
        ["samples", animation.data],
        ["metadata", data.metadata],
        ["inverse-bind", data.inverseBinds],
      ] as const) {
        const buffer = this.allocate(name, values.byteLength);
        this.staticBuffers.push(buffer);
        device.queue.writeBuffer(buffer, 0, values);
      }
      this.controls = this.allocate("controls", 16);
      this.snapshots = this.allocate("snapshots", 16);
      this.palette = this.allocate("palette", 64);
      this.dispatchUniform = this.own(
        device.createBuffer({
          label: `${label}-dispatch`,
          size: 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
      );
      const declarations = ["vec4f", "u32", "mat4x4f", "vec4u", "vec4f", "mat4x4f"]
        .map(
          (type, binding) =>
            `@group(0) @binding(${binding}) var<storage, ${binding === 5 ? "read_write" : "read"}> data${binding}: array<${type}>;`,
        )
        .join("\n");
      const module = compileShader(
        device,
        `${declarations}
@group(0) @binding(6) var<uniform> dispatch: vec4u;
${POSE_PALETTE_HELPERS_WGSL}
${posePaletteFunctionWgsl(this.bones)}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  preparePosePalette(&data0, &data1, &data2, &data3, &data4, &data5, id.x, dispatch.x, dispatch.y);
}`,
        `${label}-compute`,
      );
      this.pipeline = device.createComputePipeline({
        label: `${label}-compute`,
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.computeLayout] }),
        compute: { module, entryPoint: "main" },
      });
      const bindings = this.makeBindings(this.controls, this.snapshots, this.palette);
      this.computeBinding = bindings.compute;
      this.renderBinding = bindings.render;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get bindGroup(): GPUBindGroup {
    this.assertLive();
    return this.renderBinding;
  }

  upload(
    count: number,
    playbackAt: (index: number) => SoldierPlayback | ClipSample,
    appearanceAt: (index: number) => number,
  ): void {
    this.assertLive();
    if (
      !Number.isInteger(count) ||
      count < 0 ||
      count > 0xffffff ||
      Math.ceil(count / 64) > this.device.limits.maxComputeWorkgroupsPerDimension
    )
      throw new Error(
        `${this.label} instance count exceeds exact palette indexing or device dispatch limit`,
      );
    // Reject impossible GPU work before allocating the corresponding CPU controls.
    this.checkSize(count * PLAYBACK_WORDS * 4, "controls");
    this.checkSize(count * this.bones * 64, "palette");
    const maskAt = (index: number) => {
      const id = appearanceAt(index),
        offset = this.upperMaskOffsets.get(id);
      if (offset === undefined)
        throw new Error(`${this.label} appearance ${id} is not in its rig group`);
      return offset;
    };
    let frame = this.packer.prepare(count, playbackAt, maskAt);
    const replacements: GPUBuffer[] = [];
    const grow = (buffer: GPUBuffer, name: string, bytes: number) => {
      if (bytes <= buffer.size) return buffer;
      const limit = Math.min(this.caps.maxStorageBufferBindingSize, this.caps.maxBufferSize);
      const capacity = Math.min(Math.max(bytes, buffer.size * 2, 128), Math.floor(limit / 16) * 16);
      this.checkSize(bytes, name);
      const next = this.allocate(name, capacity);
      replacements.push(next);
      return next;
    };
    try {
      const controls = grow(this.controls, "controls", count * PLAYBACK_WORDS * 4);
      const palette = grow(this.palette, "palette", count * this.bones * 64);
      const snapshots = grow(
        this.snapshots,
        "snapshots",
        frame.requiredSnapshotSlots * this.bones * LOCAL_ANIMATION_FLOATS_PER_JOINT * 4,
      );
      if (snapshots !== this.snapshots) {
        // A new allocation contains no old identities. Repack the active sources
        // once on growth; stable frames still upload only newly resident sources.
        this.packer.reset();
        frame = this.packer.prepare(count, playbackAt, maskAt);
      }
      const bindings = replacements.length
        ? this.makeBindings(controls, snapshots, palette)
        : { compute: this.computeBinding, render: this.renderBinding };
      if (frame.controls.byteLength) this.device.queue.writeBuffer(controls, 0, frame.controls);
      for (const upload of frame.uploads)
        this.device.queue.writeBuffer(
          snapshots,
          upload.slot * this.bones * LOCAL_ANIMATION_FLOATS_PER_JOINT * 4,
          upload.data,
        );
      this.device.queue.writeBuffer(
        this.dispatchUniform,
        0,
        new Uint32Array([count, this.stepBase, 0, 0]),
      );
      this.packer.commitPrepared(frame);
      for (const [old, next] of [
        [this.controls, controls],
        [this.snapshots, snapshots],
        [this.palette, palette],
      ])
        if (old !== next) {
          old.destroy();
          this.owned.delete(old);
        }
      this.controls = controls;
      this.snapshots = snapshots;
      this.palette = palette;
      this.computeBinding = bindings.compute;
      this.renderBinding = bindings.render;
      this.count = count;
      this.snapshotUploadBytes = frame.uploads.reduce(
        (total, upload) => total + upload.data.byteLength,
        0,
      );
      this.peakPaletteBytes = Math.max(this.peakPaletteBytes, palette.size);
      this.peakSnapshotBytes = Math.max(this.peakSnapshotBytes, snapshots.size);
    } catch (error) {
      this.packer.discardPrepared(frame);
      for (const buffer of replacements) {
        buffer.destroy();
        this.owned.delete(buffer);
      }
      throw error;
    }
  }

  precompute(encoder: GPUCommandEncoder): void {
    this.assertLive();
    if (!this.count) return;
    const pass = encoder.beginComputePass({ label: `${this.label}-prepare` });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.computeBinding);
    pass.dispatchWorkgroups(Math.ceil(this.count / 64));
    pass.end();
  }

  stats() {
    return {
      instances: this.count,
      residentSnapshots: this.packer.residentSnapshotCount,
      snapshotUploadBytes: this.snapshotUploadBytes,
      paletteBytes: this.palette.size,
      snapshotBytes: this.snapshots.size,
      controlBytes: this.controls.size,
      peakPaletteBytes: this.peakPaletteBytes,
      peakSnapshotBytes: this.peakSnapshotBytes,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.packer.reset();
    for (const buffer of this.owned) buffer.destroy();
    this.owned.clear();
  }

  private makeBindings(controls: GPUBuffer, snapshots: GPUBuffer, palette: GPUBuffer) {
    return {
      compute: this.device.createBindGroup({
        label: `${this.label}-compute-binding`,
        layout: this.computeLayout,
        entries: [...this.staticBuffers, controls, snapshots, palette, this.dispatchUniform].map(
          (buffer, binding) => ({ binding, resource: { buffer } }),
        ),
      }),
      render: this.device.createBindGroup({
        label: `${this.label}-render-binding`,
        layout: this.renderLayout,
        entries: [{ binding: 0, resource: { buffer: palette } }],
      }),
    };
  }
  private checkSize(bytes: number, name: string) {
    assertStorageBufferFits(bytes, this.caps, `${this.label}-${name}`);
    if (bytes > this.caps.maxBufferSize)
      throw new Error(`${this.label}-${name} exceeds maxBufferSize`);
  }
  private allocate(name: string, bytes: number) {
    const size = Math.max(16, Math.ceil(bytes / 16) * 16);
    this.checkSize(size, name);
    return this.own(
      this.device.createBuffer({
        label: `${this.label}-${name}`,
        size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    );
  }
  private own(buffer: GPUBuffer) {
    this.owned.add(buffer);
    return buffer;
  }
  private assertLive() {
    if (this.disposed) throw new Error(`${this.label} is disposed`);
  }
}
