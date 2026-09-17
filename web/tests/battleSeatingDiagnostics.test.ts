// @vitest-environment node
import { expect, test, vi } from "vitest";
import { PerspectiveCamera } from "three/webgpu";
import { generatedFormation } from "@packages/crowd-runtime/src/instanceData";
import { emptyLodCounts } from "@packages/crowd-runtime/src/lod";
import {
  PhotorealBattleWorld,
  type BattleCameraSnapshot,
} from "@packages/photoreal-renderer/src/battle/battleWorld";

const camera: BattleCameraSnapshot = {
  x: 0,
  y: 0,
  zoom: 0,
  zoomT: 0,
  camera3d: { target: [0, 0, 0], distance: 100, pitch: 0.6, yaw: 0, fovY: 0.6, aspect: 1, near: 1 },
};

function fixture() {
  const original = vi.fn((x: number, _y: number) => x + 1);
  let sampler: typeof original | undefined = original;
  const stats = () => ({});
  const layer = { stats, upload() {} };
  // Keep the real submission and stats methods; GPU resources are opaque here.
  const world = Object.assign(Object.create(PhotorealBattleWorld.prototype), {
    camera: new PerspectiveCamera(),
    lastCamera: camera,
    frame: { dt: { value: 0 } },
    world: {
      stats,
      renderer: { domElement: { width: 1, height: 1 } },
      gpuTelemetry: {
        beginSubmission() {},
        withScope(_name: string, draw: () => void) {
          draw();
        },
        snapshot: stats,
      },
    },
    terrainSurface: { heightSampler: () => sampler },
    environment: { environment: { id: "test" } },
    crowd: { upload() {}, stats: () => ({ visibleTierHistogram: emptyLodCounts() }) },
    shadowRig: { update() {}, identity: stats },
    sea: layer,
    post: layer,
    groundCues: layer,
    selectionRings: layer,
    effectLines: layer,
    standardLayer: layer,
    readoutLayer: layer,
    instances: [],
    instancePool: [],
    debugTriangles: layer,
    debugBlocks: layer,
    seating: { checked: 0, matches: true, span: 0 },
    setCamera() {},
    updateGrass() {},
    crowdVisibilityScope: stats,
  }) as PhotorealBattleWorld;
  const instances = generatedFormation(2).map((instance, i) => ({
    ...instance,
    x: i,
    y: 0,
    elevation: i + 1,
  }));
  const playback = instances.map(() => ({
    appearanceId: 0,
    base: {
      source: { kind: "clip" as const, sample: { clip: "idle", phase: 0 } },
      destination: { clip: "idle", phase: 0 },
      weight: 1,
    },
  }));
  const draw = () =>
    world.draw(
      new Float32Array([0, 0, 1, 0]),
      new Float32Array(2),
      playback,
      new Float32Array([1, 1]),
      2,
      camera,
    );
  return {
    draw,
    world,
    instances,
    original,
    replaceTerrain(next: typeof original | undefined) {
      sampler = next;
    },
  };
}

test("normal instance building samples terrain once per soldier and retains seating", () => {
  const { world, original, draw } = fixture();
  draw();
  expect(original).toHaveBeenCalledTimes(2);
  expect(world.stats().seating).toEqual({ checked: 2, matches: true, span: 1 });
  expect(world.stats().seating).toEqual({ checked: 2, matches: true, span: 1 });
  expect(original).toHaveBeenCalledTimes(2);
  draw();
  expect(original).toHaveBeenCalledTimes(4);
});

test.each([false, true])(
  "explicit seating survives borrowed mutations and static reset (read first: %s)",
  (readFirst) => {
    const { world, instances, original, replaceTerrain } = fixture();
    world.drawInstances(instances, camera);
    const expected = { checked: 2, matches: true, span: 1 };
    if (readFirst) expect(world.stats().seating).toEqual(expected);
    instances[1].elevation = 99;
    replaceTerrain(vi.fn((_x: number, _y: number) => 100));
    world.setStatic(new Uint32Array(), [], []);
    expect(world.stats().seating).toEqual(expected);
    expect(original).toHaveBeenCalledTimes(2);
    world.drawInstances(instances, camera);
    expect(world.stats().seating).toEqual({ checked: 2, matches: false, span: 98 });
    world.drawInstances([], camera);
    expect(world.stats().seating).toEqual({ checked: 0, matches: true, span: 0 });
  },
);

test("normal submissions without a terrain sampler retain empty seating diagnostics", () => {
  const { world, original, draw, replaceTerrain } = fixture();
  replaceTerrain(undefined);
  draw();
  expect(original).not.toHaveBeenCalled();
  expect(world.stats().seating).toEqual({ checked: 0, matches: true, span: 0 });
});
