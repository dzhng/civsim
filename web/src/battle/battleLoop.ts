import { SimClock } from "../shared/simClock";
import { mountBattleHud, type BattleHudHandle, type BattleHudState } from "../ui/hud/BattleHud";
import { createHudStore } from "../ui/hudStore";
import { installBattleDebugApi } from "./battleDebugApi";
import { createBattleMinimap } from "./battleMinimap";
import { BattleFreeze } from "./battleFreeze";
import { createBattleHudBridge, mountBattleModals, type BattleHudBridge } from "./battleHudBridge";
import { BATTLE_TICK_DT, createBattleWorld, type BattleConfig } from "./battleWorld";
import { buildBattleTerrain } from "./battleTerrain";
import { BattleUnitPresentation } from "./battleUnitPresentation";
import { BattleCrowd } from "./battleCrowd";
import { createBattleControls } from "./battleControls";

const MAX_TICKS_PER_FRAME = 4;

export function enterBattleScene(
  cfg: BattleConfig,
  cleanups: (() => void)[],
  restartBattle: () => void,
): (now: number) => void {
  const world = createBattleWorld(cfg, cleanups);
  const {
    audio: battleAudio,
    camera,
    cameraRig,
    canvas,
    game,
    renderer,
    signal,
    stride: STRIDE,
  } = world;
  const wasm = cfg.wasm;
  const unitInfo = world.unitInfo;
  const applyBattleCameraRig = cameraRig.apply;

  let handleToolbarCmd: (cmd: string) => void = () => {};
  let handleCardSelect: (unit: number, additive: boolean) => void = () => {};
  const battleHudStore = createHudStore<BattleHudState>({ info: null, fps: "", toolbar: null });
  const battleHud: BattleHudHandle = mountBattleHud(
    document.getElementById("battle-hud")!,
    battleHudStore,
    {
      onToolbarCmd: (cmd) => handleToolbarCmd(cmd),
      onCardSelect: (unit, additive) => handleCardSelect(unit, additive),
    },
  );
  let hudBridge: BattleHudBridge;
  cleanups.push(() => battleHud.destroy());

  const terrain = buildBattleTerrain(world);
  const generatedVistaForDebug = terrain.generatedVista;

  const battleMinimap = createBattleMinimap({
    canvas,
    camera,
    game,
    generatedMap: cfg.generatedMap ?? null,
    minimap: battleHud.minimapCanvas,
    signal,
    stride: STRIDE,
    unitInfo,
    wasm,
  });

  const unitPresentation = new BattleUnitPresentation(world);
  const crowd = new BattleCrowd(world, unitPresentation);
  let knownUnits = game.unit_count();

  const clock = new SimClock({
    tickHz: 1 / BATTLE_TICK_DT,
    maxTicksPerFrame: MAX_TICKS_PER_FRAME,
  });

  // --- Time control ------------------------------------------------------------
  const syncAudioSuspension = () => battleAudio.setSuspended(document.hidden || clock.frozen);
  const freeze = new BattleFreeze(clock, renderer, syncAudioSuspension);
  document.addEventListener("visibilitychange", syncAudioSuspension, { signal });
  syncAudioSuspension();
  // Absolute sim ticks driven so far (real-time loop + scripted advance). The
  // verify harness reads this to pin a snapshot to a fixed tick: idle men carry
  // a fidget sway that re-rolls every few ticks, so a stable pixel snapshot must
  // freeze at a known tick, not "whenever ~1s of wall-clock happened to land".
  let simTick = 0;
  const showGameover = mountBattleModals(world, cleanups, restartBattle);
  const controls = createBattleControls(world, clock, freeze);
  const { input, orders } = controls;
  handleCardSelect = controls.onCardSelect;
  hudBridge = createBattleHudBridge(
    battleHud,
    battleHudStore,
    {
      ...controls.toolbarCommands,
      victor: () => game.victor(),
      showGameover,
    },
    {
      classSpecs: crowd.classSpecs,
      clock,
      controls,
      input,
      world,
    },
  );
  handleToolbarCmd = hudBridge.onToolbarCmd;
  hudBridge.updateToolbar();

  // --- Main loop -----------------------------------------------------------------
  const banner = document.getElementById("banner")!;
  const selbox = document.getElementById("selbox")!;
  banner.style.display = "none";
  let lastFrame = performance.now();
  clock.advance(lastFrame);
  let tickMsAvg = 0;
  let audioUpdateMsAvg = 0;
  let fpsAvg = 60;
  let hudTimer = 0;

  const frame = (now: number) => {
    const frameDt = Math.min((now - lastFrame) / 1000, 0.25);
    lastFrame = now;
    fpsAvg += (1 / Math.max(frameDt, 1e-4) - fpsAvg) * 0.05;

    // Pan in the view's rotated frame so W/S/A/D track the screen at any yaw.
    applyBattleCameraRig();
    input.updateCamera(frameDt);
    const audioUpdateStart = performance.now();
    battleAudio.update(camera, frameDt, now / 1000);
    audioUpdateMsAvg += (performance.now() - audioUpdateStart - audioUpdateMsAvg) * 0.05;

    const ticks = clock.advance(now);
    if (ticks > 0) {
      const t0 = performance.now();
      game.advance_ticks(ticks);
      simTick += ticks;
      tickMsAvg += ((performance.now() - t0) / ticks - tickMsAvg) * 0.1;
    }

    // Reinforcements: campaign battles grow units mid-fight.
    if (game.unit_count() > knownUnits) {
      knownUnits = game.unit_count();
      terrain.refreshStatic();
      hudBridge.buildCards();
    }

    crowd.draw(simTick, clock.frozen, clock.alpha, frameDt, input.selected);
    renderer.drawTacticalLines(orders.tacticalLineFrame(controls.showPaths()), camera);

    // DOM selection rectangle.
    if (input.box) {
      selbox.style.display = "block";
      selbox.style.left = Math.min(input.box.x0, input.box.x1) + "px";
      selbox.style.top = Math.min(input.box.y0, input.box.y1) + "px";
      selbox.style.width = Math.abs(input.box.x1 - input.box.x0) + "px";
      selbox.style.height = Math.abs(input.box.y1 - input.box.y0) + "px";
    } else {
      selbox.style.display = "none";
    }

    hudBridge.tickCards();
    hudTimer += frameDt;
    if (hudTimer > 0.2) {
      hudTimer = 0;
      orders.tickGroupAttacks();
      hudBridge.updateHud(clock.frozen ? "fps —" : `fps ${fpsAvg.toFixed(0)}`);
      hudBridge.checkGameover();
      battleMinimap.drawMinimap();
    }
  };

  // --- Debug/verify API ------------------------------------------------------------
  // Snapshot mode: stop the sim and pin every wall-clock-driven pixel so
  // screenshots are reproducible (see snapshot.mjs). It must not OWN the pause
  // state (an unfreeze after a user pause should stay paused).
  const freezeAtTick = (target: number, options: { effects?: boolean } = {}) => {
    return freeze.freezeAtTick(
      target,
      () => simTick,
      (ticks) => {
        game.advance_ticks(ticks);
        simTick += ticks;
      },
      orders.tickGroupAttacks,
      options,
    );
  };
  installBattleDebugApi({
    audio: battleAudio,
    camera,
    canvas,
    game,
    generatedVista: generatedVistaForDebug,
    metrics: () => ({ tickMs: tickMsAvg, audioUpdateMs: audioUpdateMsAvg, fps: fpsAvg }),
    owners: {
      advance: (n) => {
        game.advance_ticks(n);
        simTick += n;
        orders.tickGroupAttacks();
      },
      freeze: (on) => freeze.doFreeze(on),
      freezeAtTick,
      groupAttack: orders.groupAttack,
      groupMove: orders.groupMove,
      previewDebug: orders.previewDebug,
      reviewFrame: (minx, miny, maxx, maxy, opts) =>
        cameraRig.reviewFrame(minx, miny, maxx, maxy, opts),
      reviewFrameClear: () => cameraRig.reviewFrameClear(),
      select: (unit) => {
        input.selected = unit >= 0 ? [unit] : [];
      },
      selected: () => input.selected.slice(),
      soldierStartOf: controls.soldierStartOf,
      terrainDebug: battleMinimap.terrainDebug,
      tickCount: () => simTick,
    },
    renderer,
    stride: STRIDE,
    unitInfo,
    wasm,
  });
  return frame;
}
