import { expect, test } from "vitest";
import { createPreparedCamera } from "@packages/renderer-core/src/camera3d";
import * as THREE from "three/webgpu";
import { CampaignRenderer } from "../src/campaign/renderer";
import { PhotorealCampaignWorld } from "@packages/photoreal-renderer/src/campaign/campaignWorld";
import { CampaignCityLayer } from "@packages/photoreal-renderer/src/campaign/cityLayer";
import type { CampaignEntityFrame } from "@packages/game-renderer/src/campaign/entityFrame";

test("a newly revealed city has presented body bounds before its first card layout", () => {
  const surface = {
    sampleRendered: (x: number, y: number) => ({
      position: [x, y, 18] as [number, number, number],
      normal: [0, 0, 1] as [number, number, number],
      triangle: 0,
      revision: "raised",
      barycentric: [1, 0, 0] as [number, number, number],
    }),
  };
  const cities = new CampaignCityLayer(new THREE.Scene());
  const world = Object.assign(Object.create(PhotorealCampaignWorld.prototype), {
    cities,
    preparedCamera: createPreparedCamera(),
    projectedPoint: { ndc: [0, 0, 0], clipW: 0 },
    terrain: { surface },
    camera: new THREE.PerspectiveCamera(),
    world: { resize() {} },
    frame: { focus: { value: new THREE.Vector2() } },
    aerialStrength: { value: 1 },
    setEntityFrame(frame: CampaignEntityFrame) {
      cities.upload(frame.entities, surface);
    },
    setMarkers() {},
    setVisibility() {},
  }) as PhotorealCampaignWorld;
  const data = {
    map: {
      attribution: "fixture",
      nodes: [
        {
          id: 0,
          name: "Revealed town",
          pos: [0, 0],
          kind: "city",
          tier: 2,
          port: false,
          owner: "friend",
        },
      ],
      factions: [{ id: "friend", color: [40, 90, 180] }],
      edges: [],
    },
    bgRect: { min: [-100, -100], max: [100, 100] },
  };
  const field = { heightAt: () => 18 };
  const renderer = Object.assign(Object.create(CampaignRenderer.prototype), {
    canvas: { width: 1280, height: 800, clientWidth: 1280, clientHeight: 800 },
    world,
    data,
    field,
    mountedClasses: [],
    soldierClips: {},
    fixedTime: 0,
    lastFactionView: false,
    visibilityKey: "",
    lastFog: { enabled: false, sources: [] },
  }) as CampaignRenderer;
  const inputs = {
    cam: { x: 0, y: 0, scale: 5 },
    armies: [],
    cities: new Map(),
    selected: -1,
    selectedCity: -1,
    factionLabels: [],
    factionStatus: new Int8Array([0]),
    playerFaction: 0,
    fogOfWar: true,
    visionSources: [],
    factionView: false,
    stackUnitCap: 6,
  };
  renderer.prepareFrame(inputs);
  expect(renderer.cityBodyBottomY(0)).toBeUndefined();
  const prepared = renderer.prepareFrame({
    ...inputs,
    visionSources: [{ x: 0, y: 0, radius: 50 }],
  });
  expect(prepared?.frame.entities).toHaveLength(1);
  const bodyBottom = renderer.cityBodyBottomY(0)!;
  const [, anchorY] = renderer.toScreen(0, 0);
  expect(bodyBottom).toBeGreaterThan(anchorY);
  expect(bodyBottom).toBeLessThan(800);
  cities.dispose();
});

test("moving vision sources only refresh world visibility while fog is enabled", () => {
  let updates = 0;
  const world = {
    setEntityFrame() {},
    setMarkers() {},
    setVisibility() {
      updates++;
    },
  };
  const renderer = Object.assign(Object.create(CampaignRenderer.prototype), {
    world,
    data: { map: { attribution: "fixture", nodes: [], factions: [], edges: [] } },
    field: { heightAt: () => 0 },
    mountedClasses: [],
    soldierClips: {},
    fixedTime: 0,
    lastFactionView: false,
    visibilityKey: "",
    setFrameCamera() {},
  }) as CampaignRenderer;
  const inputs = {
    cam: { x: 0, y: 0, scale: 5 },
    armies: [],
    cities: new Map(),
    selected: -1,
    selectedCity: -1,
    factionLabels: [],
    factionStatus: new Int8Array(),
    playerFaction: 0,
    fogOfWar: false,
    visionSources: [{ x: 0, y: 0, radius: 50 }],
    factionView: false,
    stackUnitCap: 6,
  };
  renderer.prepareFrame({ ...inputs, fogOfWar: true, visionSources: [] });
  expect(updates).toBe(1);
  renderer.prepareFrame(inputs);
  renderer.prepareFrame({ ...inputs, visionSources: [{ x: 10, y: 0, radius: 50 }] });
  expect(updates).toBe(2);
  renderer.prepareFrame({ ...inputs, fogOfWar: true });
  expect(updates).toBe(3);
  renderer.prepareFrame({
    ...inputs,
    fogOfWar: true,
    visionSources: [{ x: 10, y: 0, radius: 50 }],
  });
  expect(updates).toBe(4);
});
