// @vitest-environment node
import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { RawPosePalette } from "@packages/renderer-core/src/rawPosePalette";
import { bakeLocalAnimation } from "@packages/soldier-assets/src/localAnimation";
import type { ImportedRig } from "@packages/soldier-assets/src/rig";
import type { SoldierPlayback } from "@packages/crowd-runtime/src/actionTimeline";

test("raw palette snapshot growth reuploads retained sources and retires resources once", () => {
  vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, STORAGE: 2, UNIFORM: 4 });
  vi.stubGlobal("GPUShaderStage", { VERTEX: 1, COMPUTE: 2 });
  try {
    const allocations: { label: string; size: number; destroyed: number; destroy(): void }[] = [];
    const writes: { label: string; offset: number; data: Uint8Array }[] = [];
    let failSnapshotWrite = false;
    let failBinding = false;
    const device = {
      limits: { maxComputeWorkgroupsPerDimension: 65535 },
      createBuffer({ label, size }: { label: string; size: number }) {
        const buffer = {
          label,
          size,
          destroyed: 0,
          destroy() {
            this.destroyed++;
          },
        };
        allocations.push(buffer);
        return buffer;
      },
      createBindGroupLayout: () => ({}),
      createPipelineLayout: () => ({}),
      createBindGroup: () => {
        if (failBinding) throw new Error("injected bind-group failure");
        return {};
      },
      createShaderModule: () => ({}),
      createComputePipeline: () => ({}),
      queue: {
        writeBuffer(buffer: { label: string }, offset: number, data: ArrayBufferView) {
          writes.push({
            label: buffer.label,
            offset,
            data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(),
          });
          if (failSnapshotWrite && buffer.label.includes("snapshots"))
            throw new Error("injected queued-write failure");
        },
      },
    };
    const rig: ImportedRig = {
      bones: [
        {
          name: "root",
          parent: -1,
          bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
          inverseBind: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        },
      ],
      clips: [{ name: "idle", duration: 1, loop: true, tracks: {} }],
    };
    const palette = new RawPosePalette(
      device as unknown as GPUDevice,
      {
        maxStorageBufferBindingSize: 65536,
        maxBufferSize: 65536,
        msaaSampleCount: 1,
        msaaSupported: true,
        timestampQuery: false,
        powerPreference: "default",
      },
      rig,
      bakeLocalAnimation(rig),
      { 0: { manifest: { presentation: null } } },
      "test",
    );
    const playback = (x: number): SoldierPlayback => ({
      appearanceId: 0,
      base: {
        source: { kind: "frozen", locals: Object.freeze([x, 0, 0, 0, 0, 0, 1, 1, 1, 1]) },
        destination: { clip: "idle", phase: 0 },
        weight: 0,
      },
    });
    const samples = [playback(3), playback(5), playback(7)];
    palette.upload(
      1,
      (index) => samples[index],
      () => 0,
    );
    const first = writes.filter((write) => write.label.includes("snapshots"));
    assert.equal(first.length, 1);
    assert.equal(new Float32Array(first[0].data.buffer)[0], 3);
    palette.upload(
      1,
      (index) => samples[index],
      () => 0,
    );
    assert.equal(
      writes.filter((write) => write.label.includes("snapshots")).length,
      1,
      "unchanged source identity must not be uploaded each frame",
    );
    palette.upload(
      3,
      (index) => samples[index],
      () => 0,
    );
    const grown = writes.filter((write) => write.label.includes("snapshots")).slice(1);
    assert.deepEqual(
      grown.map((write) => [write.offset, new Float32Array(write.data.buffer)[0]]),
      [
        [0, 3],
        [48, 5],
        [96, 7],
      ],
      "fresh allocation receives all active sources, including retained slot zero",
    );
    assert.equal(palette.stats().residentSnapshots, 3);
    const dispatches: number[] = [];
    palette.precompute({
      beginComputePass: () => ({
        setPipeline() {},
        setBindGroup() {},
        dispatchWorkgroups(count: number) {
          dispatches.push(count);
        },
        end() {},
      }),
    } as unknown as GPUCommandEncoder);
    assert.deepEqual(dispatches, [1]);
    failSnapshotWrite = true;
    const replacement = playback(9);
    assert.throws(
      () =>
        palette.upload(
          1,
          () => replacement,
          () => 0,
        ),
      /queued-write failure/,
    );
    failSnapshotWrite = false;
    palette.upload(
      1,
      () => samples[0],
      () => 0,
    );
    const recovered = writes.filter((write) => write.label.includes("snapshots")).at(-1)!;
    assert.deepEqual(
      [recovered.offset, new Float32Array(recovered.data.buffer)[0]],
      [0, 3],
      "failed partial writes cannot leave the overwritten original snapshot marked resident",
    );
    const beforeFailure = allocations.length;
    failBinding = true;
    assert.throws(
      () =>
        palette.upload(
          20,
          () => samples[0],
          () => 0,
        ),
      /bind-group failure/,
    );
    failBinding = false;
    assert.ok(
      allocations.slice(beforeFailure).every((buffer) => buffer.destroyed === 1),
      "candidate growth buffers are released on binding failure",
    );
    assert.throws(
      () =>
        palette.upload(
          1000,
          () => {
            throw new Error("must reject before packing");
          },
          () => 0,
        ),
      /device grants only/,
    );
    palette.upload(
      1,
      () => samples[0],
      () => 0,
    );
    palette.dispose();
    palette.dispose();
    assert.ok(allocations.every((buffer) => buffer.destroyed === 1));
  } finally {
    vi.unstubAllGlobals();
  }
});
