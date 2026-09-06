import { PNG } from "pngjs";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

// Fixed production review framing: upper bodies, clear of ground shadows.
const foregrounds = {
  production: { x: 330, y: 100, width: 300, height: 330 },
  diagnostic: { x: 600, y: 160, width: 240, height: 270 },
};
const background = { x: 0, y: 0, width: 180, height: 180 };
export const temporalSnapshots = [4, 7, 41].flatMap((id) =>
  [
    6,
    6.25,
    6.5,
    "event-11",
    "event-14",
    "event-15",
    "event-18",
    "event-24",
    "event-25",
    "event-35",
    37.25,
    39.5,
    id === 41 ? 75 : 72,
  ].map((sample) => `shared/soldiers/action-replay/temporal-${id}-${sample}`),
);

// The existing replay scene owns this fixed-world motion gate; no separate renderer.
export async function verifyTemporalReplay(ctx, page, ids = [4, 7]) {
  await page.evaluate(
    async ({ root, diagnostic }) => {
      const { BattleModelReplay, denseBattleModelReplayRecipe } = await import(
        `/@fs${root}apps/renderer-lab/src/battleModelReplay.ts`
      );
      const { posedBundle, bundleAtPose } = await import(
        `/@fs${root}web/scenes/models/_posed-bundle.ts`
      );
      const { evaluatePlaybackPose } = await import(
        `/@fs${root}packages/crowd-runtime/src/actionTimeline.ts`
      );
      const { localPoseToJointMatrices } = await import(
        `/@fs${root}packages/soldier-assets/src/localPose.ts`
      );
      const threeUrl = performance
        .getEntriesByType("resource")
        .find((entry) => /\/three_webgpu\.js\?/.test(entry.name))?.name;
      if (!threeUrl) throw new Error("Production Three dependency missing");
      const THREE = await import(threeUrl);
      const h = window.__battleModels,
        w = h.world;
      if (diagnostic) {
        const { mountedTemporalFixture } = await import(
          `/@fs${root}web/scenes/models/_mounted-temporal-fixture.ts`
        );
        const fixture = mountedTemporalFixture(w.soldierAssets[41]);
        const replacement = await w.crowd.constructor.create(w.world.renderer, w.world.scene, {
          41: fixture,
        });
        w.crowd.dispose();
        w.crowd = replacement;
        w.soldierAssets = { 41: fixture };
      }
      const productionCrowd = w.crowd;
      let replay, camera, oracleCrowd, measuredPalette;
      window.__temporalReplay = {
        culling() {
          const state = replay.seek(6);
          const instance = state.instances[0];
          const bounds = w.soldierAssets[instance.classId].manifest.bounds;
          // One real frustum plane distinguishes the upright and fully rolled
          // conservative sphere; the other planes repeat that half-space.
          const uprightY = bounds.center[1];
          const rolledY = bounds.center[1] * Math.cos(-0.42) - bounds.center[2] * Math.sin(-0.42);
          const sign = Math.sign(uprightY - rolledY);
          if (!sign) throw new Error("Culling fixture lacks a roll-sensitive center");
          const plane = new THREE.Plane(
            new THREE.Vector3(0, sign, 0),
            -bounds.radius - (sign * (uprightY + rolledY)) / 2,
          );
          const frustum = new THREE.Frustum(...Array.from({ length: 6 }, () => plane.clone()));
          const scope = {
            ...w.crowdVisibilityScope(),
            frusta: [frustum],
            viewFrusta: 1,
            shadowFrusta: 0,
          };
          return [0, 0.5, 1].map((weight) => {
            const sample = {
              ...instance,
              alive: false,
              deathVariant: 0,
              playback: { ...instance.playback, base: { ...instance.playback.base, weight } },
            };
            productionCrowd.upload([sample], scope);
            const y =
              bounds.center[1] * Math.cos(-0.42 * weight) -
              bounds.center[2] * Math.sin(-0.42 * weight);
            return {
              weight,
              visible: productionCrowd.stats().visible,
              expectedVisible: Number(sign * y + plane.constant >= -bounds.radius),
            };
          });
        },
        async select(id) {
          h.freeze();
          h.set({
            classId: id,
            clip: id === 41 ? "gait" : "idle",
            phase: 0,
            formation: false,
            yaw: 0.45,
            pitch: 1.15,
            zoom: 190,
            target: [0, 0, 1],
          });
          while (h.stats().pendingDraw) await new Promise(requestAnimationFrame);
          camera = structuredClone(w.stats().camera);
          const recipe = denseBattleModelReplayRecipe(w.soldierAssets[id], id);
          replay = new BattleModelReplay(w.soldierAssets, id, recipe);
          w.setTime(0);
          return {
            events: recipe.events,
            endTick: recipe.endTick,
            snapshotLimit: 2 * w.soldierAssets[id].rig.bones.length * 10 * 8,
            framing: {
              pose: h.stats().pose,
              camera,
              width: w.world.renderer.domElement.width,
              height: w.world.renderer.domElement.height,
            },
          };
        },
        async draw(tick, { side, freezeCompute = false, oracle, measure = false } = {}) {
          if (measure && oracle) throw new Error("Measure only the production palette");
          if (oracleCrowd) {
            oracleCrowd.dispose();
            oracleCrowd = undefined;
            w.crowd = productionCrowd;
          }
          const state = side ? replay.seekBoundary(tick)[side] : replay.seek(tick);
          let instances = state.instances;
          if (oracle) {
            const id = state.playback.appearanceId;
            const cpu =
              oracle === "readback"
                ? bundleAtPose(w.soldierAssets[id], measuredPalette)
                : posedBundle(w.soldierAssets[id], state.playback);
            productionCrowd.upload([]);
            oracleCrowd = await productionCrowd.constructor.create(
              w.world.renderer,
              w.world.scene,
              { [id]: cpu },
            );
            w.crowd = oracleCrowd;
            const sample = { clip: "oracle", phase: 0 };
            instances = instances.map((instance) => ({
              ...instance,
              clip: "oracle",
              phase: 0,
              playback: {
                appearanceId: id,
                base: {
                  source: { kind: "clip", sample },
                  destination: sample,
                  // Preserve the corpse presentation independently of CPU posing.
                  weight: state.playback.base.weight,
                },
              },
            }));
          }
          const renderer = w.world.renderer,
            compute = renderer.compute;
          let suppressed = 0;
          // Only crowd preparation occurs inside drawInstances; restore before render,
          // so the negative control cannot freeze grass or post-processing instead.
          if (freezeCompute)
            renderer.compute = () => {
              suppressed++;
            };
          try {
            w.drawInstances(instances, camera);
          } finally {
            renderer.compute = compute;
          }
          // Settling can finish a pending grass upload. Present only after that
          // background work, otherwise the next frame can differ without motion.
          await w.settlePresentedFrame();
          w.render();
          await w.world.settlePresentedFrame();
          let matrixError;
          if (measure) {
            const source = w.soldierAssets[state.playback.appearanceId];
            const expected = localPoseToJointMatrices(
              source.rig,
              evaluatePlaybackPose(source, state.playback),
            );
            const palette = productionCrowd.groups.find((group) => group.pending.length).palette;
            const actual = new Float32Array(
              await renderer.getArrayBufferAsync(
                palette.dynamic.output,
                null,
                0,
                expected.byteLength,
              ),
            );
            measuredPalette = actual;
            matrixError = Math.max(
              ...expected.map((value, index) => Math.abs(value - actual[index])),
            );
          }
          return {
            matrixError,
            playback: state.playback,
            snapshotBytes: state.snapshotBytes,
            suppressed,
            stats: w.stats().crowd,
            alive: state.instances[0].alive,
            workbenchFrame: h.stats().frame,
          };
        },
      };
    },
    { root: fileURLToPath(new URL("../../../", import.meta.url)), diagnostic: ids.includes(41) },
  );

  const canvas = page.locator("canvas").first();
  for (const id of ids) {
    const foreground = id === 41 ? foregrounds.diagnostic : foregrounds.production;
    const recipe = await page.evaluate((id) => window.__temporalReplay.select(id), id);
    ctx.check(
      `${id}: fixed fixture framing`,
      recipe.framing.width === (id === 41 ? 1280 : 970) &&
        recipe.framing.height === (id === 41 ? 800 : 758),
      recipe.framing,
    );
    const culling = await page.evaluate(() => window.__temporalReplay.culling());
    ctx.check(
      `${id}: production frustum culling follows death blend`,
      culling.every((row) => row.visible === row.expectedVisible) &&
        culling[0].visible === 1 &&
        culling[2].visible === 0,
      culling,
    );
    const captured = [];
    const snap = async (name, shot) => {
      captured.push(name);
      await ctx.snap(null, name, { shot });
    };
    const draw = async (tick, options = {}) => {
      const state = await page.evaluate(
        ({ tick, options }) => window.__temporalReplay.draw(tick, options),
        { tick, options },
      );
      const bytes = await canvas.screenshot();
      ctx.check(
        `${id}/${tick}/${options.side ?? "sample"}: bounded controller snapshots`,
        state.snapshotBytes <= recipe.snapshotLimit,
        state.snapshotBytes,
      );
      ctx.check(
        `${id}/${tick}: bounded GPU snapshot residency`,
        state.stats.palettes.reduce((sum, palette) => sum + palette.residentSnapshots, 0) <= 2,
      );
      return { state, bytes, png: PNG.sync.read(bytes) };
    };
    const start = await draw(6);
    const stationary = await draw(6);
    ctx.check(
      `${id}: pre-control stationary frame is exact`,
      changed(start.png, stationary.png) === 0,
    );
    const frozen = await draw(6.5, { freezeCompute: true });
    const moving = await draw(6.5);
    const frozenChange = changed(start.png, frozen.png);
    const movement = changed(start.png, moving.png, 0, foreground);
    const frozenForeground = changed(start.png, frozen.png, 0, foreground);
    ctx.check(
      `${id}: fixed background remains exact`,
      changed(start.png, moving.png, 0, background) === 0,
    );
    ctx.check(
      `${id}: frozen-GPU negative control catches non-articulation`,
      frozen.state.suppressed === 1 &&
        frozenChange === 0 &&
        frozenForeground === 0 &&
        movement > 20 &&
        JSON.stringify(start.state.playback) !== JSON.stringify(frozen.state.playback),
      {
        suppressed: frozen.state.suppressed,
        frozenChange,
        frozenForeground,
        movement,
        workbenchFrames: [
          start.state.workbenchFrame,
          frozen.state.workbenchFrame,
          moving.state.workbenchFrame,
        ],
        palettes: [
          start.state.stats.palettes,
          frozen.state.stats.palettes,
          moving.state.stats.palettes,
        ],
      },
    );
    for (const tick of [6, 6.25, 6.5]) {
      const sample = await draw(tick);
      await snap(`shared/soldiers/action-replay/temporal-${id}-${tick}`, sample.bytes);
      const repeated = await draw(tick);
      ctx.check(`${id}/${tick}: paused frame is exact`, changed(sample.png, repeated.png) === 0);
      ctx.check(
        `${id}/${tick}: retained snapshots are not reuploaded`,
        repeated.state.stats.palettes.every((palette) => palette.snapshotUploadedBytes === 0),
      );
    }
    const deathTick = recipe.events.find((event) => event.label === "Composed death").tick;
    const exitTick = recipe.events.find((event) => event.label === "Release exit").tick;
    for (const tick of [11, 14, 15, 18, exitTick, exitTick + 1, deathTick]) {
      const before = await draw(tick, { side: "before" });
      const after = await draw(tick, { side: "after" });
      const error = changed(before.png, after.png);
      ctx.check(
        `${id}/${tick}: same-time displayed event continuity`,
        error === 0,
        pixelError(before.png, after.png),
      );
      await snap(`shared/soldiers/action-replay/temporal-${id}-event-${tick}`, after.bytes);
    }
    for (const tick of [deathTick + 2.25, deathTick + 4.5, recipe.endTick]) {
      const sample = await draw(tick);
      await snap(`shared/soldiers/action-replay/temporal-${id}-${tick}`, sample.bytes);
    }
    const terminal = await draw(recipe.endTick),
      previous = await draw(recipe.endTick - 1);
    ctx.check(
      `${id}: terminal rendered pose holds and snapshots retire`,
      changed(terminal.png, previous.png) === 0 && terminal.state.snapshotBytes === 0,
    );
    for (const tick of [
      0,
      6.25,
      10,
      14.5,
      exitTick + 1.5,
      exitTick + 4.75,
      deathTick,
      deathTick + 2.25,
      recipe.endTick,
    ]) {
      const gpu = await draw(tick, { measure: true });
      const cpu = await draw(tick, { oracle: "source" });
      const error = pixelError(gpu.png, cpu.png);
      ctx.check(
        `${id}/${tick}: actual GPU joint matrices match CPU`,
        gpu.state.matrixError <= 1e-5,
        gpu.state.matrixError,
      );
      const readback = await draw(tick, { oracle: "readback" });
      const renderError = pixelError(gpu.png, readback.png);
      ctx.check(
        `${id}/${tick}: validated palette renders as CPU-preposed geometry`,
        renderError.maximumChannelError <= 1,
        {
          renderError,
          independentCpuImageTelemetry: error,
        },
      );
      if (renderError.maximumChannelError > 1) {
        const directory = new URL("../../../throwaway/temporal-reference/", import.meta.url);
        await mkdir(directory, { recursive: true });
        await writeFile(new URL(`${id}-${tick}-gpu.png`, directory), gpu.bytes);
        await writeFile(new URL(`${id}-${tick}-readback.png`, directory), readback.bytes);
      }
    }
    // Retire the last reference layer before the workbench can change appearance.
    await draw(recipe.endTick);
    const declared = temporalSnapshots.filter((name) =>
      name.startsWith(`shared/soldiers/action-replay/temporal-${id}-`),
    );
    ctx.check(
      `${id}: captured snapshot inventory matches declaration`,
      JSON.stringify(captured) === JSON.stringify(declared),
      captured,
    );
  }
}

