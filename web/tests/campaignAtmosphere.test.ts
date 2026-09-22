import { test, expect } from "vitest";
import type { CampaignLabelLayer } from "@packages/photoreal-renderer/src/campaign/labelLayer";
import { campaignPhysicalViewWeight } from "@packages/game-renderer/src/campaign/cameraPolicy";

test("campaign aerial perspective uses chart/detail endpoints without changing detailed views", () => {
  const weightAt = campaignPhysicalViewWeight;
  expect(weightAt(0.16)).toBe(0);
  expect(weightAt(2.2)).toBe(1);
  expect(weightAt(3)).toBe(1);
  expect(weightAt(1)).toBeGreaterThan(0);
  expect(weightAt(1)).toBeLessThan(weightAt(1.3));
  expect(weightAt(1.3)).toBeLessThan(1);
});

// Exercise the live frame boundary as well as the scalar transition: lab callers
// keep the shared default until the application changes the atmosphere policy.
test("drawing preserves atmosphere policy and CSS label framing at its frame boundary", async () => {
  const THREE = await import("three/webgpu");
  const { PhotorealCampaignWorld } =
    await import("@packages/photoreal-renderer/src/campaign/campaignWorld");
  const { chartCamera3d } = await import("@packages/renderer-core/src/camera3d");
  const aerialStrength = { value: 1 };
  const consumed: number[] = [];
  const labelZooms: number[] = [];
  const world = Object.assign(Object.create(PhotorealCampaignWorld.prototype), {
    world: {
      resize() {},
      sunLight: new THREE.DirectionalLight(),
      setTime() {},
      render() {
        consumed.push(aerialStrength.value);
      },
    },
    standards: { upload() {} },
    scenery: { prepareRender() {} },
    labels: {
      update(...args: Parameters<CampaignLabelLayer["update"]>) {
        const [, camera, dpr] = args;
        labelZooms.push(camera.zoom / dpr);
      },
    },
    markers: { update() {} },
    labelInputs: [],
    markerInputs: [],
    frame: { focus: { value: new THREE.Vector2() }, time: { value: 0 } },
    camera: new THREE.PerspectiveCamera(),
    aerialStrength,
  }) as typeof PhotorealCampaignWorld.prototype;
  const pose = chartCamera3d({ x: 0, y: 0, zoom: 0.16 }, 800);
  world.render(pose, 1280, 800);
  world.setAerialStrength(campaignPhysicalViewWeight(0.16));
  world.setFrameCamera(pose, 1280, 800);
  world.render(pose, 1280, 800);
  world.setAerialStrength(campaignPhysicalViewWeight(3));
  world.render(pose, 1280, 800);
  world.render(pose, 1280, 800, 2);
  expect(consumed).toEqual([1, 0, 1, 1]);
  expect(labelZooms[0]).toBeGreaterThan(0);
  expect(labelZooms[3]).toBe(labelZooms[0]);
});

test("the same campaign view supplies identical atmospheric depth at either DPR", async () => {
  const { CampaignRenderer } = await import("../src/campaign/renderer");
  const depths: number[] = [];
  const renderer = Object.assign(Object.create(CampaignRenderer.prototype), {
    resize() {},
    canvas: { clientWidth: 1280, clientHeight: 800 },
    cameraParamsFor() {
      return {};
    },
    world: {
      prepareTerrain() {},
      setFrameCamera() {},
      setAerialStrength(depth: number) {
        depths.push(depth);
      },
    },
  }) as InstanceType<typeof CampaignRenderer>;
  const prior = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  try {
    for (const dpr of [1, 2]) {
      Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: dpr });
      renderer.setFrameCamera({ x: 0, y: 0, scale: 1 * dpr });
    }
  } finally {
    if (prior) Object.defineProperty(window, "devicePixelRatio", prior);
  }
  expect(depths[0]).toBeGreaterThan(0);
  expect(depths[0]).toBeLessThan(1);
  expect(depths[1]).toBe(depths[0]);
});
