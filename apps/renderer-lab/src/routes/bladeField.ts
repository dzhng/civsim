import { readBattleTerrainGrid } from "../../../../packages/game-renderer/src/battle/terrainGrid";
import { productionBladeFieldProfile } from "../../../../packages/game-renderer/src/battle/battleGrassResidency";
import { BattlePreview, startBattlePreviewLoop } from "../battlePreview";
import { Camera } from "../../../../web/src/shared/camera";
import { type LabContext, reportTable } from "../labShell";

export async function route(ctx: LabContext) {
  if (ctx.params.get("ref") === "1") ctx.root.classList.add("reference-shot");
  const profile = { ...productionBladeFieldProfile(), source: "TypeGPU grass review" };
  const parameters = {
    radius: "closeVisibleRadiusM",
    fieldCell: "fieldCellSize",
    snapCell: "snapCellSize",
    clumpCell: "clumpCellSize",
    maxRecords: "maxRecords",
    density: "density",
    bladeHeight: "baseHeight",
    heightJitter: "heightJitter",
    bladeWidth: "baseWidth",
    baseBend: "baseBend",
    bendJitter: "bendJitter",
  } as const;
  for (const [query, property] of Object.entries(parameters)) {
    if (!ctx.params.has(query)) continue;
    const value = Number(ctx.params.get(query));
    if (!Number.isFinite(value) || value < 0) throw Error(`Invalid grass ${query}`);
    profile[property] = value;
  }
  const { default: initWasm, Game } = await import("../../../../web/src/wasm/game_wasm.js");
  const wasm = await initWasm();
  const world = await BattlePreview.create(ctx.canvas, {
    grassProfile: profile,
    environment: ctx.params.get("env") ?? "overcast-foggy",
    shadows: ctx.params.get("shadows") ?? "off",
    post: ctx.params.get("post") ?? "off",
  });
  const game = new Game(0x5eed_c0de);
  try {
    (window as unknown as { __bladeFieldWorld?: BattlePreview }).__bladeFieldWorld = world;
    game.start_battle(ctx.params.get("map") === "B" ? 1 : 0);
    const ticks = Math.max(0, Math.floor(Number(ctx.params.get("ticks") ?? 60)));
    if (ticks > 0) game.advance_ticks(ticks);
    const wasmMapId = ctx.params.get("map") === "B" ? 1 : 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = ctx.canvas.clientWidth || 1280;
    const cssH = ctx.canvas.clientHeight || 800;
    await world.resize(cssW, cssH, dpr);

    const grid = readBattleTerrainGrid(game, wasm.memory);
    world.setStatic(new Uint32Array(0), [], []);
    await world.setTerrain(grid, { wasmMapId });

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
    const grassOff =
      ctx.params.get("grass") === "off" ||
      ctx.params.get("bladeField") === "off" ||
      ctx.params.get("layer") === "off";
    world.setGrassVisible(!grassOff);

    const cameraSnapshot = () => {
      const [x, y] = camera.viewCenter();
      return { x, y, zoom: camera.zoom, zoomT: camera.zoomT, camera3d: camera.params() };
    };
    const empty = new Float32Array();
    const renderFrame = async () => {
      const seconds = ctx.params.has("t") ? Number(ctx.params.get("t")) || 0 : 0;
      world.setTime(seconds);
      camera.clampView();
      const frameCamera = cameraSnapshot();
      await world.draw(empty, empty, [], empty, 0, frameCamera);
      await world.render();
      const renderStats = world.stats();
      window.__rendererLabStats = {
        ok: true,
        route: "blade-field",
        ...renderStats,
        productionBattleIntegration: true,
        layerDisabled: grassOff,
        camera: frameCamera,
        profile,
        bladeField: renderStats.grass,
        renderStats,
      };
      window.__rendererLabReady = true;
      ctx.status.innerHTML = reportTable({
        route: "blade-field",
        substrate: renderStats.substrate,
        environment: renderStats.environment,
        layer: grassOff ? "off" : "on",
      });
    };
    startBattlePreviewLoop(
      world,
      renderFrame,
      (error) => {
        window.__rendererLabReady = true;
        window.__rendererLabStats = { ok: false, route: "blade-field", error: String(error) };
        ctx.status.textContent = String(error);
      },
      () => game.free(),
    );
  } catch (error) {
    game.free();
    world.dispose();
    throw error;
  }
}
