import * as THREE from "three/webgpu";
import { Fn, instanceIndex, nodeObject, storage, uint, uniform, wgsl, wgslFn } from "three/tsl";
import type { ClipSample, SoldierPlayback } from "../../../crowd-runtime/src/actionTimeline";
import { PlaybackPacker, PLAYBACK_WORDS } from "../../../renderer-core/src/playbackPacking";
import { packRigPaletteData } from "../../../renderer-core/src/rigPaletteData";
import {
  POSE_PALETTE_HELPERS_WGSL,
  posePaletteFunctionWgsl,
} from "../../../renderer-core/src/posePaletteWgsl";
import type { ImportedRig } from "../../../soldier-assets/src/rig";
import type { LocalAnimation } from "../../../soldier-assets/src/localAnimation";
import {
  growSnapshotBankCapacity,
  POSE_PALETTE_STORAGE_TYPES,
  SNAPSHOT_BANK_COUNT,
  snapshotBank,
  snapshotBankFloatOffset,
} from "../../../renderer-core/src/posePaletteStorage";

/** Pinned Three drops an appended native function expression when built as void.
 * Keep this side-effect call as a statement; the child field retains node traversal. */
class PaletteStatement extends THREE.Node {
  constructor(readonly call: THREE.Node) {
    super("void");
  }
  generate(builder: Parameters<THREE.Node["build"]>[0]): string {
    // Implemented by pinned NodeBuilder, omitted by its published type package.
    const statements = builder as unknown as {
      addLineFlowCode(code: string, node: THREE.Node): void;
    };
    const code = this.call.build(builder);
    if (typeof code !== "string") throw new Error("Palette kernel did not build a statement");
    statements.addLineFlowCode(code, this);
    return "";
  }
}

export type PaletteColumns = ReturnType<typeof paletteColumns>;
function paletteColumns(attribute: THREE.StorageBufferAttribute) {
  return storage(attribute, "vec4", attribute.array.length / 4).toReadOnly();
}

/** Compute-only attributes have no geometry owner in pinned Three. Retiring a
 * buffer is terminal for its bindings: dispose all compute/material consumers first. */
function releaseStorage(
  renderer: THREE.WebGPURenderer,
  attributes: THREE.StorageBufferAttribute[],
) {
  const cache = (
    renderer as unknown as {
      _attributes: {
        data: WeakMap<THREE.StorageBufferAttribute, { version?: number }>;
        delete(attribute: THREE.StorageBufferAttribute): void;
      };
    }
  )._attributes;
  const backend = renderer.backend as unknown as {
    data: WeakMap<THREE.StorageBufferAttribute, { buffer?: GPUBuffer }>;
    delete(attribute: THREE.StorageBufferAttribute): void;
  };
  for (const attribute of attributes) {
    if (cache.data.get(attribute)?.version === undefined) {
      // Attributes.update creates this record BEFORE allocation/accounting.
      // Its normal delete path assumes both succeeded and dereferences buffer.
      backend.data.get(attribute)?.buffer?.destroy();
      backend.delete(attribute);
      cache.data.delete(attribute);
      // Info owns a separate memoryMap guard, so this also balances the narrow
      // post-accounting/pre-version boundary without decrementing absent entries.
      (
        renderer.info as unknown as { destroyAttribute(attribute: THREE.BufferAttribute): void }
      ).destroyAttribute(attribute);
    } else cache.delete(attribute);
  }
}

interface DynamicPalette {
  capacity: number;
  snapshotBankCapacity: number;
  controls: THREE.StorageBufferAttribute;
  snapshots: THREE.StorageBufferAttribute[];
  output: THREE.StorageBufferAttribute;
  columns: PaletteColumns;
  compute: THREE.ComputeNode;
}

