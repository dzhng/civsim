import {
  completeBattlePresentation,
  reportBattlePresentationFailure,
} from "./presentationCompletion";
import { fatalSurfaceFor, showFatalErrorSurface } from "../shared/fatalError";
import { captureBattleRenderCamera, type BattleRenderCamera } from "./battlePresentation";
import { applyBenchmarkCamera, sampleBenchmarkCamera } from "./benchmark/benchmarkCamera";
import { BENCHMARK_AUTHORITY } from "./benchmark/benchmarkAuthority";
import { BenchmarkRecording } from "./benchmark/benchmarkRecording";
import { createBenchmarkReport, type BenchmarkIdentity } from "./benchmark/benchmarkReport";
import { lockBenchmarkInput } from "./benchmark/benchmarkInput";
import { getGraphicsSettings } from "../shared/graphicsSettings";
import { BenchmarkRun } from "./benchmark/benchmarkRun";
import { mountBenchmarkPanel } from "./benchmark/benchmarkPanel";
import { awaitRendererReady } from "../shared/rendererReady";
import { mountBattleLoading } from "./battleLoading";
import { mountBattleHud, type BattleHudHandle, type BattleHudState } from "../ui/hud/BattleHud";
import { createHudStore } from "../ui/hudStore";
import { installBattleDebugApi, type BattleLoopFrameMetrics } from "./battleDebugApi";
import { createBattleMinimap } from "./battleMinimap";
import { BattleFreeze } from "./battleFreeze";
import { BattleSimTime } from "./battleSimTime";
import { createBattleHudBridge, mountBattleModals, type BattleHudBridge } from "./battleHudBridge";
import { createBattleWorld, type BattleConfig } from "./battleWorld";
import type { BattleSimClient } from "./sim/battleSimClient";
import { buildBattleTerrain } from "./battleTerrain";
import { BattleUnitPresentation } from "./battleUnitPresentation";
import { BattleCrowd } from "./battleCrowd";
import { createBattleControls } from "./battleControls";

/** The battle scene's frame coordinator.
 *
 * It owns no simulation. The authority publishes completed ticks on its own
 * cadence; this loop consumes every one of them as it lands and draws whenever the
 * browser gives it a frame. The two rates are deliberately unrelated: a slow tick
 * cannot stall the camera, and a skipped draw cannot skip a tick's transitions. */
export function enterBattleScene(
  cfg: BattleConfig,
  sim: BattleSimClient,
  cleanups: (() => void)[],
  restartBattle: () => void,
  sceneSignal: AbortSignal,
): (now: number) => void | Promise<void> {
  window.__ready = false;
  const loading = mountBattleLoading(cfg.onExit, sceneSignal);
  let frame: (now: number) => void | Promise<void> = () => {};
  let startupFailure: unknown = null;

  const canvasOf = () => document.getElementById("battlefield") as HTMLCanvasElement;
  const reportStartupFailure = (error: unknown) => {
    if (sceneSignal.aborted || startupFailure !== null) return;
    startupFailure = error;
    frame = () => {};
    loading.remove();
    const message = error instanceof Error ? error.message : String(error);
    showFatalErrorSurface(canvasOf(), fatalSurfaceFor("submission", message));
  };

  // The renderer's environment, terrain and opening framing all come from the map
  // the authority actually built, so the scene is assembled on its first
  // publication rather than guessed at before it.
  void sim.firstPublication
    .then(() => {
      if (sceneSignal.aborted) return;
      frame = buildBattleScene(cfg, sim, cleanups, restartBattle, sceneSignal, loading);
    })
    .catch(reportStartupFailure);

  return (now) => frame(now);
}

