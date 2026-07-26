// /renderer/living-meadow (slice 00): production PhotorealBattleWorld grass
// fixture for the living-meadow visual slices. Determinism: every animated term
// reads PhotorealWorld.uTime via world.setTime(); the TSL time node is banned.
import { PhotorealBattleWorld } from "../../../packages/photoreal-renderer/src/battle/battleWorld";
import { seaDisplacementSourceFromParam } from "../../../packages/photoreal-renderer/src/battle/seaLayer";
import { createPhotorealStatsPublisher } from "../../../packages/photoreal-renderer/src/stats";
import { Camera } from "../../../web/src/shared/camera";
import { DEFAULT_BATTLE_ENVIRONMENT } from "../../../packages/game-renderer/src/environment/environment";
import {
  BATTLE_RELIEF_EXAGGERATION,
  terrainHeightField,
  type BattleTerrainGrid,
} from "../../../packages/game-renderer/src/battle/terrainFeatures";
import {
  terrainHeightAt,
  type TerrainHeightField,
} from "../../../packages/game-renderer/src/terrain/heightField";

interface LivingMeadowContext {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  params: URLSearchParams;
}

type Crop = "close" | "vista";

interface CropPreset {
  crop: Crop;
  zoom: number;
  cx: number;
  cy: number;
  pitchOverride: number | null;
}

const CROP_PRESETS: Record<Crop, CropPreset> = {
  close: {
    crop: "close",
    // Ratified blade-field close-gate zoom (shared with /renderer/blade-field):
    // foreground blades read at the anatomy scale on the capture viewport.
    zoom: 7.86,
    cx: 0,
    cy: -650,
    pitchOverride: null,
  },
  vista: {
    crop: "vista",
    zoom: 5.2,
    cx: 0,
    cy: -470,
    // Same QA override pattern as photorealBattleRoute's ?pitch= knob: camera3d
    // remains the projection owner, this only selects the fixed horizon crop.
    pitchOverride: 0.21,
  },
};

const EMPTY_F32 = new Float32Array();
const EMPTY_U8 = new Uint8Array();

export async function routeLivingMeadow(ctx: LivingMeadowContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const crop = cropParam(ctx.params);
  const preset = CROP_PRESETS[crop];
  const impl = ctx.params.get("impl") || "evolve";
  const fixedT = fixedSeconds(ctx.params);
  const mapIndex = 0;
  const [{ default: initWasm, Game }, world] = await Promise.all([
    import("../../../web/src/wasm/game_wasm.js"),
    PhotorealBattleWorld.create(ctx.canvas, {
      environment: ctx.params.get("env") ?? DEFAULT_BATTLE_ENVIRONMENT,
      shadows: ctx.params.get("shadows") ?? "single",
      sea: seaDisplacementSourceFromParam(ctx.params.get("sea")),
      post: ctx.params.get("post"),
    }),
  ]);
  const wasm = await initWasm();
  const game = new Game(0x5eed_c0de);
  game.start_battle(mapIndex);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = ctx.canvas.clientWidth || 1280;
  const cssH = ctx.canvas.clientHeight || 800;
  world.resize(cssW, cssH, dpr);

  const grid = readTerrainGrid(game, wasm.memory.buffer);
  const field: TerrainHeightField = {
    ...terrainHeightField(grid),
    verticalScale: BATTLE_RELIEF_EXAGGERATION,
  };
  world.setStatic(new Uint32Array(0), [], []);
  world.setTerrain(grid.w, grid.h, grid.cell, grid.ox, grid.oy, grid.tint, grid.height, mapIndex);

  const camera = createCropCamera(ctx.canvas, grid, field, preset, cssW, cssH, dpr);

  (window as unknown as { __livingMeadowWorld?: PhotorealBattleWorld }).__livingMeadowWorld =
    world;

  const cameraSnapshot = () => {
    camera.clampView();
    const [x, y] = camera.viewCenter();
    const camera3d = camera.params();
    if (preset.pitchOverride !== null) camera3d.pitch = preset.pitchOverride;
    return { x, y, zoom: camera.zoom, zoomT: camera.zoomT, camera3d };
  };

  const publish = createPhotorealStatsPublisher(world.world, "living-meadow", () => {
    const stats = world.stats();
    const grass = stats.terrain?.grass;
    return {
      crop,
      impl,
      fixedTimeSeconds: fixedT,
      map: "A",
      productionGrassOwner: "PhotorealBattleWorld.PhotorealBladeFieldLayer",
      submittedTriangles: grass?.submittedTriangles ?? 0,
      grass,
      renderStats: stats,
      camera: cameraSnapshot(),
    };
  });

  const renderFrame = (now: number) => {
    world.setTime(fixedT);
    const snapshot = cameraSnapshot();
    world.draw(EMPTY_F32, EMPTY_F32, EMPTY_F32, EMPTY_F32, 0, snapshot, EMPTY_U8, 0, 0);
    world.render();
    const published = publish(now);
    const stats = world.stats();
    ctx.status.innerHTML = table({
      route: "living-meadow",
      crop,
      impl,
      time: fixedT.toFixed(3),
      environment: published.environment ?? "none",
      "grass records": stats.terrain?.grass.recordCount ?? 0,
      "grass tris": stats.terrain?.grass.submittedTriangles ?? 0,
      "draw calls": published.stats.drawCalls,
      "gpu ms": published.stats.gpuTimeMs?.toFixed(3) ?? "pending",
    });
    requestAnimationFrame(renderFrame);
  };
  requestAnimationFrame(renderFrame);
}