/** One palette generation per shared loaded rig+animation, not per appearance/tier. */
export class SoldierPosePalette {
  readonly metadata: ReturnType<typeof packRigPaletteData>;
  private readonly packer: PlaybackPacker;
  private readonly staticAttributes: THREE.StorageBufferAttribute[];
  private readonly count = uniform(0, "uint");
  private dynamic?: DynamicPalette;
  private controlStorage = new Uint32Array(0);
  private uploadedBytes = 0;
  private snapshotUploadedBytes = 0;
  private snapshotSlotHighWater = 0;
  private visible = 0;
  private disposed = false;

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    readonly rig: ImportedRig,
    readonly animation: LocalAnimation,
    appearances: Parameters<typeof packRigPaletteData>[2],
  ) {
    const device = (renderer.backend as unknown as { device: GPUDevice }).device;
    if (device.limits.maxStorageBuffersPerShaderStage < POSE_PALETTE_STORAGE_TYPES.length)
      throw new Error(
        `Soldier palette requires ${POSE_PALETTE_STORAGE_TYPES.length} storage buffers per compute stage`,
      );
    this.metadata = packRigPaletteData(rig, animation, appearances);
    this.packer = new PlaybackPacker(rig, animation);
    this.staticAttributes = [
      new THREE.StorageBufferAttribute(animation.data, 4),
      new THREE.StorageBufferAttribute(this.metadata.metadata, 1),
      new THREE.StorageBufferAttribute(this.metadata.inverseBinds, 16),
    ];
    this.staticAttributes.forEach((attribute, index) => {
      attribute.name = `soldier-palette-${["samples", "metadata", "inverse-binds"][index]}`;
    });
    for (const attribute of this.staticAttributes) this.checkSize(attribute.array.byteLength);
  }

  private checkSize(bytes: number): void {
    const device = (this.renderer.backend as unknown as { device: GPUDevice }).device;
    const limit = Math.min(device.limits.maxBufferSize, device.limits.maxStorageBufferBindingSize);
    if (!Number.isSafeInteger(bytes) || bytes < 4 || bytes > limit)
      throw new Error(`Soldier palette storage requires ${bytes} bytes; device limit is ${limit}`);
  }

  get columns(): PaletteColumns {
    if (!this.dynamic) throw new Error("Soldier palette has not been prepared");
    return this.dynamic.columns;
  }

  /** Initial/reload allocation and pipeline admission, before exposing consumers. */
  async initialize(sample: ClipSample): Promise<void> {
    const device = (this.renderer.backend as unknown as { device: GPUDevice }).device;
    device.pushErrorScope("out-of-memory");
    device.pushErrorScope("internal");
    device.pushErrorScope("validation");
    let failed = false,
      error: unknown;
    try {
      this.upload(
        1,
        () => sample,
        () => 0,
        () => {},
      );
    } catch (caught) {
      failed = true;
      error = caught;
    }
    const admission = await Promise.allSettled([
      device.popErrorScope(),
      device.popErrorScope(),
      device.popErrorScope(),
    ]);
    const failures = admission.flatMap((result) =>
      result.status === "rejected"
        ? [String(result.reason)]
        : result.value
          ? [result.value.message]
          : [],
    );
    if (failed || failures.length) {
      this.dispose();
      if (failed) throw error;
      throw new Error(`Soldier palette GPU admission failed: ${failures.join("; ")}`);
    }
  }

  private allocate(capacity: number, snapshotBankCapacity: number): DynamicPalette {
    const bones = this.animation.bones;
    for (const bytes of [
      capacity * PLAYBACK_WORDS * 4,
      snapshotBankCapacity * bones * 48,
      capacity * bones * 64,
    ])
      this.checkSize(bytes);
    const controls = new THREE.StorageBufferAttribute(
      new Uint32Array(capacity * PLAYBACK_WORDS),
      4,
    );
    const snapshots = Array.from({ length: SNAPSHOT_BANK_COUNT }, (_, bank) => {
      const attribute = new THREE.StorageBufferAttribute(
        new Float32Array(snapshotBankCapacity * bones * 12),
        4,
      );
      attribute.name = `soldier-palette-snapshots-${bank}`;
      return attribute;
    });
    const output = new THREE.StorageBufferAttribute(new Float32Array(capacity * bones * 16), 16);
    controls.name = "soldier-palette-controls";
    output.name = "soldier-palette-output";
    const samplesNode = storage(
      this.staticAttributes[0],
      "vec4",
      this.staticAttributes[0].count,
    ).toReadOnly();
    const metadataNode = storage(
      this.staticAttributes[1],
      "uint",
      this.staticAttributes[1].count,
    ).toReadOnly();
    const inverseNode = storage(
      this.staticAttributes[2],
      "mat4",
      this.staticAttributes[2].count,
    ).toReadOnly();
    const controlsNode = storage(controls, "uvec4", controls.count).toReadOnly();
    const snapshotsNodes = snapshots.map((attribute) =>
      storage(attribute, "vec4", attribute.count).toReadOnly(),
    );
    const outputNode = storage(output, "mat4", output.count);
    const kernel = wgslFn(posePaletteFunctionWgsl(bones), [wgsl(POSE_PALETTE_HELPERS_WGSL)]);
    const compute = Fn(() => {
      nodeObject(
        new PaletteStatement(
          kernel({
            samples: samplesNode,
            metadata: metadataNode,
            inverseBinds: inverseNode,
            controls: controlsNode,
            snapshots0: snapshotsNodes[0],
            snapshots1: snapshotsNodes[1],
            palettes: outputNode,
            instance: instanceIndex,
            count: this.count,
            stepBase: uint(this.metadata.stepBase),
          }),
        ),
      ).toStack();
    })().compute(1, [64]);
    return {
      capacity,
      snapshotBankCapacity,
      controls,
      snapshots,
      output,
      columns: paletteColumns(output),
      compute,
    };
  }

  /** Stable indexed inputs from the culling worklist; no controller advancement.
   * Rebind replaces/disposes every old reading material before old storage is released. */
  upload(
    count: number,
    playbackAt: (index: number) => SoldierPlayback | ClipSample,
    maskAt: (index: number) => number,
    rebind: (columns: PaletteColumns) => void,
  ): void {
    if (this.disposed) throw new Error("Soldier palette is disposed");
    const device = (this.renderer.backend as unknown as { device: GPUDevice }).device;
    if (count > device.limits.maxComputeWorkgroupsPerDimension * 64)
      throw new Error("Soldier palette exceeds the device one-dimensional dispatch limit");
    if (count > 0) {
      this.checkSize(count * PLAYBACK_WORDS * 4);
      this.checkSize(count * this.animation.bones * 64);
    }
    this.visible = count;
    this.uploadedBytes = 0;
    this.snapshotUploadedBytes = 0;
    // Keep preparation separate from resident attributes until it succeeds.
    // Storage grows with the largest submitted worklist, never animation history.
    if (this.controlStorage.length < count * PLAYBACK_WORDS)
      this.controlStorage = new Uint32Array(count * PLAYBACK_WORDS);
    let prepared = this.packer.prepare(count, playbackAt, maskAt, this.controlStorage);
    if (count === 0) {
      this.packer.commitPrepared(prepared);
      return;
    }
    const old = this.dynamic;
    let active = old;
    try {
      if (
        !active ||
        count > active.capacity ||
        prepared.requiredSnapshotSlots > active.snapshotBankCapacity * SNAPSHOT_BANK_COUNT
      ) {
        const limit = Math.min(
          device.limits.maxBufferSize,
          device.limits.maxStorageBufferBindingSize,
        );
        const capacity =
          count > (old?.capacity ?? 0)
            ? Math.min(
                Math.max(count, (old?.capacity ?? 0) * 2, 256),
                Math.floor(limit / Math.max(PLAYBACK_WORDS * 4, this.animation.bones * 64)),
                device.limits.maxComputeWorkgroupsPerDimension * 64,
              )
            : old!.capacity;
        const snapshotBankCapacity = growSnapshotBankCapacity(
          prepared.requiredSnapshotSlots,
          old?.snapshotBankCapacity ?? 0,
          capacity,
        );
        active = this.allocate(capacity, snapshotBankCapacity);
        // Empty banks need every live source, even if only output capacity grew.
        this.packer.reset();
        prepared = this.packer.prepare(count, playbackAt, maskAt, this.controlStorage);
      }
      (active.controls.array as Uint32Array).set(prepared.controls);
      active.controls.clearUpdateRanges();
      active.controls.addUpdateRange(0, prepared.controls.length);
      active.controls.needsUpdate = true;
      for (const bank of active.snapshots) bank.clearUpdateRanges();
      for (const upload of prepared.uploads) {
        const bank = active.snapshots[snapshotBank(upload.slot)];
        const offset = snapshotBankFloatOffset(upload.slot, this.animation.bones);
        (bank.array as Float32Array).set(upload.data, offset);
        bank.addUpdateRange(offset, upload.data.length);
        this.snapshotUploadedBytes += upload.data.byteLength;
      }
      for (const bank of active.snapshots) if (bank.updateRanges.length) bank.needsUpdate = true;
      this.count.value = count;
      active.compute.count = count;
      this.renderer.compute(active.compute);
      // Queue the new generation before publishing it to materials. A failed
      // upload leaves the previous output and its consumers alive for recovery.
      if (active !== old) rebind(active.columns);
      this.packer.commitPrepared(prepared);
    } catch (error) {
      this.packer.discardPrepared(prepared);
      if (active && active !== old) {
        active.compute.dispose();
        releaseStorage(this.renderer, [active.controls, ...active.snapshots, active.output]);
      }
      throw error;
    }
    this.dynamic = active;
    if (old && active !== old) {
      old.compute.dispose();
      releaseStorage(this.renderer, [old.controls, ...old.snapshots, old.output]);
    }
    this.snapshotSlotHighWater = Math.max(
      this.snapshotSlotHighWater,
      prepared.requiredSnapshotSlots,
    );
    this.uploadedBytes = prepared.controls.byteLength + this.snapshotUploadedBytes;
  }

  stats() {
    const dynamic = this.dynamic;
    return {
      bones: this.animation.bones,
      visible: this.visible,
      capacity: dynamic?.capacity ?? 0,
      snapshotCapacity: (dynamic?.snapshotBankCapacity ?? 0) * SNAPSHOT_BANK_COUNT,
      snapshotBankCapacity: dynamic?.snapshotBankCapacity ?? 0,
      residentSnapshots: this.packer.residentSnapshotCount,
      snapshotSlotHighWater: this.snapshotSlotHighWater,
      allocatedBytes: [
        ...this.staticAttributes,
        ...(dynamic ? [dynamic.controls, ...dynamic.snapshots, dynamic.output] : []),
      ].reduce((total, attribute) => total + attribute.array.byteLength, 0),
      uploadedBytes: this.uploadedBytes,
      snapshotUploadedBytes: this.snapshotUploadedBytes,
    };
  }

  /** Caller has already disposed all palette-reading materials. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const dynamic = this.dynamic;
    dynamic?.compute.dispose();
    releaseStorage(this.renderer, [
      ...this.staticAttributes,
      ...(dynamic ? [dynamic.controls, ...dynamic.snapshots, dynamic.output] : []),
    ]);
    this.packer.reset();
    this.controlStorage = new Uint32Array(0);
  }
}
