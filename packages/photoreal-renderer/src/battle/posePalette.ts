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
  snapshotCapacity: number;
  controls: THREE.StorageBufferAttribute;
  snapshots: THREE.StorageBufferAttribute;
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

  private allocate(capacity: number, snapshotCapacity: number): DynamicPalette {
    const bones = this.animation.bones;
    for (const bytes of [
      capacity * PLAYBACK_WORDS * 4,
      snapshotCapacity * bones * 48,
      capacity * bones * 64,
    ])
      this.checkSize(bytes);
    const controls = new THREE.StorageBufferAttribute(
      new Uint32Array(capacity * PLAYBACK_WORDS),
      4,
    );
    const snapshots = new THREE.StorageBufferAttribute(
      new Float32Array(snapshotCapacity * bones * 12),
      4,
    );
    const output = new THREE.StorageBufferAttribute(new Float32Array(capacity * bones * 16), 16);
    controls.name = "soldier-palette-controls";
    snapshots.name = "soldier-palette-snapshots";
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
    const snapshotsNode = storage(snapshots, "vec4", snapshots.count).toReadOnly();
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
            snapshots: snapshotsNode,
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
      snapshotCapacity,
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
    if (!old || count > old.capacity || prepared.requiredSnapshotSlots > old.snapshotCapacity) {
      let next: DynamicPalette;
      try {
        const limit = Math.min(
          device.limits.maxBufferSize,
          device.limits.maxStorageBufferBindingSize,
        );
        this.checkSize(Math.max(1, prepared.requiredSnapshotSlots) * this.animation.bones * 48);
        const capacity =
          count > (old?.capacity ?? 0)
            ? Math.min(
                Math.max(count, (old?.capacity ?? 0) * 2, 256),
                Math.floor(limit / Math.max(PLAYBACK_WORDS * 4, this.animation.bones * 64)),
                device.limits.maxComputeWorkgroupsPerDimension * 64,
              )
            : old!.capacity;
        const snapshotCapacity =
          prepared.requiredSnapshotSlots > (old?.snapshotCapacity ?? 0)
            ? Math.min(
                Math.max(prepared.requiredSnapshotSlots, (old?.snapshotCapacity ?? 0) * 2, 1),
                Math.floor(limit / (this.animation.bones * 48)),
              )
            : Math.max(old?.snapshotCapacity ?? 0, 1);
        next = this.allocate(capacity, snapshotCapacity);
      } catch (error) {
        this.packer.discardPrepared(prepared);
        throw error;
      }
      // A new snapshot allocation has no resident immutable sources, even when
      // only the instance output capacity caused this coherent generation change.
      this.packer.reset();
      prepared = this.packer.prepare(count, playbackAt, maskAt, this.controlStorage);
      try {
        rebind(next.columns);
      } catch (error) {
        next.compute.dispose();
        releaseStorage(this.renderer, [next.controls, next.snapshots, next.output]);
        this.packer.discardPrepared(prepared);
        throw error;
      }
      this.dynamic = next;
      if (old) {
        old.compute.dispose();
        releaseStorage(this.renderer, [old.controls, old.snapshots, old.output]);
      }
    }
    const active = this.dynamic!;
    try {
      (active.controls.array as Uint32Array).set(prepared.controls);
      active.controls.clearUpdateRanges();
      active.controls.addUpdateRange(0, prepared.controls.length);
      active.controls.needsUpdate = true;
      active.snapshots.clearUpdateRanges();
      for (const upload of prepared.uploads) {
        const offset = upload.slot * this.animation.bones * 12;
        (active.snapshots.array as Float32Array).set(upload.data, offset);
        active.snapshots.addUpdateRange(offset, upload.data.length);
        this.snapshotUploadedBytes += upload.data.byteLength;
      }
      if (prepared.uploads.length) active.snapshots.needsUpdate = true;
      this.count.value = count;
      active.compute.count = count;
      this.renderer.compute(active.compute);
      this.packer.commitPrepared(prepared);
      this.snapshotSlotHighWater = Math.max(
        this.snapshotSlotHighWater,
        prepared.requiredSnapshotSlots,
      );
      this.uploadedBytes = prepared.controls.byteLength + this.snapshotUploadedBytes;
    } catch (error) {
      this.packer.discardPrepared(prepared);
      throw error;
    }
  }

  stats() {
    const dynamic = this.dynamic;
    return {
      bones: this.animation.bones,
      visible: this.visible,
      capacity: dynamic?.capacity ?? 0,
      snapshotCapacity: dynamic?.snapshotCapacity ?? 0,
      residentSnapshots: this.packer.residentSnapshotCount,
      snapshotSlotHighWater: this.snapshotSlotHighWater,
      allocatedBytes: [
        ...this.staticAttributes,
        ...(dynamic ? [dynamic.controls, dynamic.snapshots, dynamic.output] : []),
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
      ...(dynamic ? [dynamic.controls, dynamic.snapshots, dynamic.output] : []),
    ]);
    this.packer.reset();
    this.controlStorage = new Uint32Array(0);
  }
}
