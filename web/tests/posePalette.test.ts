import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { SoldierPosePalette } from "@packages/photoreal-renderer/src/battle/posePalette";
import { bakeLocalAnimation } from "@packages/soldier-assets/src/localAnimation";
import { mat4Identity } from "@packages/soldier-assets/src/localPose";
import type { ImportedRig } from "@packages/soldier-assets/src/rig";

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

test("impossible work rejects before packing and falsy submission failure drains every admission scope", async () => {
  let scopes = 0,
    submitted = false;
  const renderer = {
    backend: {
      device: {
        limits: {
          maxBufferSize: 1024,
          maxStorageBufferBindingSize: 1024,
          maxComputeWorkgroupsPerDimension: 65535,
        },
        pushErrorScope() {
          scopes++;
        },
        async popErrorScope() {
          scopes--;
          return null;
        },
      },
    },
    _attributes: { data: { get: () => ({ version: 0 }) }, delete() {} },
    compute() {
      submitted = true;
      throw 0;
    },
  };
  const palette = new SoldierPosePalette(
    renderer as unknown as THREE.WebGPURenderer,
    rig,
    bakeLocalAnimation(rig),
    { 40: { manifest: { presentation: null } } },
  );
  expect(() =>
    palette.upload(
      1000,
      () => {
        throw new Error("impossible work must not be packed");
      },
      () => 0,
      () => {},
    ),
  ).toThrow("device limit is 1024");
  await expect(palette.initialize({ clip: "hold", phase: 0 })).rejects.toBe(0);
  expect(scopes).toBe(0);
  expect(submitted).toBe(true);
  expect(() =>
    palette.upload(
      1,
      () => ({ clip: "hold", phase: 0 }),
      () => 0,
      () => {},
    ),
  ).toThrow("disposed");
});

test("optional reserve is bounded without rejecting a fitting request", () => {
  const renderer = {
    backend: {
      device: {
        limits: {
          maxBufferSize: 20000,
          maxStorageBufferBindingSize: 20000,
          maxComputeWorkgroupsPerDimension: 65535,
        },
      },
    },
    _attributes: { data: { get: () => ({ version: 0 }) }, delete() {} },
    compute() {},
  };
  const palette = new SoldierPosePalette(
    renderer as unknown as THREE.WebGPURenderer,
    rig,
    bakeLocalAnimation(rig),
    { 40: { manifest: { presentation: null } } },
  );
  const sample = () => ({ clip: "hold", phase: 0 });
  palette.upload(
    200,
    sample,
    () => 0,
    () => {},
  );
  expect(palette.stats().capacity).toBe(250);
  palette.upload(
    250,
    sample,
    () => 0,
    () => {},
  );
  expect(palette.stats().visible).toBe(250);
  expect(() =>
    palette.upload(
      251,
      sample,
      () => 0,
      () => {},
    ),
  ).toThrow("device limit is 20000");
  palette.dispose();
});

test("admission failure retires all owned storage once, including after partial submission", async () => {
  const released = new Set<THREE.BufferAttribute>();
  let scopes = 0;
  const renderer = {
    backend: {
      device: {
        limits: {
          maxBufferSize: 2 ** 28,
          maxStorageBufferBindingSize: 2 ** 27,
          maxComputeWorkgroupsPerDimension: 65535,
        },
        pushErrorScope() {
          scopes++;
        },
        async popErrorScope() {
          scopes--;
          return { message: "deliberate GPU rejection" };
        },
      },
    },
    _attributes: {
      data: { get: () => ({ version: 0 }) },
      delete(attribute: THREE.StorageBufferAttribute) {
        expect(released.has(attribute)).toBe(false);
        released.add(attribute);
      },
    },
    compute() {},
  };
  const palette = new SoldierPosePalette(
    renderer as unknown as THREE.WebGPURenderer,
    rig,
    bakeLocalAnimation(rig),
    { 40: { manifest: { presentation: null } } },
  );
  await expect(palette.initialize({ clip: "hold", phase: 0 })).rejects.toThrow(
    "deliberate GPU rejection",
  );
  expect(scopes).toBe(0);
  expect(released.has(palette.columns.value)).toBe(true);
  expect([...released].some((attribute) => attribute.array === palette.animation.data)).toBe(true);
  palette.dispose();
  expect(released.size).toBe(6);
});
