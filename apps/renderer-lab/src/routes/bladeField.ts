import { BATTLE_RELIEF_EXAGGERATION, terrainHeightField } from "@packages/game-renderer/src/battle/terrainFeatures";
import { readBattleTerrainGrid } from "@packages/game-renderer/src/battle/terrainGrid";
import { sampleGrassField } from "@packages/game-renderer/src/battle/grassField";
import { eyePosition } from "@packages/renderer-core/src/camera3d";
import { PhotorealBattleWorld } from "@packages/photoreal-renderer/src/battle/battleWorld";
import { PhotorealBladeFieldLayer } from "@packages/photoreal-renderer/src/battle/bladeFieldLayer";
import { createPhotorealStatsPublisher } from "@packages/photoreal-renderer/src/stats";
import { seaDisplacementSourceFromParam } from "@packages/photoreal-renderer/src/battle/seaLayer";
import { Camera } from "../../../../web/src/shared/camera";
import { type LabContext, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const [{ default: initWasm, Game }, world] = await Promise.all([
    import("../../../../web/src/wasm/game_wasm.js"),
    PhotorealBattleWorld.create(ctx.canvas, {
      environment: ctx.params.get("env") ?? "overcast-foggy",
      shadows: ctx.params.get("shadows") ?? "off",
      sea: seaDisplacementSourceFromParam(ctx.params.get("sea")),
      post: ctx.params.get("post") ?? "off",
    }),
  ]);
  const wasm = await initWasm();
  (window as unknown as { __bladeFieldWorld?: PhotorealBattleWorld }).__bladeFieldWorld = world;
  const game = new Game(0x5eed_c0de);
  game.start_battle(ctx.params.get("map") === "B" ? 1 : 0);
  const ticks = Math.max(0, Math.floor(Number(ctx.params.get("ticks") ?? 60)));
  if (ticks > 0) game.advance_ticks(ticks);
  const wasmMapId = ctx.params.get("map") === "B" ? 1 : 0;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = ctx.canvas.clientWidth || 1280;
  const cssH = ctx.canvas.clientHeight || 800;
  world.resize(cssW, cssH, dpr);

  const grid = readBattleTerrainGrid(game, wasm.memory);
  const field = { ...terrainHeightField(grid), verticalScale: BATTLE_RELIEF_EXAGGERATION };
  world.setStatic(new Uint32Array(0), [], []);
  world.setTerrain(grid, { wasmMapId });

  const camera = new Camera(ctx.canvas);
  const mapW = grid.w * grid.cell;
  const mapH = grid.h * grid.cell;
  camera.bounds = [grid.ox, grid.oy, grid.ox + mapW, grid.oy + mapH];
  const topDownCos = 0.95;
  const tacticalZoom = Math.min((cssW * dpr) / mapW, (cssH * dpr) / topDownCos / mapH);
  camera.setRig(
    { min: Math.max(0.4, tacticalZoom), max: Math.max(8, tacticalZoom * 6) },
    { width: mapW, height: mapH },
  );
  camera.zoom = Number(ctx.params.get("zoom")) || 7.86;
  if (ctx.params.has("camYaw")) camera.yaw = Number(ctx.params.get("camYaw")) || 0;
  const cx = Number(ctx.params.get("cx")) || 0;
  const cy = ctx.params.has("cy") ? Number(ctx.params.get("cy")) : -650;
  const camDx = Number(ctx.params.get("camDx") ?? 0) || 0;
  const camDy = Number(ctx.params.get("camDy") ?? 0) || 0;
  camera.setViewCenter(cx + camDx, cy + camDy);
  camera.clampView();
  // Lab records cover the looked-at corridor (view-centre disc): on the shallow
  // close-gate rig only a target-centred disc reaches from the foreground to the
  // look point, so the whole frame carries grass. LOD bands off the eye
  // footprint (routeGpu anchor below); the production look-target anchor and its
  // far-LOD / near-eye edge treatments are fenced production-only in the blade
  // material so the lab keeps its fine tall clumped envelope.
  const [focusX, focusY] = camera.viewCenter();

  const grassOff =
    ctx.params.get("grass") === "off" ||
    ctx.params.get("bladeField") === "off" ||
    ctx.params.get("layer") === "off";
  const radius = Number(ctx.params.get("radius")) || 64;
  const snapshot = sampleGrassField(grid, field, {
    seed: 0x5ea7_2026,
    focus: { x: focusX, y: focusY, radius },
    fieldCellSize: Number(ctx.params.get("fieldCell")) || 0.42,
    snapCellSize: Number(ctx.params.get("snapCell")) || 8,
    clumpCellSize: Number(ctx.params.get("clumpCell")) || 1.55,
    // Defaults are the oracle-accepted close-gate profile.
    maxRecords: Math.max(0, Math.floor(Number(ctx.params.get("maxRecords")) || 40000)),
    // 0.42: David's width contract - finer strands, lower density read as grass
    // at close range instead of an over-packed stipple carpet. 0.8 packed the
    // foreground into a high-frequency mat (raw-edge-stipple).
    density: Number(ctx.params.get("density")) || 0.42,
    jitter: 0.72,
    minNormalZ: 0.45,
    lodNearRadius: 5 / radius,
    lodMidRadius: 20 / radius,
    baseHeight: Number(ctx.params.get("bladeHeight")) || 1.25,
    heightJitter: Number(ctx.params.get("heightJitter")) || 0.5,
    baseWidth: Number(ctx.params.get("bladeWidth")) || 0.13,
    widthJitter: 0.22,
    baseBend: Number(ctx.params.get("baseBend")) || 0.45,
    bendJitter: Number(ctx.params.get("bendJitter")) || 0.35,
  });

  const bladeField = new PhotorealBladeFieldLayer(world.world.scene);
  bladeField.applyPackedRecords(snapshot.packedRecords, !grassOff);
  world.setGrassVisible(false);

  const cameraSnapshot = () => {
    const [x, y] = camera.viewCenter();
    return { x, y, zoom: camera.zoom, zoomT: camera.zoomT, camera3d: camera.params() };
  };
  const empty = new Float32Array();
  const renderFrame = (now: number) => {
    const seconds = ctx.params.has("t") ? Number(ctx.params.get("t")) || 0 : 0;
    world.setTime(seconds);
    camera.clampView();
    const frameCamera = cameraSnapshot();
    world.draw(empty, empty, empty, empty, 0, frameCamera, new Uint8Array(), ticks);
    world.setGrassVisible(false);
    bladeField.setVisible(!grassOff);
    const labEye = eyePosition(frameCamera.camera3d);
    bladeField.routeGpu(world.world.renderer, labEye, [labEye[0], labEye[1]]);
    world.render();
    const published = publishFrame(now);
    ctx.status.innerHTML = reportTable({
      route: "blade-field",
      substrate: published.substrate,
      environment: published.environment,
      records: snapshot.stats.acceptedRecords,
      lod: snapshot.stats.lodCounts.join("/"),
      drawCalls: bladeField.stats().drawCalls,
      triangles: bladeField.stats().submittedTriangles,
      snap: `${snapshot.stats.snapX}, ${snapshot.stats.snapY}`,
      hash: bladeField.stats().recordHash,
      layer: grassOff ? "off" : "on",
    });
    requestAnimationFrame(renderFrame);
  };
  const publishFrame = createBladeFieldPublisher(world, () => ({
    route: "blade-field",
    map: ctx.params.get("map") === "B" ? "B" : "A",
    fixture: "sim-tint",
    productionBattleIntegration: false,
    closeGateCompatible: true,
    layerDisabled: grassOff,
    camera: cameraSnapshot(),
    sample: snapshot.stats,
    bladeField: bladeField.stats(),
    renderStats: world.stats(),
  }));
  requestAnimationFrame(renderFrame);
}

function createBladeFieldPublisher(
  world: PhotorealBattleWorld,
  counts: () => Record<string, unknown>,
) {
  return createPhotorealStatsPublisher(world.world, "blade-field", counts);
}
