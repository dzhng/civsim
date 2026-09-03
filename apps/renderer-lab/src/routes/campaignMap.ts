import { CampaignCloudPass } from "@packages/game-renderer/src/campaign/atmospherePass";
import { buildCampaignMapDrawData, CampaignLabelPass, CampaignMapPass, CampaignRoadPass, CampaignWorldLinePass } from "@packages/game-renderer/src/campaign/mapPass";
import { campaignBorderVertices, CampaignTerritoryPass } from "@packages/game-renderer/src/campaign/territoryPass";
import { loadCampaignData } from "../../../../web/src/campaign/data";
import { campaignSurface } from "../../../../web/src/campaign/surface";
import { TerrainField } from "../../../../web/src/campaign/terrain";
import { Territory } from "../../../../web/src/campaign/territory";
import { readCampaignViews } from "../../../../web/src/campaign/views";
import { campaignFactionLabels, campaignPresetCamera } from "../labCampaign";
import { type LabContext, chartSnapshot, createCampaignShell, numberParam, publish, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  const [{ default: initWasm, Campaign }, { data, mapJson }] = await Promise.all([
    import("../../../../web/src/wasm/game_wasm.js"),
    loadCampaignData(),
  ]);
  const wasm = await initWasm();
  const campaign = new Campaign(mapJson, 0x5eed_2026, 0);
  const views = readCampaignViews(campaign, wasm);
  const field = new TerrainField(data);
  const surface = campaignSurface(field);
  const territoryData = new Territory(data, field);
  territoryData.rebuild(views.cities);
  const preset = ctx.params.get("preset") ?? "whole";
  const camera = campaignPresetCamera(preset);
  const shell = await createCampaignShell(ctx.canvas, camera);
  // The sea shimmer rides cam.time (pitch-gated); snap at a fixed t for deterministic
  // shots (default 0 = the still painted chart, matching production snapshots).
  shell.setTime(numberParam(ctx.params, "t", 0));
  const map = new CampaignMapPass(shell, data.bg, data.bgRect, { seaTintMix: 1 }, surface.mesh);
  const clouds = new CampaignCloudPass(shell, data.bgRect);
  const territory = new CampaignTerritoryPass(
    shell,
    {
      width: field.w,
      height: field.h,
      rgba: territoryData.rgba,
      rect: data.bgRect,
    },
    map.drawnCoast,
    undefined,
    surface.mesh,
  );
  const lines = new CampaignWorldLinePass(shell, "triangle-list");
  const roads = new CampaignRoadPass(shell);
  const borders = new CampaignWorldLinePass(shell);
  const labelPass = new CampaignLabelPass(shell);
  const drawData = buildCampaignMapDrawData(data, {
    roadScale: 0.78,
    // Same sampler split as production (web/src/campaign/renderer.ts): the
    // coarse area statistic fits sea labels, the full-res mask culls roads.
    surfaceAt: (x, y) => (surface.landAt(x, y, 10.5) ? "land" : "water"),
    roadSurfaceAt: (x, y) => (field.renderLandAt(x, y) ? "land" : "water"),
    heightAt: surface.heightAt,
  });
  lines.upload(drawData.lineVertices);
  roads.upload(drawData.roadMeshVertices);
  borders.upload(campaignBorderVertices(territoryData.borders));
  const labels = drawData.labels.concat(campaignFactionLabels(territoryData.labels));
  const labelLayer = labelPass.upload(labels, chartSnapshot(camera, shell));
  shell.drawFrame({
    clear: { r: 0.68, g: 0.72, b: 0.69, a: 1 },
    passes: [
      {
        id: "campaign-map-surface",
        role: "world-depth-fill",
        phase: "world-depth",
        depth: "write",
        draw: (pass) => map.draw(pass),
      },
      {
        id: "campaign-territory-wash",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => territory.draw(pass),
      },
      {
        id: "campaign-borders",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => borders.draw(pass),
      },
      {
        id: "campaign-roads",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => roads.draw(pass),
      },
      {
        id: "campaign-sea-lanes-depth",
        role: "world-decal",
        phase: "world-depth",
        depth: "read",
        draw: (pass) => lines.draw(pass),
      },
      {
        id: "campaign-clouds",
        role: "overlay-effect",
        phase: "overlay",
        draw: (pass) => clouds.draw(pass),
      },
      {
        id: "campaign-labels",
        role: "overlay-ui",
        phase: "overlay",
        draw: (pass) => labelPass.draw(pass),
      },
    ],
  });
  ctx.status.innerHTML = reportTable({
    route: "campaign-map",
    preset,
    roads: drawData.stats.roads,
    seaLanes: drawData.stats.seaLanes,
    labels: `${labelLayer.visibleLabels}/${labelLayer.labels}`,
    factions: territoryData.labels.length,
    borders: borders.stats().segments,
    water: 0,
    clouds: clouds.stats().cloudQuads,
    visibleLabels: labelLayer.visibleLabels,
    labelLayer: "raw WebGPU glyph atlas",
    renderer: "raw WebGPU map + territory + atmosphere + labels",
  });
  publish("campaign-map", true, {
    ...drawData.stats,
    preset,
    camera,
    cameraContract: shell.stats().cameraContract,
    labels: labelLayer.labels,
    visibleLabels: labelLayer.visibleLabels,
    collisionCulls: labelLayer.collisionCulls,
    collisionCulledLabels: labelLayer.collisionCulledLabels,
    factions: territoryData.labels.length,
    territoryPixels: territory.stats().pixels,
    borderSegments: borders.stats().segments,
    waterFeatures: 0,
    waterLayer: "map-sea-mask",
    cloudQuads: clouds.stats().cloudQuads,
    labelAtlas: `${labelLayer.atlasWidth}x${labelLayer.atlasHeight}`,
    labelVertices: labelLayer.vertices,
    lineSegments: lines.stats().segments,
    roadTriangles: roads.stats().triangles,
    labelLayer: "raw-gpu-glyph-atlas",
    territoryLayer: "raw-gpu-texture",
    atmosphereLayer: "raw-gpu-clouds",
    postCutoverScreenshots: "renderer-only",
  });
}
