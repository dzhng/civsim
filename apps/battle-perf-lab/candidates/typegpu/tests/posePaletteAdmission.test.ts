import { afterEach, expect, test, vi } from "vitest";
import { recordingGpu } from "./recordingDevice";
import { createTypegpuPosePalette } from "../../../../../packages/battle-renderer/src/world/posePalette";
import { bakeLocalAnimation } from "../../../../../packages/soldier-assets/src/localAnimation";
import { mat4Identity } from "../../../../../packages/soldier-assets/src/localPose";
import type { ImportedRig } from "../../../../../packages/soldier-assets/src/rig";
import type { SoldierPlayback } from "../../../../../packages/crowd-runtime/src/actionTimeline";

const rig: ImportedRig = {
  bones: [
    {
      name: "root",
      parent: -1,
      bind: { T: [0, 0, 0], R: [0, 0, 0, 1], S: [1, 1, 1] },
      inverseBind: mat4Identity(),
    },
  ],
  clips: [{ name: "hold", duration: 1, loop: true, tracks: {} }],
};
const appearances = { 1: { manifest: { presentation: null } } };
const frozen = (x: number): SoldierPlayback => ({
  appearanceId: 1,
  base: {
    source: { kind: "frozen", locals: Object.freeze([x, 0, 0, 0, 0, 0, 1, 1, 1, 1]) },
    destination: { clip: "hold", phase: 0 },
    weight: 0.5,
  },
  riderUpperBody: {
    source: { kind: "frozen", locals: Object.freeze([x + 0.5, 0, 0, 0, 0, 0, 1, 1, 1, 1]) },
    destination: { kind: "base" },
    weight: 0.5,
  },
});
function device() {
  const gpu = recordingGpu();
  Object.assign(gpu.native.limits, {
    maxStorageBuffersPerShaderStage: 7,
    maxBufferSize: 4096,
    maxStorageBufferBindingSize: 4096,
    maxComputeWorkgroupsPerDimension: 64,
  });
  return gpu;
}
afterEach(() => vi.unstubAllGlobals());

test("insufficient storage bindings reject before any palette allocation", async () => {
  const gpu = device();
  Object.assign(gpu.native.limits, { maxStorageBuffersPerShaderStage: 6 });
  await expect(
    createTypegpuPosePalette(gpu.native, rig, bakeLocalAnimation(rig), appearances),
  ).rejects.toThrow("requires 7 storage buffers");
  expect(gpu.buffers).toHaveLength(0);
  expect(gpu.errorScopes).toEqual([]);
});

test("two frozen sources per soldier fit the output limit and retain sparse slots without repeated uploads", async () => {
  const gpu = device();
  Object.assign(gpu.native.limits, { maxBufferSize: 384, maxStorageBufferBindingSize: 384 });
  const paired = { ...rig, bones: [rig.bones[0], { ...rig.bones[0], name: "upper" }] };
  const palette = await createTypegpuPosePalette(
    gpu.native,
    paired,
    bakeLocalAnimation(paired),
    appearances,
  );
  const frames = [frozen(1), frozen(2), frozen(3)];
  for (const frame of frames) {
    for (const blend of [frame.base, frame.riderUpperBody!]) {
      if (blend.source.kind === "frozen")
        blend.source = {
          kind: "frozen",
          locals: Object.freeze([...blend.source.locals, ...blend.source.locals]),
        };
    }
  }
  const upload = () =>
    palette.upload(
      frames.length,
      (i) => frames[i],
      () => 1,
    );
  await upload();
  expect(palette.stats()).toMatchObject({
    instances: 3,
    residentSnapshots: 6,
    snapshotUploadBytes: 576,
  });
  await upload();
  expect(palette.stats().snapshotUploadBytes).toBe(0);
  frames.splice(0, 2);
  await upload();
  expect(palette.stats()).toMatchObject({
    instances: 1,
    residentSnapshots: 2,
    snapshotUploadBytes: 0,
  });
  expect(gpu.errorScopes).toEqual([]);
  palette.dispose();
  palette.dispose();
  expect(gpu.live.size).toBe(0);
});

test("failed palette growth retains the admitted output and retries exact sources", async () => {
  const gpu = device();
  const palette = await createTypegpuPosePalette(
    gpu.native,
    rig,
    bakeLocalAnimation(rig),
    appearances,
  );
  const frames = [frozen(1)];
  const upload = () =>
    palette.upload(
      frames.length,
      (i) => frames[i],
      () => 1,
    );
  await upload();
  const prior = palette.buffer;
  const live = new Set(gpu.live);
  frames.push(...Array.from({ length: 12 }, (_, i) => frozen(i + 2)));
  gpu.failBufferAt(gpu.buffers.length + 1);
  await expect(upload()).rejects.toThrow("injected allocation failure");
  expect(palette.buffer).toBe(prior);
  expect(palette.stats().instances).toBe(1);
  expect(gpu.live).toEqual(live);
  expect(gpu.errorScopes).toEqual([]);
  gpu.failBufferAt(Infinity);
  await upload();
  expect(palette.stats()).toMatchObject({
    instances: 13,
    residentSnapshots: 26,
    snapshotUploadBytes: 1248,
  });
  await upload();
  expect(palette.stats().snapshotUploadBytes).toBe(0);
  palette.dispose();
  expect(gpu.live.size).toBe(0);
});

test("constructor allocation failure and impossible dispatch leave no scopes or extra resources", async () => {
  const failed = device();
  failed.failBufferAt(2);
  await expect(
    createTypegpuPosePalette(failed.native, rig, bakeLocalAnimation(rig), appearances),
  ).rejects.toThrow("injected allocation failure");
  expect(failed.live.size).toBe(0);
  expect(failed.errorScopes).toEqual([]);
  const gpu = device();
  const palette = await createTypegpuPosePalette(
    gpu.native,
    rig,
    bakeLocalAnimation(rig),
    appearances,
  );
  const before = new Set(gpu.live);
  await expect(
    palette.upload(
      64 * 64 + 1,
      () => {
        throw Error("must not pack");
      },
      () => 1,
    ),
  ).rejects.toThrow("count");
  expect(gpu.live).toEqual(before);
  expect(gpu.errorScopes).toEqual([]);
  palette.dispose();
});
