import { fileURLToPath } from "node:url";

export const meta = {
  name: "battle-model-budget",
  kind: "flow",
  world: "battle-models-animated-budget",
  tier: "full",
  snapshots: [],
  describe: "Hardware-only, frame-correlated animation and production render cost; no art verdict.",
};

// This is a numerical workload, not a replacement for the standing 30k gate.
export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1" || process.env.VERIFY_GPU_ADAPTER !== "hardware") {
    ctx.check("animated budget requires hardware WebGPU", false);
    return;
  }
  const width = Number(process.env.BUDGET_WIDTH ?? 1280);
  const height = Number(process.env.BUDGET_HEIGHT ?? 800);
  const count = Number(process.env.BUDGET_SOLDIERS ?? 30000);
  const frames = Number(process.env.BUDGET_FRAMES ?? 180);
  const warmup = 60;
  const cameraMode = process.env.BUDGET_CAMERA ?? "gameplay";
  if (!["gameplay", "chart-stress"].includes(cameraMode)) throw new Error("Unknown budget camera");
  const fixture = process.env.BUDGET_FIXTURE ?? "foot";
  if (!["foot", "mounted", "heavy", "medium"].includes(fixture))
    throw new Error("Unknown budget fixture");
  const detail = JSON.parse(process.env.BUDGET_DETAIL ?? "{}");
  const textureSize = Number(process.env.BUDGET_TEXTURE_SIZE ?? 0);
  if (
    !Number.isSafeInteger(textureSize) ||
    textureSize < 0 ||
    (textureSize > 0 && textureSize < 16)
  )
    throw new Error("Texture size must be zero or an integer >=16");
  if (
    !detail ||
    typeof detail !== "object" ||
    Array.isArray(detail) ||
    Object.keys(detail).some(
      (key) => !["subdivisions", "jointCopies", "influences", "keySubdivisions"].includes(key),
    )
  )
    throw new Error("Unknown synthetic detail option");
  if (fixture !== "mounted" && (Object.keys(detail).length || textureSize))
    throw new Error("Detail sweeps require the mounted synthetic fixture");
  for (const key of ["jointCopies", "keySubdivisions"])
    if (Object.hasOwn(detail, key) && (!Number.isSafeInteger(detail[key]) || detail[key] < 1))
      throw new Error(`${key} must be a positive integer`);
  if (Object.hasOwn(detail, "influences") && ![1, 4].includes(detail.influences))
    throw new Error("Influences must be one or four");
  if (
    Object.hasOwn(detail, "subdivisions") &&
    (!Array.isArray(detail.subdivisions) ||
      detail.subdivisions.length !== 3 ||
      detail.subdivisions.some((n) => !Number.isSafeInteger(n) || n < 0))
  )
    throw new Error("Subdivisions must have three nonnegative integers");
  const stops = (process.env.BUDGET_STOPS ?? "close,mid,vista").split(",");
  if (!stops.length || stops.some((s) => !["close", "mid", "vista"].includes(s)))
    throw new Error("Unknown budget view");
  if (![width, height, count, frames].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new Error("Budget dimensions/count/frames must be positive integers");
  const page = await ctx.newPage({ viewport: { width, height } });
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  try {
    await page.goto(`${ctx.target}/renderer/battle-models?ref=1`);
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 120000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    const rows = await page.evaluate(
      async (config) => {
        const module = (path) => import(`/@fs${config.root}${path}`);
        const { FrameBudgetProbe } = await module("web/scenes/models/_frame-budget-probe.ts");
        const { installAllocationBudgetProbe } = await module(
          "web/scenes/models/_allocation-budget-probe.ts",
        );
        const { ActionTimeline } = await module("packages/crowd-runtime/src/actionTimeline.ts");
        const { synchronizedBudgetObservations } = await module(
          "web/scenes/models/_synthetic-budget-fixture.ts",
        );
        const { SimClock } = await module("web/src/shared/simClock.ts");
        const { BATTLE_TICK_DT, BATTLE_MAX_TICKS_PER_FRAME, BattleCameraRig } = await module(
          "web/src/battle/battleWorld.ts",
        );
        const { Camera } = await module("web/src/shared/camera.ts");
        const { generatedFormation, buildCrowdInstances } = await module(
          "packages/crowd-runtime/src/instanceData.ts",
        );
        const { modelCamera, DEFAULT_MODEL_POSE } = await module(
          "apps/renderer-lab/src/battleModelFixture.ts",
        );
        const w = window.__battleModels.world;
        const device = w.world.renderer.backend.device;
        if (!device.features.has("timestamp-query"))
          throw new Error("Hardware timestamps unavailable");
        const raf = () => new Promise(requestAnimationFrame);
        const appearanceId = { foot: 4, mounted: 41, heavy: 0, medium: 14 }[config.fixture];
        let source = w.soldierAssets[appearanceId];
        if (config.fixture !== "foot") {
          const { loadAppearanceBundle } = await module(
            "packages/soldier-assets/src/appearanceBundle.ts",
          );
          const { syntheticBudgetFixture, budgetTextureSurface } = await module(
            "web/scenes/models/_synthetic-budget-fixture.ts",
          );
          const path = {
            mounted: "blender-reference/mounted",
            heavy: "heavy-kit/heavy",
            medium: "medium-phalanx/medium",
          }[config.fixture];
          source = await loadAppearanceBundle(
            new URL(`/assets/soldiers/candidates/${path}/appearance.json`, location.href).href,
          );
          if (config.fixture === "mounted") source = syntheticBudgetFixture(source, config.detail);
          if (config.textureSize)
            source.surface = await budgetTextureSurface(source.surface, config.textureSize);
          const replacement = await w.crowd.constructor.create(w.world.renderer, w.world.scene, {
            [appearanceId]: source,
          });
          w.crowd.dispose();
          w.crowd = replacement;
          w.soldierAssets = { [appearanceId]: source };
        }
        const formations = generatedFormation(config.count, {
          classId: appearanceId,
          spacing: source.manifest.mounted ? 3 : 1.6,
        });
        const positions = Float32Array.from(formations.flatMap((i) => [i.x, i.y]));
        const soldierUnit = new Uint32Array(config.count);
        const facings = Float32Array.from(formations, (i) => i.facing);
        w.resize(config.width, config.height, 1);
        const cam = new Camera(w.world.renderer.domElement);
        const rig = new BattleCameraRig(cam, w.world.renderer.domElement);
        if (config.cameraMode === "gameplay") {
          // Fixed synthetic world for every load/resolution, large enough for
          // both foot and mounted 30k formations; not the inspector's small pad.
          if (formations.some((i) => Math.abs(i.x) > 512 || Math.abs(i.y) > 512))
            throw new Error("Crowd exceeds fixed budget terrain");
          w.setTerrain({
            w: 256,
            h: 256,
            cell: 4,
            ox: -512,
            oy: -512,
            tint: new Uint8Array(256 * 256),
            height: new Float32Array(256 * 256),
          });
          w.setGrassVisible(true);
          w.world.scene.traverse((object) => {
            if (object.name.startsWith("battle-scenery-")) object.visible = true;
          });
          rig.bounds = { width: 1024, height: 1024 };
          rig.apply();
          cam.bounds = [-512, -512, 512, 512];
          cam.groundHeight = (x, y) => w.heightAt(x, y);
          cam.yaw = -Math.PI / 2;
          cam.pitchBias = 0;
        }
        const cameraFor = (stop, chartZoom) => {
          if (config.cameraMode === "chart-stress")
            return modelCamera(
              { ...DEFAULT_MODEL_POSE, zoom: chartZoom },
              config.width,
              config.height,
            );
          cam.zoom = stop === "mid" ? (rig.range.min + rig.range.max) / 2 : rig.range.max;
          cam.setViewCenter(0, 0);
          cam.clampView();
          const [x, y] = cam.viewCenter();
          return { x, y, zoom: cam.zoom, zoomT: cam.zoomT, camera3d: cam.params() };
        };
        w.setStatic(soldierUnit, [0], [appearanceId]);
        w.setTime(0);
        const rows = [];
        let frameId = 0;
        let advanceAllocationFrame;
        let allocationCamera;
        for (const [stop, zoom] of [
          ["close", 190],
          ["mid", 12],
          ["vista", 3],
        ]) {
          if (!config.stops.includes(stop)) continue;
          const camera = cameraFor(stop, zoom);
          for (const mode of ["steady", "interruptions"]) {
            // Match BattleCrowd: the capped simulation clock advances, then the
            // controller observes only the latest state, never every missed tick.
            for (const instrumented of [false, true]) {
              const timeline = new ActionTimeline(w.soldierAssets);
              const workload = synchronizedBudgetObservations(config.count, appearanceId, source);
              const probe = instrumented ? new FrameBudgetProbe(device) : null;
              const samples = [];
              const clock = new SimClock({
                tickHz: 1 / BATTLE_TICK_DT,
                maxTicksPerFrame: BATTLE_MAX_TICKS_PER_FRAME,
              });
              let priorRaf,
                snapshotHighWater = 0;
              let tick = -1;
              const draw = (sampleTick) => {
                const t0 = performance.now();
                const nextTick = Math.floor(sampleTick);
                let observedTicks = 0;
                if (tick < nextTick) {
                  tick = nextTick;
                  observedTicks = 1;
                  workload.update(tick, mode);
                  timeline.update(tick, workload.observations);
                }
                const t1 = performance.now();
                const playback = timeline.sample(sampleTick);
                const t2 = performance.now();
                const { instances } = buildCrowdInstances({
                  positions,
                  facings,
                  playback,
                  soldierUnit,
                  unitTeam: [0],
                  terrainHeight: (x, y) => w.heightAt(x, y),
                  count: config.count,
                  mountedClasses: source.manifest.mounted ? [appearanceId] : [],
                });
                const t3 = performance.now();
                w.drawInstances(instances, camera);
                const t4 = performance.now();
                w.render();
                const t5 = performance.now();
                return {
                  sampleTick,
                  observedTicks,
                  observeMs: t1 - t0,
                  sampleMs: t2 - t1,
                  buildMs: t3 - t2,
                  uploadMs: t4 - t3,
                  renderSubmitMs: t5 - t4,
                };
              };
              advanceAllocationFrame = () => draw(tick + 1);
              allocationCamera = camera;
              try {
                draw(0);
                await w.settlePresentedFrame();
                for (let frame = 1; frame <= config.warmup + config.frames; frame++) {
                  const rafTime = await raf();
                  const advancedTicks = clock.advance(rafTime);
                  const sampleTick = clock.tick + clock.alpha;
                  const id = ++frameId;
                  let phases;
                  const start = performance.now();
                  if (probe && frame > config.warmup)
                    probe.measure(id, () => {
                      phases = draw(sampleTick);
                    });
                  else phases = draw(sampleTick);
                  const cpuFrameMs = performance.now() - start;
                  if (frame > config.warmup) {
                    const telemetryStart = performance.now();
                    snapshotHighWater = Math.max(snapshotHighWater, timeline.snapshotBytes);
                    const activeRiderOverlays = source.manifest.mounted
                      ? w.instances.reduce(
                          (total, instance) => total + Number(!!instance.playback?.riderUpperBody),
                          0,
                        )
                      : 0;
                    const telemetryMs = performance.now() - telemetryStart;
                    samples.push({
                      frameId: id,
                      rafMs: rafTime - priorRaf,
                      cpuFrameMs,
                      telemetryMs,
                      advancedTicks,
                      activeRiderOverlays,
                      baseClip: w.instances[0].playback.base.destination.clip,
                      basePhase: w.instances[0].playback.base.destination.phase,
                      ...phases,
                    });
                  }
                  priorRaf = rafTime;
                }
                await probe?.drain();
                const timings = probe?.takeResults() ?? [];
                rows.push({
                  stop,
                  zoom: camera.zoom,
                  mode,
                  instrumented,
                  fixture: config.fixture,
                  cameraMode: config.cameraMode,
                  rig:
                    config.cameraMode === "gameplay"
                      ? { bounds: rig.bounds, range: rig.range }
                      : null,
                  detail: config.detail,
                  textureSize: config.textureSize,
                  samples,
                  timings,
                  snapshotHighWater,
                  stats: w.stats(),
                  asset: {
                    bones: source.rig.bones.length,
                    vertices: source.tiers.map((m) => m.positions.length / 3),
                    triangles: source.tiers.map((m) => m.indices.length / 3),
                    nonzeroInfluences: source.tiers.map((mesh) => {
                      const counts = [0, 0, 0, 0, 0];
                      for (let i = 0; i < mesh.weights.length; i += 4)
                        counts[
                          Number(mesh.weights[i] > 0) +
                            Number(mesh.weights[i + 1] > 0) +
                            Number(mesh.weights[i + 2] > 0) +
                            Number(mesh.weights[i + 3] > 0)
                        ]++;
                      return counts;
                    }),
                    authoredSamples: source.animation.clips.map((c) => ({
                      name: c.name,
                      samples: c.times.length,
                    })),
                    animationBytes:
                      source.animation.data.byteLength + source.animation.stepMasks.byteLength,
                  },
                });
              } finally {
                probe?.dispose();
              }
            }
          }
        }
        // Allocation observation is separate from timing: method wrappers and
        // accounting should not inflate the reported production CPU workload.
        const allocation = installAllocationBudgetProbe(device);
        const allocationStates = {};
        let replacement;
        try {
          const assets = { [appearanceId]: source };
          const instances = w.instances;
          const camera = allocationCamera;
          allocation.phase("initialization");
          replacement = await w.crowd.constructor.create(w.world.renderer, w.world.scene, assets);
          w.crowd.dispose();
          w.crowd = replacement;
          replacement = undefined;
          allocationStates.initialization = w.stats().crowd;
          for (const size of new Set([1, Math.ceil(config.count / 2), config.count])) {
            allocation.phase(`grow-${size}`);
            w.drawInstances(instances.slice(0, size), camera);
            w.render();
            await w.settlePresentedFrame();
            allocationStates[`grow-${size}`] = w.stats().crowd;
          }
          allocation.phase("frozen-repeat");
          for (let frame = 0; frame < 10; frame++) {
            w.drawInstances(instances, camera);
            w.render();
            await w.settlePresentedFrame();
          }
          allocationStates["frozen-repeat"] = w.stats().crowd;
          allocation.phase("advancing-interruptions");
          const advancing = [];
          for (let frame = 0; frame < 60; frame++) {
            advanceAllocationFrame();
            await w.settlePresentedFrame();
            advancing.push(w.stats().crowd.palettes);
          }
          allocationStates["advancing-interruptions"] = advancing;
          allocation.phase("replacement-overlap");
          const replacementInstances = w.instances;
          replacement = await w.crowd.constructor.create(w.world.renderer, w.world.scene, assets);
          w.crowd.dispose();
          w.crowd = replacement;
          replacement = undefined;
          w.drawInstances(replacementInstances, camera);
          w.render();
          await w.settlePresentedFrame();
          allocationStates["replacement-overlap"] = w.stats().crowd;
          if (config.fixture === "mounted") {
            const { staggeredBudgetObservations } = await module(
              "web/scenes/models/_synthetic-budget-fixture.ts",
            );
            const timeline = new ActionTimeline(assets);
            const staggered = [];
            for (let tick = 0; tick <= 24; tick++) {
              allocation.phase(`staggered-${tick}`);
              timeline.update(tick, staggeredBudgetObservations(config.count, tick, appearanceId));
              const playback = timeline.sample();
              const sources = new Set();
              for (const value of playback)
                for (const lane of [value.base, value.riderUpperBody])
                  if (lane?.source.kind === "frozen") sources.add(lane.source.locals);
              const { instances } = buildCrowdInstances({
                positions,
                facings,
                playback,
                soldierUnit,
                unitTeam: [0],
                terrainHeight: (x, y) => w.heightAt(x, y),
                count: config.count,
                mountedClasses: [appearanceId],
              });
              let error = null;
              try {
                w.drawInstances(instances, camera);
              } catch (caught) {
                error = { stage: "drawInstances", message: String(caught) };
              }
              w.render();
              await w.settlePresentedFrame();
              staggered.push({
                tick,
                error,
                observedBodies: playback.length,
                distinctFrozenSources: sources.size,
                controllerSnapshotBytes: timeline.snapshotBytes,
                crowd: w.stats().crowd,
              });
            }
            allocationStates["staggered-histories"] = staggered;
          }
          rows.push({
            allocation: allocation.snapshot(),
            allocationStates,
            camera,
            storageLimits: {
              maxBufferSize: device.limits.maxBufferSize,
              maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
            },
            scope:
              "Tracked fresh crowd generations at the last measured camera; uploads include whole-device traffic. Advancing-interruptions observes 60 successive ticks separately from timing. Mounted staggered histories observe one tick per settled frame, record failures and continue through source retirement. Requested bytes exclude opaque texture storage and driver overhead.",
          });
        } finally {
          replacement?.dispose();
          allocation.dispose();
        }
        return rows;
      },
      {
        root: fileURLToPath(new URL("../../../", import.meta.url)),
        width,
        height,
        count,
        frames,
        warmup,
        fixture,
        detail,
        textureSize,
        stops,
        cameraMode,
      },
    );
    for (const row of rows) {
      if (row.allocation) {
        const staggered = row.allocationStates["staggered-histories"];
        if (staggered) {
          const interrupted = staggered.find((frame) => frame.tick === 13);
          const submitted = (crowd) =>
            crowd.palettes.reduce((total, palette) => total + palette.visible, 0);
          const referenceSubmitted = submitted(row.allocationStates["replacement-overlap"]);
          ctx.check(
            "allocation exercises independent mounted frozen histories",
            interrupted.observedBodies === count &&
              interrupted.distinctFrozenSources >= Math.min(count, 3) * 2 &&
              interrupted.distinctFrozenSources <= count * 2,
            interrupted,
          );
          ctx.check(
            "staggered mounted histories remain admitted through allocation growth",
            referenceSubmitted > 0 &&
              staggered.every(
                (frame) =>
                  !frame.error &&
                  !frame.crowd.uploadFailed &&
                  frame.crowd.visible > 0 &&
                  submitted(frame.crowd) === referenceSubmitted &&
                  (![12, 13].includes(frame.tick) ||
                    frame.crowd.palettes.some((palette) => palette.residentSnapshots > 0)),
              ),
            { referenceSubmitted, frames: staggered },
          );
          const retired = staggered.at(-1);
          ctx.check(
            "staggered mounted histories retire frozen sources and recover admission",
            !retired.error &&
              !retired.crowd.uploadFailed &&
              retired.controllerSnapshotBytes === 0 &&
              retired.crowd.palettes.every((palette) => palette.residentSnapshots === 0),
            retired,
          );
        }
        ctx.check(
          "allocation captures advancing snapshot uploads",
          row.allocationStates["advancing-interruptions"].some((palettes) =>
            palettes.some((palette) => palette.snapshotUploadedBytes > 0),
          ),
          row.allocationStates["advancing-interruptions"],
        );
        ctx.check(
          "allocation captures initialization and replacement",
          row.allocation.phases.initialization.createdResources > 0 &&
            row.allocation.phases["replacement-overlap"].createdResources > 0 &&
            row.allocation.total.bufferCreatedBytes > 0 &&
            row.allocation.total.mappedAtCreationBytes > 0 &&
            row.allocation.phases["replacement-overlap"].destroyedResources > 0,
          row,
        );
        continue;
      }
      const name = `${row.stop}/${row.mode}/${row.instrumented ? "timed" : "control"}`;
      ctx.check(`${name}: complete submitted crowd`, row.stats.soldiers === count, row.stats.crowd);
      if (fixture === "mounted" && row.mode === "interruptions")
        ctx.check(
          `${name}: measured mounted composition`,
          row.samples.some((s) => s.activeRiderOverlays > 0),
          { framesWithOverlay: row.samples.filter((s) => s.activeRiderOverlays > 0).length },
        );
      if (textureSize)
        ctx.check(
          `${name}: requested diagnostic maps uploaded`,
          row.stats.crowd.surfaceImages.length === 3 &&
            row.stats.crowd.surfaceImages.every(
              (image) => image.width === textureSize && image.height === textureSize,
            ),
          row.stats.crowd.surfaceImages,
        );
      const percentile = (values, fraction) =>
        [...values].sort((a, b) => a - b)[
          Math.min(values.length - 1, Math.floor(values.length * fraction))
        ];
      const cpuMedianMs = percentile(
        row.samples.map((s) => s.cpuFrameMs),
        0.5,
      );
      const rafP95Ms = percentile(
        row.samples.map((s) => s.rafMs),
        0.95,
      );
      ctx.check(`${name}: CPU submission median <= 33ms`, cpuMedianMs <= 33, { cpuMedianMs });
      ctx.check(`${name}: live cadence p95 <= 33ms`, rafP95Ms <= 33, { rafP95Ms });
      if (row.instrumented) {
        const measured = row.timings.filter((t) => t.status === "measured");
        ctx.check(
          `${name}: correlated timing coverage`,
          measured.length >= frames * 0.95 &&
            new Set(row.timings.map((t) => t.frameId)).size === frames &&
            row.timings.every((t) => row.samples.some((s) => s.frameId === t.frameId)) &&
            !row.timings.some((t) => t.status === "error"),
          row.timings,
        );
        const values = measured.map((t) => t.gpuQueueMs).sort((a, b) => a - b);
        const median = values[Math.floor(values.length / 2)];
        ctx.check(`${name}: GPU-queue elapsed median <= 33ms`, median <= 33, { median });
      }
      ctx.check(`${name}: frame measurements`, true, row);
    }
    ctx.check("no renderer warnings", warnings.length === 0, warnings);
  } finally {
    await page.close();
  }
}