function buildBattleScene(
  cfg: BattleConfig,
  sim: BattleSimClient,
  cleanups: (() => void)[],
  restartBattle: () => void,
  sceneSignal: AbortSignal,
  loading: { remove(): void },
): (now: number) => void | Promise<void> {
  const world = createBattleWorld(cfg, sim, cleanups, sceneSignal);
  const { audio: battleAudio, camera, cameraRig, canvas, renderer, signal } = world;
  const STRIDE = world.stride;
  let rendererReady = false;
  let battleReady = false;
  let preparingFrame = false;
  awaitRendererReady(
    renderer.ready,
    canvas,
    () => {
      if (!signal.aborted) rendererReady = true;
    },
    signal,
    loading.remove,
  );
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
    certificates: sim.identity.generatedMapCertificates,
    generatedMap: world.generatedMap,
    minimap: battleHud.minimapCanvas,
    signal,
    stride: STRIDE,
    terrain: terrain.grid,
    unitCount: () => sim.unitCount(),
    unitInfo: world.unitInfo,
  });

  const unitPresentation = new BattleUnitPresentation(world);
  const crowd = new BattleCrowd(world, unitPresentation);
  let knownUnits = sim.unitCount();

  const time = new BattleSimTime(sim);

  // --- Time control ------------------------------------------------------------
  const syncSuspension = () => {
    time.setHidden(document.hidden);
    battleAudio.setSuspended(document.hidden || time.frozen);
  };
  const freeze = new BattleFreeze(time, renderer, syncSuspension, signal);
  document.addEventListener("visibilitychange", syncSuspension, { signal });
  syncSuspension();

  // Completed ticks consumed as they arrive, not as frames are drawn. A scripted
  // advance's intermediate publications are progress reports: the crowd takes the
  // completed result, exactly as it did when the shell ran those ticks itself.
  let ticksSincePresentedFrame = 0;
  let lastObservedTick = sim.tick();
  cleanups.push(
    sim.observe((tick) => {
      if (sim.preparing()) return;
      crowd.observeTick(tick);
      // A republished tick is the same tick with an accepted order in it, not a
      // tick the simulation advanced through.
      if (tick > lastObservedTick) ticksSincePresentedFrame += tick - lastObservedTick;
      lastObservedTick = tick;
    }),
  );

  const benchmark = cfg.benchmark
    ? new BenchmarkRun(cfg.benchmark, performance.now(), BENCHMARK_AUTHORITY)
    : null;
  const heldBenchmark = BENCHMARK_AUTHORITY.kind === "held" ? benchmark : null;
  const recording = benchmark ? new BenchmarkRecording(benchmark.scenario.durationMs) : null;
  let benchmarkIdentity: BenchmarkIdentity | null = null;
  let terminalBenchmarkReport: ReturnType<typeof createBenchmarkReport> | null = null;
  let preparationRequested = false;
  const benchmarkReport = () => {
    if (terminalBenchmarkReport) return terminalBenchmarkReport;
    const report = createBenchmarkReport(
      benchmark!.status(),
      benchmarkIdentity,
      recording!.samples(),
      recording!.firstFrame(),
      recording!.gpuSnapshot(),
      benchmark!.heldScope(),
    );
    if (!benchmark!.active) terminalBenchmarkReport = report;
    return report;
  };
  const cancelBenchmark = () => {
    sim.cancelScript();
    benchmark?.cancel(performance.now(), sim.tick());
  };
  const benchmarkPanel = benchmark
    ? mountBenchmarkPanel(benchmark, cancelBenchmark, signal, benchmarkReport)
    : null;
  if (benchmark) {
    const interrupted = () => {
      if (document.hidden)
        benchmark.fail("Interrupted — tab hidden", performance.now(), sim.tick());
    };
    document.addEventListener("visibilitychange", interrupted, { signal });
    interrupted();
    lockBenchmarkInput(signal, () => benchmarkPanel?.showCancel());
    window.addEventListener(
      "resize",
      () => {
        if (benchmark.status().phase === "running")
          benchmark.fail("Interrupted — viewport resized", performance.now(), sim.tick());
      },
      { signal },
    );
    cleanups.push(cancelBenchmark);
  }

  const showGameover = mountBattleModals(world, cleanups, restartBattle);
  const controls = createBattleControls(world, time, freeze);
  const { input, orders } = controls;
  handleCardSelect = controls.onCardSelect;
  hudBridge = createBattleHudBridge(
    battleHud,
    battleHudStore,
    {
      ...controls.toolbarCommands,
      victor: () => sim.victor(),
      showGameover,
    },
    {
      classSpecs: crowd.classSpecs,
      controls,
      input,
      time,
      world,
    },
  );
  handleToolbarCmd = hudBridge.onToolbarCmd;
  hudBridge.updateToolbar();

  let presentationFailed = false;
  const failPresentation = (error: unknown) => {
    presentationFailed = true;
    const message = error instanceof Error ? error.message : String(error);
    if (benchmark) benchmark.fail(message, performance.now(), sim.tick());
    else showFatalErrorSurface(canvas, fatalSurfaceFor("submission", message));
  };
  cleanups.push(
    sim.onFailure((error) => {
      if (signal.aborted) return;
      loading.remove();
      failPresentation(error);
    }),
  );

  // --- Main loop -----------------------------------------------------------------
  const banner = document.getElementById("banner")!;
  const selbox = document.getElementById("selbox")!;
  banner.style.display = "none";
  let lastFrame = performance.now();
  let tickMsAvg = 0;
  let audioUpdateMsAvg = 0;
  let fpsAvg = 60;
  let hudTimer = 0;
  let frameId = 0;
  let frameMetrics: BattleLoopFrameMetrics | null = null;
  let benchmarkViewReady = false;
  let benchmarkViewPending = false;

  const completeFrame = (
    now: number,
    intervalMs: number,
    ticks: number,
    simCpuMs: number,
    renderCpuMs: number,
    cpuStartedAt: number,
    renderAwaitMs = 0,
    asyncRenderCpuMs = 0,
    renderWallMs = renderCpuMs,
    presentedCamera: BattleRenderCamera = camera,
  ) => {
    if (signal.aborted) return;
    frameMetrics = {
      frameId: ++frameId,
      timestampMs: now,
      intervalMs,
      ready: battleReady,
      simTick: sim.tick(),
      ticksAdvanced: ticks,
      simCpuMs,
      renderCpuMs,
      renderAwaitMs,
      renderWallMs,
      loopCpuMs: performance.now() - cpuStartedAt - renderAwaitMs + asyncRenderCpuMs,
      renderer: renderer.frameMetrics(),
    };
    if (benchmark?.status().phase === "running") {
      const achieved = presentedCamera.params();
      const intended = sampleBenchmarkCamera(benchmark.elapsedAt(now));
      recording!.record(
        frameMetrics,
        {
          center: [achieved.target[0], achieved.target[1]],
          distance: achieved.distance,
          yaw: achieved.yaw,
          pitch: achieved.pitch,
        },
        intended.phase,
        intended,
      );
      recording!.collectGpu(renderer.gpuEventsSince(recording!.gpuEventCursor));
      benchmark.frame(now, sim.tick(), sim.victor(), sim.stateHash());
    }
  };

  const frame = (now: number): void | Promise<void> => {
    if (signal.aborted || presentationFailed) return;
    if (benchmark) {
      if (window.__gpuFatal) benchmark.fail(window.__gpuFatal.detail, now, sim.tick());
      if (!benchmark.active) {
        battleAudio.setSuspended(true);
        return;
      }
      if (time.paused || time.frozen || time.timeScale !== 1) {
        benchmark.fail("Interrupted — simulation speed or pause changed", now, sim.tick());
        return;
      }
    }
    if (!rendererReady) return;
    const cpuStartedAt = performance.now();
    const intervalMs = now - lastFrame;
    const frameDt = Math.min(intervalMs / 1000, 0.25);
    lastFrame = now;
    fpsAvg += (1 / Math.max(frameDt, 1e-4) - fpsAvg) * 0.05;

    // Pan in the view's rotated frame so W/S/A/D track the screen at any yaw.
    applyBattleCameraRig();
    const preparingBenchmark = benchmark?.status().phase === "preparing";
    if (benchmark && battleReady && preparingBenchmark) {
      // Preparation is the authority's scripted advance; this thread only watches
      // it arrive, so the loading window costs the main thread nothing.
      if (!preparationRequested) {
        preparationRequested = true;
        void sim.advanceTo(benchmark.scenario.startTick).catch(failPresentation);
      }
      if (sim.tick() < benchmark.scenario.startTick || benchmarkViewReady)
        benchmark.frame(now, sim.tick(), sim.victor(), sim.stateHash());
      if (benchmark.status().phase === "running") {
        recording!.start(now, renderer.gpuEventsSince(0)?.nextSequence ?? 0);
        time.setHolding(benchmark.holdsAuthority);
      }
    }
    if (benchmark?.status().phase === "running")
      applyBenchmarkCamera(camera, benchmark.elapsedAt(now));
    else if (!benchmark) input.updateCamera(frameDt);
    const audioUpdateStart = performance.now();
    battleAudio.update(camera, frameDt, now / 1000);
    audioUpdateMsAvg += (performance.now() - audioUpdateStart - audioUpdateMsAvg) * 0.05;

    if (preparingBenchmark && battleReady) {
      if (sim.tick() < benchmark!.scenario.startTick) {
        completeFrame(now, intervalMs, 0, 0, 0, cpuStartedAt);
        return;
      }
      applyBenchmarkCamera(camera, 0);
      if (!benchmarkIdentity) {
        benchmarkIdentity = {
          userAgent: navigator.userAgent,
          adapter: renderer.stats().device ?? "unknown",
          viewport: [innerWidth, innerHeight],
          framebuffer: [canvas.width, canvas.height],
          dpr: devicePixelRatio,
          initialStateHash: sim.stateHash(),
          soldiers: sim.soldierCount(),
          graphics: getGraphicsSettings(),
        };
      }
    }

    const telemetry = sim.telemetry(now);
    tickMsAvg += (telemetry.workerTickMs - tickMsAvg) * 0.1;
    const ticks = ticksSincePresentedFrame;
    ticksSincePresentedFrame = 0;

    // Reinforcements: campaign battles grow units mid-fight.
    if (sim.unitCount() > knownUnits) {
      knownUnits = sim.unitCount();
      terrain.refreshStatic();
      hudBridge.buildCards();
    }

    // Everything read out of the newest publication happens here, in one
    // uninterrupted window, so no consumer mixes records from two ticks.
    hudBridge.tickCards();
    hudTimer += frameDt;
    if (hudTimer > 0.2) {
      hudTimer = 0;
      orders.tickGroupAttacks();
      hudBridge.updateHud(time.frozen ? "fps —" : `fps ${fpsAvg.toFixed(0)}`);
      if (!benchmark) hudBridge.checkGameover();
      battleMinimap.drawMinimap();
    }

    const renderStartedAt = performance.now();
    // A held benchmark shares one elapsed visual clock between camera, poses and
    // environment; its bodies never leave the held tick.
    const presentedCrowd =
      heldBenchmark?.status().phase === "running"
        ? crowd.prepareHeld(heldBenchmark.elapsedAt(now) / 1000, frameDt, input.selected)
        : crowd.prepare(time.presentationTick(now), time.frozen, frameDt, input.selected);
    const packet = {
      timeSeconds:
        renderer.fixedTime ??
        (heldBenchmark ? heldBenchmark.elapsedAt(now) : performance.now()) / 1000,
      clock: heldBenchmark ? ("benchmark" as const) : ("wall" as const),
      fixedTime: renderer.fixedTime,
      preserveFrozenEffects: renderer.preserveFrozenEffects,
      crowd: presentedCrowd,
      camera: captureBattleRenderCamera(camera),
      tacticalLines: orders.tacticalLineFrame(controls.showPaths(), crowd.presented),
    };
    return completeBattlePresentation(
      renderStartedAt,
      signal,
      () =>
        renderer.present(packet, signal, () => {
          if (!preparingFrame) {
            preparingFrame = true;
            awaitRendererReady(
              renderer.settlePresentedFrame(signal),
              canvas,
              () => {
                battleReady = true;
                window.__ready = true;
                // The battle only starts running once it is actually on screen.
                // Benchmark preparation advances explicitly and must hold its
                // final tick until the contact frame is ready and timing begins.
                time.setHolding(benchmark?.holdsAuthority ?? false);
                loading.remove();
              },
              signal,
              loading.remove,
            );
          }
        }),
      (_receipt, timing) => {
        if (
          preparingBenchmark &&
          sim.tick() >= benchmark!.scenario.startTick &&
          !benchmarkViewPending
        ) {
          benchmarkViewPending = true;
          awaitRendererReady(
            renderer.settlePresentedFrame(signal),
            canvas,
            () => {
              benchmarkViewReady = true;
            },
            signal,
          );
        }

        const { renderCpuMs, renderAwaitMs, asyncRenderCpuMs, renderWallMs } = timing;

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
        if (signal.aborted) return;
        completeFrame(
          now,
          intervalMs,
          ticks,
          telemetry.workerTickMs,
          renderCpuMs,
          cpuStartedAt,
          renderAwaitMs,
          asyncRenderCpuMs,
          renderWallMs,
          packet.camera,
        );
      },
    );
  };

  // --- Debug/verify API ------------------------------------------------------------
  // Snapshot mode: stop the sim and pin every wall-clock-driven pixel so
  // screenshots are reproducible (see snapshot.mjs). It must not OWN the pause
  // state (an unfreeze after a user pause should stay paused).
  const advanceTo = async (target: number) => {
    await sim.advanceTo(target);
  };
  const freezeAtTick = (target: number, options: { effects?: boolean } = {}) =>
    freeze.freezeAtTick(target, advanceTo, orders.tickGroupAttacks, options);
  installBattleDebugApi({
    audio: battleAudio,
    camera,
    generatedVista: generatedVistaForDebug,
    frameMetrics: () => frameMetrics,
    metrics: () => ({
      tickMs: tickMsAvg,
      audioUpdateMs: audioUpdateMsAvg,
      fps: fpsAvg,
      clock: {
        alpha: time.alphaAt(performance.now()),
        paused: time.paused,
        frozen: time.frozen,
      },
    }),
    owners: {
      advance: async (n) => {
        await sim.advanceBy(n);
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
      disposeRenderer: world.disposeRenderer,
      benchmark: benchmark
        ? { status: () => benchmark.status(), cancel: cancelBenchmark, report: benchmarkReport }
        : undefined,
    },
    renderer,
    sim,
  });
  return (now) => {
    const failed = (error: unknown) =>
      reportBattlePresentationFailure(error, signal, failPresentation);
    try {
      const pending = frame(now);
      if (pending) return pending.catch(failed);
    } catch (error) {
      failed(error);
    }
  };
}
