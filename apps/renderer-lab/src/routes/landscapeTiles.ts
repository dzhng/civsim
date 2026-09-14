import * as THREE from "three/webgpu";
import { vec3 } from "three/tsl";
import { PhotorealWorld } from "@packages/photoreal-renderer/src/world";
import { applyCivsimEnvironment } from "@packages/photoreal-renderer/src/environment";
import { applyCamera3d } from "@packages/photoreal-renderer/src/cameraBridge";
import { createLandscapeFrameUniforms } from "@packages/photoreal-renderer/src/landscape/shaderNodes";
import { PhotorealTiledTerrain } from "@packages/photoreal-renderer/src/campaign/tiledTerrain";
import {
  createTerrainTiles,
  type TerrainTileRequest,
} from "@packages/photoreal-renderer/src/campaign/terrainTiles";
import { CIVSIM_ENVIRONMENTS } from "@packages/game-renderer/src/environment/environment";
import { buildCampaignLandscape } from "@packages/game-renderer/src/terrain/campaignLandscape";
import { chartCamera3d, screenRay } from "@packages/renderer-core/src/camera3d";
import { createCampaignTerrainWorker } from "@packages/photoreal-renderer/src/campaign/terrainWorker";
import {
  campaignLandscapeSource,
  snapshotCampaignLandscape,
} from "@packages/game-renderer/src/terrain/campaignSource";
import { coastalRidgeFixture } from "./landscapeFixtures";
import { type LabContext, publish } from "../labShell";

export async function route(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const fixture = coastalRidgeFixture();
  const width = 328,
    land = new Uint8Array(width * width);
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++)
      land[y * width + x] = fixture.renderLandAt(x - 164 + 0.5, 164 - y - 0.5) ? 1 : 0;
  const field = campaignLandscapeSource({
    ...fixture,
    renderMask: { width, height: width, land, rect: { min: [-164, -164], max: [164, 164] } },
  });
  const worker = createCampaignTerrainWorker(snapshotCampaignLandscape(field));
  const coarse = buildCampaignLandscape(field, [0, 0], 128, 8);
  const world = await PhotorealWorld.create(ctx.canvas);
  const frame = createLandscapeFrameUniforms();
  applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden, {
    aerialObserver: vec3(frame.focus, 0),
  });
  const terrain = new PhotorealTiledTerrain(world.scene, frame, coarse.surface);
  const camera = new THREE.PerspectiveCamera();
  const requests: TerrainTileRequest[] = [
    [-128, -128],
    [0, -128],
    [-128, 0],
    [0, 0],
  ].map(([minX, minY], i) => ({ key: `fixture-${i}`, minX, minY, size: 128, cell: 2 }));
  let workerRoundTripMs = 0;
  let builds = 0,
    draws = 0,
    stopped = false;
  let desired: TerrainTileRequest[] = [];
  const scheduler = createTerrainTiles({
    maxTiles: 3,
    build: async (request) => {
      builds++;
      const started = performance.now();
      const tile = await worker.build(request);
      workerRoundTripMs = performance.now() - started;
      return tile;
    },
    install: (tile, evictions) => terrain.install(tile, evictions),
  });
  const stage = (n: number) => {
    desired =
      n === 0
        ? []
        : n === 1
          ? [requests[0]]
          : n === 2
            ? requests.slice(0, 3)
            : n === 3
              ? requests.slice(1)
              : requests.slice(0, 3);
    scheduler.setDesired(desired);
  };
  const stats = () => {
    const state = scheduler.snapshot();
    return {
      ...state,
      ...terrain.stats(),
      builds,
      workerRoundTripMs,
      draws,
      ready: desired.every((r) => state.residentKeys.includes(r.key)),
    };
  };
  const draw = () => {
    if (stopped) return;
    scheduler.tick();
    draws++;
    const width = ctx.canvas.clientWidth,
      height = ctx.canvas.clientHeight;
    world.resize(width, height, 1);
    const pose = chartCamera3d({ x: 0, y: 0, zoom: 3, pitch: 0.55 }, height);
    pose.aspect = width / height;
    pose.target = [0, 0, 20];
    applyCamera3d(camera, pose);
    world.setTime(0);
    world.render(camera);
    publish("landscape-tiles", true, {
      ...stats(),
      centerRay: terrain.surface.raycastRendered(screenRay(pose, 0, 0)),
      ...world.stats(),
    });
    requestAnimationFrame(draw);
  };
  Object.assign(window, { __landscapeTiles: { stage, stats } });
  for (const [i, label] of [
    "Request none",
    "Request first tile",
    "Request three tiles",
    "Replace oldest",
    "Return",
  ].entries()) {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => stage(i);
    ctx.status.append(button);
  }
  stage(0);
  draw();
  window.addEventListener(
    "pagehide",
    () => {
      stopped = true;
      scheduler.dispose();
      worker.dispose();
      terrain.dispose();
      world.dispose();
    },
    { once: true },
  );
}
