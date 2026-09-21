import { expect, test } from "vitest";
import { PoseUpload } from "../../packages/battle-renderer/src/poseUpload";
import { bakeLocalAnimation } from "@packages/soldier-assets/src/localAnimation";
import { mat4Identity } from "@packages/soldier-assets/src/localPose";
import type { ImportedRig } from "@packages/soldier-assets/src/rig";
import type { SoldierPlayback } from "@packages/crowd-runtime/src/actionTimeline";
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
const frozen = (x: number): SoldierPlayback => ({
  appearanceId: 1,
  base: {
    source: { kind: "frozen", locals: Object.freeze([x, 0, 0, 0, 0, 0, 1, 1, 1, 1]) },
    destination: { clip: "hold", phase: 0 },
    weight: 0.25,
  },
});
test("pose upload retains sparse frozen sources through shrink and retries failed growth", () => {
  const state = new PoseUpload(
    rig,
    bakeLocalAnimation(rig),
    { 1: { manifest: { presentation: null } } },
    {
      maxStorageBuffersPerShaderStage: 7,
      maxBufferSize: 4096,
      maxStorageBufferBindingSize: 4096,
      maxComputeWorkgroupsPerDimension: 64,
    },
  );
  const frames = [frozen(1), frozen(2), frozen(3)];
  const prepare = (values: SoldierPlayback[]) =>
    state.prepare(
      values.length,
      (i) => values[i],
      () => 1,
    );
  const first = prepare(frames);
  state.commit(first);
  const sizes = [...state.sizes];
  const retained = prepare([frames[2]]);
  expect(retained.frame.uploads).toHaveLength(0);
  state.commit(retained);
  expect(state.sizes).toEqual(sizes);
  const grown = [frames[2], ...Array.from({ length: 10 }, (_, i) => frozen(i + 4))];
  const rejected = prepare(grown);
  expect(rejected.frame.uploads).toHaveLength(grown.length);
  state.discard(rejected);
  expect(state.sizes).toEqual(sizes);
  expect(state.count).toBe(1);
  const retry = prepare(grown);
  expect(retry.frame.uploads).toHaveLength(grown.length);
  state.commit(retry);
  const stable = prepare(grown);
  expect(stable.frame.uploads).toHaveLength(0);
  state.commit(stable);
  expect(() =>
    state.prepare(
      0x1000000,
      () => frames[0],
      () => 1,
    ),
  ).toThrow("count");
  expect(state.count).toBe(grown.length);
});
