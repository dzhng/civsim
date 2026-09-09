import { expect, test } from "vitest";
import * as THREE from "three/webgpu";
import { SoldierPosePalette } from "@packages/photoreal-renderer/src/battle/posePalette";
import { bakeLocalAnimation, packLocalPose } from "@packages/soldier-assets/src/localAnimation";
import { mat4Identity } from "@packages/soldier-assets/src/localPose";
import type { ImportedRig } from "@packages/soldier-assets/src/rig";
import { queueCrowdInstance } from "@packages/photoreal-renderer/src/battle/crowdLayer";
import { generatedFormation, type CrowdInstance } from "@packages/crowd-runtime/src/instanceData";
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

test("actual storage binding count rejects before allocating palette resources", () => {
  const renderer = {
    backend: { device: { limits: { maxStorageBuffersPerShaderStage: 6 } } },
  } as unknown as THREE.WebGPURenderer;
  expect(
    () =>
      new SoldierPosePalette(renderer, rig, bakeLocalAnimation(rig), {
        40: { manifest: { presentation: null } },
      }),
  ).toThrow("requires 7 storage buffers");
});

test("two frozen sources per body fit whenever their output palette fits", () => {
  const pairedRig = { ...rig, bones: [rig.bones[0], { ...rig.bones[0], name: "upper" }] };
  const released: THREE.StorageBufferAttribute[] = [];
  const renderer = {
    backend: {
      device: {
        limits: {
          maxBufferSize: 384,
          maxStorageBufferBindingSize: 384,
          maxStorageBuffersPerShaderStage: 8,
          maxComputeWorkgroupsPerDimension: 65535,
        },
      },
    },
    _attributes: {
      data: { get: () => ({ version: 0 }) },
      delete(attribute: THREE.StorageBufferAttribute) {
        released.push(attribute);
      },
    },
    compute() {},
  } as unknown as THREE.WebGPURenderer;
  const palette = new SoldierPosePalette(renderer, pairedRig, bakeLocalAnimation(pairedRig), {
    40: { manifest: { presentation: null } },
  });
  const source = (x: number) => ({
    kind: "frozen" as const,
    locals: Object.freeze([x, 0, 0, 0, 0, 0, 1, 1, 1, 1, x + 1, 0, 0, 0, 0, 0, 1, 1, 1, 1]),
  });
  const frames: SoldierPlayback[] = [0, 1, 2].map((i) => ({
    appearanceId: 40,
    base: { source: source(i * 2), destination: { clip: "hold", phase: 0 }, weight: 0.25 },
    riderUpperBody: { source: source(i * 2 + 1), destination: { kind: "base" }, weight: 0.75 },
  }));
  const upload = () =>
    palette.upload(
      frames.length,
      (i) => frames[i],
      () => 0,
      () => {},
    );
  upload(); // Output: 384 bytes; six exact snapshots: 576 bytes.
  expect(palette.stats().residentSnapshots).toBe(6);
  expect(palette.stats().snapshotUploadedBytes).toBe(576);
  upload();
  expect(palette.stats().snapshotUploadedBytes).toBe(0);
  frames.splice(0, 2); // Retain slots 4 and 5, not a compacted low-slot copy.
  upload();
  expect(palette.stats().snapshotUploadedBytes).toBe(0);
  expect(palette.stats().snapshotBankCapacity).toBe(3);
  const replacement = {
    ...frames[0],
    base: { ...frames[0].base, source: source(8) },
    riderUpperBody: { ...frames[0].riderUpperBody!, source: source(9) },
  };
  frames.push(replacement);
  upload();
  expect(palette.stats().snapshotUploadedBytes).toBe(192);
  replacement.riderUpperBody.source = frames[0].base.source as ReturnType<typeof source>;
  upload();
  expect(palette.stats().snapshotUploadedBytes).toBe(0);
  expect(palette.stats().residentSnapshots).toBe(3); // Shared across base and upper layers.
  palette.dispose();
  const banks = released.filter((attribute) => attribute.name.includes("snapshots"));
  expect(banks.map((bank) => bank.array.byteLength)).toEqual([288, 288]);
  for (let bank = 0; bank < 2; bank++) {
    expect(banks[bank].array.slice(0, 24)).toEqual(packLocalPose(source(8 + bank).locals));
    expect(banks[bank].array.slice(48, 72)).toEqual(packLocalPose(source(4 + bank).locals));
  }
});

