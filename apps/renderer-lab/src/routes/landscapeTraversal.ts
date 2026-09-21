import { SELECTION_GREEN } from "@packages/game-renderer/src/overlays";
import {
  buildEntityFrame,
  type CampaignEntityFrame,
} from "@packages/game-renderer/src/campaign/entityFrame";
import { buildCampaignMapDrawData } from "@packages/game-renderer/src/campaign/roadGeometry";
import { campaignFactionBorderVertices } from "@packages/game-renderer/src/campaign/borderGeometry";
import { Territory } from "../../../../web/src/campaign/territory";
import { readCampaignViews } from "../../../../web/src/campaign/views";
import { PhotorealCampaignWorld } from "@packages/photoreal-renderer/src/campaign/campaignWorld";
import { snapshotCampaignLandscape } from "@packages/game-renderer/src/terrain/campaignSource";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import { TerrainField } from "../../../../web/src/campaign/terrain";
import { loadCampaignData } from "../../../../web/src/campaign/data";
import { type LabContext, publish } from "../labShell";

/** Real source and production composition owner; the route only drives its camera. */
export async function route(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const { data, mapJson } = await loadCampaignData();
  const field = new TerrainField(data);
  const source = snapshotCampaignLandscape(field);
  const world = await PhotorealCampaignWorld.createLandscape(ctx.canvas, source, {
    objects: [],
    geography: {
      roadMeshVertices: new Float32Array(),
      roadAnchors: new Float32Array(),
      lineVertices: new Float32Array(),
      borderVertices: new Float32Array(),
    },
    territory: [0.48, 0.48, 0.35],
    fogAt: () => 0,
  });
  const cityNames = ctx.params.get("cities")?.split(",");
  let cityInstances: ReturnType<typeof buildEntityFrame>["entities"] = [];
  let cityFrame: CampaignEntityFrame = { entities: [], standards: [], crowd: [], selections: [] };
  if (cityNames) {
    const { default: init, Campaign } = await import("../../../../web/src/wasm/game_wasm.js");
    const wasm = await init(),
      campaign = new Campaign(mapJson, 0x5eed_2026, 0);
    const views = readCampaignViews(campaign, wasm);
    cityFrame = buildEntityFrame(
      data,
      field,
      {
        cam: { x: 0, y: 0, scale: 8 },
        armies: [],
        cities: views.cities,
        selected: -1,
        selectedCity: -1,
        factionLabels: [],
        factionStatus: new Int8Array(data.map.factions.length).fill(1),
        playerFaction: 0,
        fogOfWar: false,
        visionSources: [],
        factionView: false,
        stackUnitCap: views.stackUnitCap,
        controlledStage: false,
      },
      [],
      0,
      () => "idle",
    );
    cityInstances = cityFrame.entities.filter((city) => cityNames.includes(city.label));
    cityFrame = {
      ...cityFrame,
      entities: cityInstances,
      standards: cityFrame.standards.filter((item) =>
        cityInstances.some((city) => city.id === item.unitId),
      ),
    };
    campaign.free();
    world.setEntityFrame(cityFrame);
  }
  let geographicInputs: Parameters<typeof world.setGeography>[0] | undefined;
  if (ctx.path === "/renderer/landscape-geography") {
    const { default: init, Campaign } = await import("../../../../web/src/wasm/game_wasm.js");
    const wasm = await init();
    const campaign = new Campaign(mapJson, 0x5eed_2026, 0);
    const territory = new Territory(data, field);
    territory.rebuild(readCampaignViews(campaign, wasm).cities);
    campaign.free();
    geographicInputs = {
      ...buildCampaignMapDrawData(data, {
        surfaceAt: (x, y) => (field.landAt(x, y, 16) ? "land" : "water"),
        renderSurfaceAt: (x, y) => (field.renderLandAt(x, y) ? "land" : "water"),
        roadSurfaceAt: (x, y) => (field.renderLandAt(x, y) ? "land" : "water"),
      }),
      borderVertices: campaignFactionBorderVertices(territory.borders, undefined, {
        surfaceStep: 0.9,
        landAt: (x, y) => !field.renderWaterAt(x, y),
      }),
    };
    world.setGeography(geographicInputs);
  }
  let camera = cityInstances.length
    ? {
        x: cityInstances.reduce((sum, city) => sum + city.x, 0) / cityInstances.length,
        y: cityInstances.reduce((sum, city) => sum + city.y, 0) / cityInstances.length,
        zoom: 18,
      }
    : { x: -100, y: 250, zoom: 0.16 };
  let frames = 0,
    stopped = false;
  let lastFrame = 0,
    previousAdmitted = false;
  const frameTimes: number[] = [],
    admissionFrames: number[] = [];
  const stats = () => {
    const tiles = world.residencyStats()!,
      terrain = world.stats().terrain;
    return {
      ...tiles,
      ...terrain,
      camera,
      frames,
      peakTotalTerrainBytes: Math.max(tiles.peakTotalTerrainBytes, terrain.allocationBytes),
      sceneryInstances: 0,
      sceneryRenderedBytes: 0,
      frameTimes: [...frameTimes],
      admissionFrames: [...admissionFrames],
      renderer: world.stats(),
      anchors: world.anchors(),
    };
  };
  const draw = (now: number) => {
    if (stopped) return;
    const before = world.stats().terrain.revision;
    world.prepareTerrain({
      ...camera,
      width: ctx.canvas.clientWidth,
      height: ctx.canvas.clientHeight,
    });
    const pose = chartCamera3d({ ...camera, pitch: 0.55 }, ctx.canvas.clientHeight);
    pose.aspect = ctx.canvas.clientWidth / ctx.canvas.clientHeight;
    if (cityInstances.length) {
      const anchors = world.anchors();
      pose.target = [
        camera.x,
        camera.y,
        anchors.reduce((sum, anchor) => sum + anchor.groundZ, 0) / Math.max(1, anchors.length),
      ];
    }
    world.render(pose, ctx.canvas.clientWidth, ctx.canvas.clientHeight, devicePixelRatio);
    frames++;
    if (lastFrame) {
      frameTimes.push(now - lastFrame);
      if (previousAdmitted) admissionFrames.push(now - lastFrame);
      if (frameTimes.length > 4096) frameTimes.shift();
      if (admissionFrames.length > 4096) admissionFrames.shift();
    }
    previousAdmitted = world.stats().terrain.revision !== before;
    lastFrame = now;
    publish("landscape-traversal", true, {
      ...world.residencyStats(),
      terrain: world.stats().terrain,
    });
    requestAnimationFrame(draw);
  };
  Object.assign(window, {
    __landscapeTraversal: {
      cam: (x: number, y: number, zoom: number) => {
        camera = { x, y, zoom };
      },
      stats,
      cities: (selected: number, hidden: boolean) => {
        const city = cityInstances.find((item) => item.id === selected);
        world.setEntityFrame({
          ...cityFrame,
          entities: hidden
            ? []
            : cityInstances.map((item) => ({ ...item, selected: item.id === selected })),
          standards: hidden
            ? []
            : cityFrame.standards.map((item) => ({ ...item, selected: item.unitId === selected })),
          selections:
            !hidden && city
              ? [
                  {
                    x: city.x,
                    y: city.y,
                    z: city.z ?? 0,
                    radius: city.selectionRadius!,
                    color: SELECTION_GREEN,
                    kind: "city",
                  },
                ]
              : [],
        });
      },
      geography: (enabled: boolean) => {
        if (geographicInputs)
          world.setGeography(
            enabled
              ? geographicInputs
              : {
                  roadMeshVertices: new Float32Array(),
                  roadAnchors: new Float32Array(),
                  lineVertices: new Float32Array(),
                  borderVertices: new Float32Array(),
                },
          );
      },
      resetTiming: () => {
        frameTimes.length = 0;
        admissionFrames.length = 0;
        lastFrame = 0;
      },
    },
  });
  requestAnimationFrame(draw);
  window.addEventListener(
    "pagehide",
    () => {
      stopped = true;
      world.dispose();
    },
    { once: true },
  );
}
