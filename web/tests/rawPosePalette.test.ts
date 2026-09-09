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
      limits: { maxComputeWorkgroupsPerDimension: 65535, maxStorageBuffersPerShaderStage: 8 },
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
          if (failSnapshotWrite && buffer.label.endsWith("snapshots-1"))
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
    const makePalette = (limit = 65536) =>
      new RawPosePalette(
        device as unknown as GPUDevice,
        {
          maxStorageBufferBindingSize: limit,
          maxBufferSize: limit,
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
    const palette = makePalette();
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
      grown.map((write) => [write.label, write.offset, new Float32Array(write.data.buffer)[0]]),
      [
        ["test-snapshots-0", 0, 3],
        ["test-snapshots-1", 0, 5],
        ["test-snapshots-0", 48, 7],
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
    const replacements = [playback(9), playback(11)];
    assert.throws(
      () =>
        palette.upload(
          2,
          (index) => replacements[index],
          () => 0,
        ),
      /queued-write failure/,
    );
    failSnapshotWrite = false;
    palette.upload(
      2,
      (index) => samples[index],
      () => 0,
    );
    const recovered = writes.filter((write) => write.label.includes("snapshots")).slice(-2);
    assert.deepEqual(
      recovered.map((write) => [write.label, write.offset, new Float32Array(write.data.buffer)[0]]),
      [
        ["test-snapshots-0", 0, 3],
        ["test-snapshots-1", 0, 5],
      ],
      "a failure after writing both banks must invalidate both overwritten originals",
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
    const bounded = makePalette(320);
    const mounted = [1, 2, 3, 4].map((x) => ({
      ...playback(x),
      riderUpperBody: {
        source: playback(x + 10).base.source,
        destination: { kind: "base" as const },
        weight: 0.5,
      },
    }));
    bounded.upload(
      mounted.length,
      (i) => mounted[i],
      () => 0,
    );
    assert.equal(bounded.stats().residentSnapshots, 8);
    assert.equal(bounded.stats().snapshotBytes, 384, "total may exceed the 320-byte binding limit");
    bounded.dispose();
    device.limits.maxStorageBuffersPerShaderStage = 6;
    assert.throws(() => makePalette(), /requires 7 storage buffers/);
    assert.ok(allocations.every((buffer) => buffer.destroyed === 1));
  } finally {
    vi.unstubAllGlobals();
  }
});