test("impossible work rejects before packing and falsy submission failure drains every admission scope", async () => {
  let scopes = 0,
    submitted = false;
  const renderer = {
    backend: {
      device: {
        limits: {
          maxBufferSize: 1024,
          maxStorageBufferBindingSize: 1024,
          maxStorageBuffersPerShaderStage: 8,
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
          maxStorageBuffersPerShaderStage: 8,
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

test("failed bank replacement keeps the previous output and retries exact sources", () => {
  const released = new Set<THREE.BufferAttribute>();
  let failSubmission = false;
  const renderer = {
    backend: {
      device: {
        limits: {
          maxBufferSize: 20000,
          maxStorageBufferBindingSize: 20000,
          maxStorageBuffersPerShaderStage: 8,
          maxComputeWorkgroupsPerDimension: 65535,
        },
      },
    },
    _attributes: {
      data: { get: () => ({ version: 0 }) },
      delete(attribute: THREE.BufferAttribute) {
        expect(released.has(attribute)).toBe(false);
        released.add(attribute);
      },
    },
    compute() {
      if (failSubmission) throw new Error("queued bank upload failed");
    },
  } as unknown as THREE.WebGPURenderer;
  const palette = new SoldierPosePalette(renderer, rig, bakeLocalAnimation(rig), {
    40: { manifest: { presentation: null } },
  });
  const frames: SoldierPlayback[] = [3, 5, 7].map((x) => ({
    appearanceId: 40,
    base: {
      source: { kind: "frozen", locals: Object.freeze([x, 0, 0, 0, 0, 0, 1, 1, 1, 1]) },
      destination: { clip: "hold", phase: 0 },
      weight: 0,
    },
  }));
  const upload = (count: number, rebind = () => {}) =>
    palette.upload(
      count,
      (i) => frames[i],
      () => 0,
      rebind,
    );
  upload(1);
  const original = palette.columns;
  failSubmission = true;
  expect(() => upload(3)).toThrow("queued bank upload failed");
  expect(palette.columns).toBe(original);
  expect(released.has(original.value)).toBe(false);
  failSubmission = false;
  expect(() =>
    upload(3, () => {
      throw new Error("material rebind failed");
    }),
  ).toThrow("material rebind failed");
  expect(palette.columns).toBe(original);
  expect(released.has(original.value)).toBe(false);
  upload(3);
  expect(palette.stats().snapshotUploadedBytes).toBe(3 * 48);
  expect(released.has(original.value)).toBe(true);
  upload(3);
  expect(palette.stats().snapshotUploadedBytes).toBe(0);
  palette.dispose();
  palette.dispose();
  expect([...released].filter((attribute) => attribute.name.includes("snapshots")).length).toBe(8);
});

test("two draw audiences share pose slots and do not double palette capacity or uploads", () => {
  const renderer = {
    backend: {
      device: {
        limits: {
          maxBufferSize: 20000,
          maxStorageBufferBindingSize: 20000,
          maxStorageBuffersPerShaderStage: 8,
          maxComputeWorkgroupsPerDimension: 65535,
        },
      },
    },
    _attributes: { data: { get: () => ({ version: 0 }) }, delete() {} },
    compute() {},
  } as unknown as THREE.WebGPURenderer;
  const palette = new SoldierPosePalette(renderer, rig, bakeLocalAnimation(rig), {
    40: { manifest: { presentation: null } },
  });
  const group = { pending: [] as CrowdInstance[] };
  const main = { group, pending: [] as CrowdInstance[], paletteIndices: [] as number[] };
  const shadow = { group, pending: [] as CrowdInstance[], paletteIndices: [] as number[] };
  const instances = generatedFormation(250).map((body, i) => ({
    ...body,
    clip: "hold",
    phase: i / 250,
  }));
  const upload = () =>
    palette.upload(
      group.pending.length,
      (i) => group.pending[i],
      () => 0,
      () => {},
    );
  for (const instance of instances) queueCrowdInstance(instance, main);
  upload();
  const single = palette.stats();
  group.pending.length = main.pending.length = main.paletteIndices.length = 0;
  for (const instance of instances) queueCrowdInstance(instance, main, shadow);
  assertQueues();
  upload(); // 500 pose slots would exceed this device's 20,000-byte limit.
  expect(palette.stats()).toEqual(single);

  // Same owned queue covers impostor+caster (shadow only) and no mesh demand.
  group.pending.length = main.pending.length = main.paletteIndices.length = 0;
  shadow.pending.length = shadow.paletteIndices.length = 0;
  queueCrowdInstance(instances[13], undefined, shadow);
  queueCrowdInstance(instances[14]);
  expect(group.pending).toEqual([instances[13]]);
  expect(shadow.pending[shadow.paletteIndices[0]].phase).toBe(instances[13].phase);
  palette.dispose();

  function assertQueues() {
    expect(group.pending).toEqual(instances);
    expect(main.paletteIndices).toEqual(shadow.paletteIndices);
    for (let i = 0; i < instances.length; i++) {
      expect(group.pending[main.paletteIndices[i]]).toBe(main.pending[i]);
      expect(group.pending[shadow.paletteIndices[i]]).toBe(shadow.pending[i]);
    }
  }
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
          maxStorageBuffersPerShaderStage: 8,
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
  expect(released.size).toBe(7);
});