function pixelError(a, b) {
  let maximumChannelError = 0;
  for (let i = 0; i < a.data.length; i++)
    maximumChannelError = Math.max(maximumChannelError, Math.abs(a.data[i] - b.data[i]));
  const pixels = [];
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data.subarray(i, i + 4).some((value, channel) => value !== b.data[i + channel])) {
      if (pixels.length < 20)
        pixels.push({
          x: (i / 4) % a.width,
          y: Math.floor(i / 4 / a.width),
          a: [...a.data.subarray(i, i + 4)],
          b: [...b.data.subarray(i, i + 4)],
        });
    }
  }
  return { changedPixels: changed(a, b), maximumChannelError, pixels };
}

function changed(a, b, tolerance = 0, region) {
  if (a.width !== b.width || a.height !== b.height) throw new Error("Temporal framing changed");
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (region) {
      const x = (i / 4) % a.width,
        y = Math.floor(i / 4 / a.width);
      if (
        x < region.x ||
        x >= region.x + region.width ||
        y < region.y ||
        y >= region.y + region.height
      )
        continue;
    }
    if (
      [0, 1, 2, 3].some(
        (channel) => Math.abs(a.data[i + channel] - b.data[i + channel]) > tolerance,
      )
    )
      count++;
  }
  return count;
}
