// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import { sampleRigLocalPoseSeconds } from "@packages/soldier-assets/src/localPose";
import type { ImportedRig, RigChannel } from "@packages/soldier-assets/src/rig";

function readChannel(
  channel: RigChannel,
  time: number,
  kind: "vec3" | "quat",
  field = kind === "quat" ? "R" : "T",
) {
  const bind = { T: [11, 12, 13], R: [0, 0, 0, 1], S: [21, 22, 23] };
  const rig: ImportedRig = {
    bones: [0, 1, 2].map((joint) => ({
      name: String(joint),
      parent: joint - 1,
      inverseBind: [],
      bind,
    })),
    clips: [{ name: "channel", duration: 2, tracks: { 1: { [field]: channel } } }],
  };
  const pose = sampleRigLocalPoseSeconds(rig, "channel", time);
  const offset = 10 + (field === "R" ? 3 : field === "S" ? 7 : 0);
  const stride = kind === "quat" ? 4 : 3;
  const untouched = new Float64Array(
    Array.from({ length: 3 }, () => [...bind.T, ...bind.R, ...bind.S]).flat(),
  );
  assert.deepEqual(pose.slice(0, offset), untouched.slice(0, offset));
  assert.deepEqual(pose.slice(offset + stride), untouched.slice(offset + stride));
  return Array.from(pose.slice(offset, offset + stride));
}

test("channels preserve authored endpoints, exact STEP boundaries and empty defaults", () => {
  const channel: RigChannel = { times: [0.1, 0.3, 0.9], values: [1, 2, 3, 4, 8, 12, 7, 14, 21] };
  for (const [time, expected] of [
    [-1, [1, 2, 3]],
    [0.1, [1, 2, 3]],
    [0.3, [4, 8, 12]],
    [2, [7, 14, 21]],
  ] as const)
    assert.deepEqual(readChannel(channel, time, "vec3"), expected);
  const step = { ...channel, interpolation: "STEP" as const };
  assert.deepEqual(readChannel(step, 0.3 - Number.EPSILON, "vec3"), [1, 2, 3]);
  assert.deepEqual(readChannel(step, 0.3, "vec3"), [4, 8, 12]);
  assert.deepEqual(readChannel(step, 0.3 + Number.EPSILON, "vec3"), [4, 8, 12]);
  assert.deepEqual(readChannel({ times: [], values: [] }, 0, "quat"), [0, 0, 0, 1]);
  assert.deepEqual(readChannel({ times: [], values: [] }, 0, "vec3"), [0, 0, 0]);
  const result = readChannel(channel, 0.1, "vec3");
  result.fill(99);
  assert.deepEqual(channel.values.slice(0, 3), [1, 2, 3]);
});

test("channel interpolation keeps exact vector and quaternion arithmetic", () => {
  assert.deepEqual(
    readChannel({ times: [0, 1], values: [1, -2, 4, 3, 6, -8] }, 0.25, "vec3"),
    [1.5, 0, 1],
  );
  assert.deepEqual(
    readChannel({ times: [0, 1], values: [1, -2, 4, 3, 6, -8] }, 0.25, "vec3", "S"),
    [1.5, 0, 1],
  );
  const rotation: RigChannel = { times: [0, 1], values: [0, 0, 0, 1, 0, 0, 1, 0] };
  // Retained output of the former slice-and-slerp recipe, including rounding.
  assert.deepEqual(
    readChannel(rotation, 0.5, "quat"),
    [0, 0, 0.7071067811865475, 0.7071067811865475],
  );
  assert.deepEqual(
    readChannel({ times: [0, 1], values: [0, 0, 0, 2, 0, 0, 1, 0] }, 0, "quat"),
    [0, 0, 0, 2],
  );
});

test("sampling writes only each channel's components and keeps unanimated bind components owned", () => {
  const bind = { T: [1, 2, 3], R: [0, 0, 0, 1], S: [2, 3, 4] };
  const rig: ImportedRig = {
    bones: [0, 1].map((parent) => ({
      name: String(parent),
      parent: parent - 1,
      inverseBind: [],
      bind,
    })),
    clips: [
      {
        name: "step",
        duration: 1,
        tracks: {
          0: {
            T: {
              times: [0, 0.3, 1],
              values: [0, 0, 0, 7, 8, 9, 10, 11, 12],
              interpolation: "STEP",
            },
          },
        },
      },
    ],
  };
  const expected = new Float64Array([
    7,
    8,
    9,
    ...bind.R,
    ...bind.S,
    ...bind.T,
    ...bind.R,
    ...bind.S,
  ]);
  const result = sampleRigLocalPoseSeconds(rig, "step", 0.3);
  assert.deepEqual(result, expected);
  result.fill(99);
  assert.deepEqual(sampleRigLocalPoseSeconds(rig, "step", 0.3), expected);
});
