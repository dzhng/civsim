import { TerrainAllocationBudget } from "@packages/photoreal-renderer/src/campaign/tiledTerrain";
import { PhotorealCampaignWorld } from "@packages/photoreal-renderer/src/campaign/campaignWorld";
import { createTerrainTiles } from "@packages/photoreal-renderer/src/campaign/terrainTiles";
import {
  terrainViewRequests,
  TERRAIN_DETAIL_LIMIT,
} from "@packages/photoreal-renderer/src/campaign/terrainView";
import { createCampaignTerrainWorker } from "@packages/photoreal-renderer/src/campaign/terrainWorker";
import { campaignLandscapeAllocation } from "@packages/game-renderer/src/terrain/campaignLandscape";
import { snapshotCampaignLandscape } from "@packages/game-renderer/src/terrain/campaignSource";
import { createRenderedSurface } from "@packages/game-renderer/src/terrain/surface";
import { chartCamera3d } from "@packages/renderer-core/src/camera3d";
import { TerrainField } from "../../../../web/src/campaign/terrain";
import { loadCampaignData } from "../../../../web/src/campaign/data";
import { type LabContext, publish } from "../labShell";

/** Real source and production composition owner; the route only drives its camera. */
export async function route(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const field = new TerrainField((await loadCampaignData()).data);
  const source = snapshotCampaignLandscape(field);
  const sourceBytes =
    source.height.byteLength + source.biome.byteLength + source.renderMask.classes.byteLength;
  const minX = Math.floor(source.renderMask.rect.min[0] / 128) * 128;
  const minY = Math.floor(source.renderMask.rect.min[1] / 128) * 128;
  const size =
    Math.ceil(
      Math.max(source.renderMask.rect.max[0] - minX, source.renderMask.rect.max[1] - minY) / 128,
    ) * 128;
  const bootAllocation = campaignLandscapeAllocation(size / 2, 16);
  const allocation = new TerrainAllocationBudget();
  allocation.reserve(bootAllocation.typedArrayBytes);
  const worker = createCampaignTerrainWorker(source);
  const coarse = await worker.build({ key: "overview", minX, minY, size, cell: 16 });
  const surface = createRenderedSurface(coarse.mesh, coarse.domain, "overview");
  const world = await PhotorealCampaignWorld.create(ctx.canvas, {
    surface,
    terrainAllocation: { budget: allocation, sourceBuffers: [coarse.shoreDistance.buffer] },
    objects: [],
    roads: new Float32Array(),
    territory: [0.48, 0.48, 0.35],
    fogAt: () => 0,
  });
  let camera = { x: -100, y: 250, zoom: 0.16 };
  let builds = 0,
    frames = 0,
    stopped = false,
    workerRoundTripMs = 0;
  let lastFrame = 0,
    previousAdmitted = false;
  const frameTimes: number[] = [],
    admissionFrames: number[] = [];
  const scheduler = createTerrainTiles({
    maxTiles: TERRAIN_DETAIL_LIMIT,
    build: async (request) => {
      const bound =
        world.stats().terrain.allocationBytes +
        campaignLandscapeAllocation(request.size / 2, request.cell).typedArrayBytes;
      allocation.reserve(bound);
      builds++;
      const started = performance.now();
      const result = await worker.build(request);
      workerRoundTripMs = performance.now() - started;
      return result;
    },
    install: (tile, evicted) => world.installTerrain(tile, evicted),
  });
  const stats = () => {
    const tiles = scheduler.snapshot(),
      terrain = world.stats().terrain;
    const wanted = terrainViewRequests(
      { ...camera, width: ctx.canvas.clientWidth, height: ctx.canvas.clientHeight },
      coarse.domain,
    );
    return {
      ...tiles,
      ...terrain,
      camera,
      frames,
      builds,
      workerCount: 1,
      workerRoundTripMs,
      ready: wanted.every((r) => tiles.residentKeys.includes(r.key)),
      peakTotalTerrainBytes: Math.max(allocation.peakBytes, terrain.allocationBytes),
      sourceBytes: sourceBytes * 2,
      sceneryInstances: 0,
      sceneryRenderedBytes: 0,
      frameTimes: [...frameTimes],
      admissionFrames: [...admissionFrames],
      renderer: world.stats(),
    };
  };
  const draw = (now: number) => {
    if (stopped) return;
    const before = world.stats().terrain.revision;
    scheduler.setDesired(
      terrainViewRequests(
        { ...camera, width: ctx.canvas.clientWidth, height: ctx.canvas.clientHeight },
        coarse.domain,
      ),
    );
    scheduler.tick();
    const pose = chartCamera3d({ ...camera, pitch: 0.55 }, ctx.canvas.clientHeight);
    pose.aspect = ctx.canvas.clientWidth / ctx.canvas.clientHeight;
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
    publish("landscape-traversal", true, { builds, terrain: world.stats().terrain, sourceBytes });
    requestAnimationFrame(draw);
  };
  Object.assign(window, {
    __landscapeTraversal: {
      cam: (x: number, y: number, zoom: number) => {
        camera = { x, y, zoom };
      },
      stats,
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
      scheduler.dispose();
      worker.dispose();
      world.dispose();
    },
    { once: true },
  );
}