function cropParam(params: URLSearchParams): Crop {
  return params.get("crop") === "vista" ? "vista" : "close";
}

function fixedSeconds(params: URLSearchParams): number {
  const t = Number(params.get("t") ?? 0);
  return Number.isFinite(t) ? t : 0;
}

function readTerrainGrid(
  game: {
    terrain_w(): number;
    terrain_h(): number;
    terrain_cell(): number;
    terrain_origin_x(): number;
    terrain_origin_y(): number;
    terrain_tint_ptr(): number;
    terrain_height_ptr(): number;
  },
  buffer: ArrayBuffer,
): BattleTerrainGrid {
  const w = game.terrain_w();
  const h = game.terrain_h();
  return {
    w,
    h,
    cell: game.terrain_cell(),
    ox: game.terrain_origin_x(),
    oy: game.terrain_origin_y(),
    tint: new Uint8Array(new Uint8Array(buffer, game.terrain_tint_ptr(), w * h)),
    height: new Float32Array(new Float32Array(buffer, game.terrain_height_ptr(), w * h)),
  };
}

function createCropCamera(
  canvas: HTMLCanvasElement,
  grid: BattleTerrainGrid,
  field: TerrainHeightField,
  preset: CropPreset,
  cssW: number,
  cssH: number,
  dpr: number,
): Camera {
  const camera = new Camera(canvas);
  const mapW = grid.w * grid.cell;
  const mapH = grid.h * grid.cell;
  camera.bounds = [grid.ox, grid.oy, grid.ox + mapW, grid.oy + mapH];
  camera.groundHeight = (x, y) => terrainHeightAt(field, x, y);
  const topDownCos = 0.95;
  const tacticalZoom = Math.min((cssW * dpr) / mapW, (cssH * dpr) / topDownCos / mapH);
  camera.setRig(
    { min: Math.max(0.4, tacticalZoom), max: Math.max(8, tacticalZoom * 6) },
    { width: mapW, height: mapH },
  );
  camera.zoom = preset.zoom;
  camera.setViewCenter(preset.cx, preset.cy);
  camera.clampView();
  return camera;
}

function table(values: Record<string, string | number>): string {
  return `<table>${Object.entries(values)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
    .join("")}</table>`;
}

/** URL-derived values (?impl=, ?env=) flow into this table — escape like the
 *  other lab status tables do. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
