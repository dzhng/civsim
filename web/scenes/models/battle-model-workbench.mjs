// Explicit retained parity pose; independent of gameplay clocks and entry histories.
const PARITY_PHASE = 0.9991202346041055;
import { PNG } from "pngjs";
import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";
import { TYPEGPU_BATTLE_IDENTITY } from "../../../packages/battle-renderer/src/world/identity.ts";
import {
  bakeLocalAnimation,
  encodeLocalAnimation,
} from "../../../packages/soldier-assets/src/localAnimation.ts";

export const meta = {
  name: "battle-model-workbench",
  kind: "visual",
  world: "battle-models",
  tier: "full",
  snapshots: [
    "shared/soldiers/workbench/heavy-front",
    "shared/soldiers/workbench/phalanx-side",
    "shared/soldiers/workbench/formation",
    "shared/soldiers/workbench/submission-parity",
    "shared/soldiers/workbench/controls",
    "shared/soldiers/workbench/manual-alive",
    "shared/soldiers/workbench/manual-dead",
    "shared/soldiers/workbench/authored-roster-far",
  ],
  describe:
    "Production soldier workbench: explicit frozen poses, readable close views, formation, local bake reload and visible load failures.",
};

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(`${ctx.target}/renderer/battle-models?ref=1`);
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    const bindings = await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(window.__battleModels.world.soldierAssets).map(([id, asset]) => [
          id,
          asset.manifest.presentation.actions,
        ]),
      ),
    );
    for (const [name, pose] of [
      [
        "heavy-front",
        {
          classId: 0,
          clip: bindings[0].atEase.clip,
          phase: 0,
          yaw: 0.45,
          pitch: 1.15,
          zoom: 190,
          formation: false,
        },
      ],
      [
        "phalanx-side",
        {
          classId: 14,
          clip: bindings[14].atEase.clip,
          phase: 0,
          yaw: 1.2,
          pitch: 1.15,
          zoom: 150,
          formation: false,
        },
      ],
      [
        "formation",
        {
          classId: 0,
          clip: bindings[0].walk.clip,
          phase: 0.25,
          yaw: 0.45,
          pitch: 0.9,
          zoom: 65,
          formation: true,
        },
      ],
    ]) {
      const previous = await page.evaluate((pose) => {
        const before = window.__battleModels.stats().frame;
        window.__battleModels.set(pose);
        return before;
      }, pose);
      await page.waitForFunction(
        (previous) => window.__battleModels.stats().frame > previous,
        previous,
      );
      await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
      const stats = await page.evaluate(() => window.__battleModels.stats());
      ctx.check(
        `${name}: production path and submitted count`,
        stats.render.substrate === TYPEGPU_BATTLE_IDENTITY.substrate &&
          stats.render.crowd.instances === (pose.formation ? 16 : 1),
        JSON.stringify({
          substrate: stats.render.substrate,
          soldiers: stats.render.crowd.instances,
        }),
      );
      const shot = await page.screenshot();
      const png = PNG.sync.read(shot);
      let dark = 0;
      for (let y = 150; y < 700; y++)
        for (let x = 300; x < 980; x++) {
          const p = (y * png.width + x) * 4;
          if (png.data[p] + png.data[p + 1] + png.data[p + 2] < 230) dark++;
        }
      ctx.check(`${name}: readable foreground model coverage`, dark > 500, String(dark));
      await ctx.snap(page, `shared/soldiers/workbench/${name}`, {
        shot,
        threshold: 0,
        maxDiffRatio: 0,
      });
      const repeat = await page.screenshot();
      ctx.check(`${name}: frozen frame is byte-stable`, shot.equals(repeat));
    }
    await checkManualLifeState(ctx, page);
    const before = await page.screenshot();
    const loaded = await page.evaluate(() => window.__battleModels.reload());
    await page.waitForFunction(() => window.__battleModels.stats().reloads === 1);
    await page.waitForTimeout(300);
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    const after = await page.screenshot();
    ctx.check(
      "local bake reload keeps identical production pixels",
      loaded.ok && before.equals(after),
    );
    const animationUrl = await page.evaluate(async () => {
      const catalogUrl = new URL("/assets/soldiers/catalog.json", location.href);
      const catalog = await fetch(catalogUrl).then((response) => response.json());
      const bundleUrl = new URL(catalog.appearances[0], catalogUrl);
      const bundle = await fetch(bundleUrl).then((response) => response.json());
      return new URL(bundle.animation, bundleUrl).href;
    });
    const sourceRig = await page.evaluate(() => window.__battleModels.world.soldierAssets[0].rig);
    // Remove a semantic clip through the real producer: merely deleting its index
    // leaves invalid sample ranges and would test structural admission instead.
    const withoutClip = (name) =>
      encodeLocalAnimation(
        bakeLocalAnimation({
          ...sourceRig,
          clips: sourceRig.clips.filter((clip) => clip.name !== name),
        }),
      );
    await page.route("**/assets/soldiers/catalog.json", (route) =>
      route.fulfill({ contentType: "application/json", body: "malformed fixture" }),
    );
    const failed = await page.evaluate(() => window.__battleModels.reload());
    ctx.check(
      "failed reload is explicit and preserves last good crowd",
      !failed.ok &&
        failed.error.length > 0 &&
        (await page.evaluate(() => window.__battleModels.stats().render.crowd.instances === 16)),
      JSON.stringify(failed),
    );
    await page.unroute("**/assets/soldiers/catalog.json");
    await page.route("**/assets/soldiers/catalog.json", async (route) => {
      const response = await route.fetch();
      const catalog = await response.json();
      delete catalog.appearances["0"];
      await route.fulfill({ json: catalog });
    });
    const incompatible = await page.evaluate(() => window.__battleModels.reload());
    ctx.check(
      "incompatible reload retains the active appearance",
      !incompatible.ok && incompatible.error.includes("appearance 0"),
    );
    await page.unroute("**/assets/soldiers/catalog.json");
    await page.route(animationUrl, (route) =>
      route.fulfill({ json: withoutClip(bindings[0].walk.clip) }),
    );
    const missingClip = await page.evaluate(() => window.__battleModels.reload());
    const retainedClip = await page.evaluate(
      (walk) => ({
        pose: window.__battleModels.stats().pose,
        present: window.__battleModels.world.soldierAssets[0].animation.clips.some(
          (clip) => clip.name === walk,
        ),
      }),
      bindings[0].walk.clip,
    );
    ctx.check(
      "incompatible reload retains the active appearance-specific clip",
      !missingClip.ok &&
        missingClip.error.includes("presentation walk") &&
        missingClip.error.includes(bindings[0].walk.clip) &&
        retainedClip.present &&
        retainedClip.pose.classId === 0 &&
        retainedClip.pose.clip === bindings[0].walk.clip &&
        retainedClip.pose.phase === 0.25,
      JSON.stringify({ missingClip, retainedClip }),
    );
    await page.unroute(animationUrl);
    await page.route(animationUrl, async (route) => {
      const response = await route.fetch();
      const animation = await response.json();
      animation.data.pop();
      await route.fulfill({ json: animation });
    });
    const truncated = await page.evaluate(() => window.__battleModels.reload());
    ctx.check(
      "truncated local animation samples are rejected explicitly",
      !truncated.ok && truncated.error.includes("invalid samples or metadata"),
      JSON.stringify(truncated),
    );
    await page.unroute(animationUrl);
    await page.route(animationUrl, (route) =>
      route.fulfill({ json: withoutClip(bindings[0].melee.clip) }),
    );
    const missingFutureAction = await page.evaluate(() => window.__battleModels.reload());
    ctx.check(
      "production reload rejects a missing non-active action before replacing the crowd",
      !missingFutureAction.ok &&
        missingFutureAction.error.includes(bindings[0].melee.clip) &&
        (await page.evaluate(
          (melee) =>
            window.__battleModels.world.soldierAssets[0].animation.clips.some(
              (clip) => clip.name === melee,
            ),
          bindings[0].melee.clip,
        )),
      JSON.stringify(missingFutureAction),
    );
    const incompleteStartup = await page.evaluate(async () => {
      try {
        const world = await window.__battleModels.world.constructor.create(
          document.createElement("canvas"),
        );
        world.dispose();
        return null;
      } catch (error) {
        return String(error);
      }
    });
    ctx.check(
      "production startup rejects a missing controller action",
      incompleteStartup?.includes(bindings[0].melee.clip),
      String(incompleteStartup),
    );
    await page.unroute(animationUrl);
    const retainedAssets = await page.evaluateHandle(
      () => window.__battleModels.world.soldierAssets,
    );
    await page.route(animationUrl, async (route) => {
      const response = await route.fetch();
      const animation = await response.json();
      delete animation.clips;
      await route.fulfill({ json: animation });
    });
    for (let retry = 0; retry < 2; retry++) {
      const malformed = await page.evaluate(() => window.__battleModels.reload());
      const retained = await page.evaluate(
        (previous) => window.__battleModels.world.soldierAssets === previous,
        retainedAssets,
      );
      ctx.check(
        `invalid local animation retry ${retry}: retains the published asset generation`,
        !malformed.ok && retained,
        JSON.stringify({ malformed, retained }),
      );
    }
    await page.unroute(animationUrl);
    await retainedAssets.dispose();
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    ctx.check(
      "rejected bundles preserve the last good production pixels",
      after.equals(await page.screenshot()),
    );
    // The failed reload schedules a redraw of the retained pose. Finish it
    // before manually driving the two production entry points.
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    await page.evaluate(async (phase) => {
      const world = window.__battleModels.world;
      world.setStatic(new Uint32Array(1), [0], [0]);
      await world.draw(
        new Float32Array([0, 0]),
        new Float32Array([Math.PI / 2]),
        [
          {
            appearanceId: 0,
            base: {
              source: {
                kind: "clip",
                sample: {
                  clip: world.soldierAssets[0].manifest.presentation.actions.walk.clip,
                  phase,
                },
              },
              destination: {
                clip: world.soldierAssets[0].manifest.presentation.actions.walk.clip,
                phase,
              },
              weight: 1,
            },
          },
        ],
        new Float32Array([1]),
        1,
        world.stats().preparedCamera,
      );
      await world.render();
    }, PARITY_PHASE);
    ctx.check(
      "battle submission replaces the retained formation",
      await page.evaluate(() => window.__battleModels.world.stats().crowd.instances === 1),
    );
    const fromBattle = await page.screenshot();
    await ctx.snap(page, "shared/soldiers/workbench/submission-parity", {
      shot: fromBattle,
      threshold: 0,
      maxDiffRatio: 0,
    });
    const instanceModule = new URL(
      "../../../packages/crowd-runtime/src/instanceData.ts",
      import.meta.url,
    ).pathname;
    await page.evaluate(
      async ({ source, phase }) => {
        const { buildCrowdInstances } = await import("/@fs" + source);
        await new Promise(requestAnimationFrame);
        const world = window.__battleModels.world;
        const built = buildCrowdInstances({
          positions: new Float32Array([0, 0]),
          facings: new Float32Array([Math.PI / 2]),
          playback: [
            {
              appearanceId: 0,
              base: {
                source: {
                  kind: "clip",
                  sample: {
                    clip: world.soldierAssets[0].manifest.presentation.actions.walk.clip,
                    phase,
                  },
                },
                destination: {
                  clip: world.soldierAssets[0].manifest.presentation.actions.walk.clip,
                  phase,
                },
                weight: 1,
              },
            },
          ],
          alive: new Float32Array([1]),
          soldierUnit: new Uint32Array(1),
          unitTeam: [0],
          terrainHeight: () => 0,
        });
        await world.drawInstances(built.instances, world.stats().preparedCamera);
        await world.render();
      },
      { source: instanceModule, phase: PARITY_PHASE },
    );
    const fromExplicitPose = await page.screenshot();
    ctx.check(
      "battle adapter and explicit pose submission have identical pixels",
      fromBattle.equals(fromExplicitPose),
    );
    await ctx.snap(page, "shared/soldiers/workbench/submission-parity", {
      shot: fromExplicitPose,
      threshold: 0,
      maxDiffRatio: 0,
    });
    await page.evaluate(() =>
      document.querySelector(".renderer-lab").classList.remove("reference-shot"),
    );
    await page.selectOption("#model-class", "14");
    const availableClip = await page.locator("#model-clip option").first().getAttribute("value");
    await page.selectOption("#model-clip", availableClip);
    const phaseBefore = await page.evaluate(() => window.__battleModels.stats().pose.phase);
    await page.click("#model-play");
    await page.waitForFunction(
      (phase) => window.__battleModels.stats().pose.phase !== phase,
      phaseBefore,
    );
    await page.click("#model-play");
    const yawBefore = await page.evaluate(() => window.__battleModels.stats().pose.yaw);
    await page.click("#model-turn");
    await page.waitForFunction((yaw) => window.__battleModels.stats().pose.yaw !== yaw, yawBefore);
    await page.click("#model-turn");
    ctx.check("interactive clip playback and turntable change the rendered pose", true);
    await page.evaluate(() => {
      window.__battleModels.freeze();
      window.__battleModels.set({
        classId: 0,
        clip: "idle",
        phase: 0,
        formation: false,
        zoom: 190,
        yaw: 0.45,
        pitch: 1.15,
      });
    });
    await page.click("#model-reload");
    // Full-catalog preparation measured 43.2s on SwiftShader. This checks
    // successful reload, not the separate renderer frame-time budget.
    await page.waitForFunction(() => window.__battleModels.stats().reloads === 2, undefined, {
      timeout: 60000,
    });
    await page.waitForTimeout(300);
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    await ctx.snap(page, "shared/soldiers/workbench/controls", { threshold: 0, maxDiffRatio: 0 });

    // Change authored factors without changing the mesh or its vertex colors.
    // Each comparison changes one factor: consuming only one cannot pass both.
    await page.evaluate(() =>
      document.querySelector(".renderer-lab").classList.add("reference-shot"),
    );
    const { materialUrl, meshUrls } = await page.evaluate(async () => {
      const catalogUrl = new URL("/assets/soldiers/catalog.json", location.href);
      const catalog = await fetch(catalogUrl).then((response) => response.json());
      const bundleUrl = new URL(catalog.appearances[0], catalogUrl);
      const bundle = await fetch(bundleUrl).then((response) => response.json());
      return {
        materialUrl: new URL(bundle.materials, bundleUrl).href,
        meshUrls: bundle.tiers.map((path) => new URL(path, bundleUrl).href),
      };
    });
    // Switching out of the controls layout resizes the canvas. Wait for its
    // new frame before comparing reloads against that same frozen camera.
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    const beforeReindex = await page.screenshot();
    await page.route(materialUrl, async (route) => {
      const materials = await (await route.fetch()).json();
      delete materials.materials[0].roughness;
      await route.fulfill({ json: materials });
    });
    const malformedMaterial = await page.evaluate(() => window.__battleModels.reload());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    ctx.check(
      "malformed material rejects reload and preserves the last good pixels",
      !malformedMaterial.ok &&
        /materials require finite/.test(malformedMaterial.error) &&
        beforeReindex.equals(await page.screenshot()),
      JSON.stringify(malformedMaterial),
    );
    await page.unroute(materialUrl);
    const materialCount = (await (await page.request.get(materialUrl)).json()).materials.length;
    await page.route(materialUrl, async (route) => {
      const materials = await (await route.fetch()).json();
      materials.materials.reverse();
      await route.fulfill({ json: materials });
    });
    for (const url of meshUrls) {
      await page.route(url, async (route) => {
        const mesh = await (await route.fetch()).json();
        mesh.materialIds = mesh.materialIds.map((id) => materialCount - 1 - id);
        await route.fulfill({ json: mesh });
      });
    }
    const reindexed = await page.evaluate(() => window.__battleModels.reload());
    ctx.check("equivalent material-table reindex loads", reindexed.ok, reindexed.error);
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    ctx.check(
      "material slot numbering cannot change surface pixels",
      beforeReindex.equals(await page.screenshot()),
    );
    await page.unroute(materialUrl);
    for (const url of meshUrls) await page.unroute(url);
    const materialShots = [];
    for (const [roughness, metallic] of [
      [0.9, 0],
      [0.15, 0],
      [0.15, 1],
    ]) {
      await page.route(materialUrl, async (route) => {
        const materials = await (await route.fetch()).json();
        await route.fulfill({
          json: {
            ...materials,
            materials: materials.materials.map((material) => ({
              ...material,
              baseColor: [0.6, 0.6, 0.6, 1],
              roughness,
              metallic,
            })),
          },
        });
      });
      const result = await page.evaluate(() => window.__battleModels.reload());
      ctx.check(
        `authored roughness ${roughness}, metallic ${metallic}: replacement loads`,
        result.ok,
        result.error,
      );
      await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
      await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
      materialShots.push(await page.screenshot());
      await page.unroute(materialUrl);
    }
    ctx.check(
      "authored roughness changes pixels with fixed color and metallic",
      !materialShots[0].equals(materialShots[1]),
    );
    ctx.check(
      "authored metallic changes pixels with fixed color and roughness",
      !materialShots[1].equals(materialShots[2]),
    );
    const captureInstance = async (seed, faction = 0) => {
      await page.evaluate(
        async ({ source, seed, faction, phase }) => {
          const { buildCrowdInstances } = await import("/@fs" + source);
          await new Promise(requestAnimationFrame);
          const world = window.__battleModels.world;
          const built = buildCrowdInstances({
            positions: new Float32Array([0, 0]),
            facings: new Float32Array([Math.PI / 2]),
            playback: [
              {
                appearanceId: 0,
                base: {
                  source: {
                    kind: "clip",
                    sample: {
                      clip: world.soldierAssets[0].manifest.presentation.actions.walk.clip,
                      phase,
                    },
                  },
                  destination: {
                    clip: world.soldierAssets[0].manifest.presentation.actions.walk.clip,
                    phase,
                  },
                  weight: 1,
                },
              },
            ],
            alive: new Float32Array([1]),
            soldierUnit: new Uint32Array(1),
            unitTeam: [faction],
            terrainHeight: () => 0,
          });
          built.instances[0].seed = seed;
          await world.drawInstances(built.instances, world.stats().preparedCamera);
          await world.render();
        },
        { source: instanceModule, seed, faction, phase: PARITY_PHASE },
      );
      return page.screenshot();
    };
    const seedShots = [await captureInstance(1), await captureInstance(91273)];
    ctx.check("instance seed does not vary authored appearance", seedShots[0].equals(seedShots[1]));
    for (const mask of [0, 1]) {
      for (const url of meshUrls) {
        await page.route(url, async (route) => {
          const mesh = await (await route.fetch()).json();
          for (let i = 0; i < mesh.colors.length; i += 4) {
            mesh.colors.splice(i, 4, 0.01, 0.02, 0.95, 1);
          }
          mesh.factionMasks.fill(mask);
          await route.fulfill({ json: mesh });
        });
      }
      const result = await page.evaluate(() => window.__battleModels.reload());
      ctx.check(`blue mesh with explicit mask ${mask}: replacement loads`, result.ok, result.error);
      await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
      const factions = [await captureInstance(1, 0), await captureInstance(1, 1)];
      ctx.check(
        mask ? "explicit mask permits faction tint" : "ordinary blue does not imply faction tint",
        factions[0].equals(factions[1]) === (mask === 0),
      );
      for (const url of meshUrls) await page.unroute(url);
    }
    const restoredRoster = await page.evaluate(() => window.__battleModels.reload());
    ctx.check("far roster restores authored materials after tint probes", restoredRoster.ok);
    const roster = await page.evaluate(async () => {
      const h = window.__battleModels;
      h.set({
        classId: 0,
        clip: h.world.soldierAssets[0].manifest.presentation.actions.ready.clip,
        alive: true,
        formation: false,
        yaw: 0.15,
        pitch: 1.15,
        zoom: 0.9,
      });
      while (h.stats().pendingDraw) await new Promise(requestAnimationFrame);
      const w = h.world;
      await w.loadPublishedAtlases();
      const entries = Object.entries(w.soldierAssets);
      const instances = entries.flatMap(([id, asset], index) =>
        Array.from({ length: 16 }, (_, n) => ({
          x: ((index % 5) - 2) * 22 + (n % 4) * 2,
          y: (Math.floor(index / 5) - 1.5) * 22 + Math.floor(n / 4) * 2,
          elevation: 0,
          facing: Math.PI / 2,
          classId: Number(id),
          faction: 0,
          alive: true,
          clip: asset.manifest.far.clip,
          phase: asset.manifest.far.phase,
          seed: 0,
          mounted: asset.manifest.mounted,
          lod: 0,
        })),
      );
      await w.drawInstances(instances, structuredClone(w.stats().preparedCamera));
      await w.render();

      return { stats: w.stats(), ids: entries.map(([id]) => Number(id)), count: instances.length };
    });
    ctx.check(
      "complete authored roster uses production far admission",
      roster.ids.length === Object.keys(bindings).length &&
        roster.stats.crowd.instances === roster.count &&
        roster.stats.crowd.visibleTierHistogram.l4 === roster.count,
      roster,
    );
    await ctx.snap(page, "shared/soldiers/workbench/authored-roster-far", {
      threshold: 0,
      maxDiffRatio: 0,
    });
    await checkLatePoseReload(ctx, page);
  } finally {
    await page.close();
  }
}

async function checkManualLifeState(ctx, page) {
  const saved = await page.evaluate(() => ({ ...window.__battleModels.stats().pose }));
  await page.evaluate(() =>
    window.__battleModels.set({
      classId: 0,
      clip: "idle",
      phase: 0.5,
      alive: true,
      formation: false,
      yaw: 0.45,
      pitch: 1.15,
      zoom: 190,
    }),
  );
  const shots = [];
  for (const alive of [true, false, true]) {
    // Reference framing hides the panel; dispatch its native checkbox action.
    await page.locator("#model-alive").evaluate((input, alive) => {
      if (input.checked !== alive) input.click();
    }, alive);
    await page.waitForFunction((alive) => {
      const stats = window.__battleModels.stats();
      return !stats.pendingDraw && stats.pose.alive === alive;
    }, alive);
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    const shot = await page.screenshot();
    shots.push(shot);
    if (shots.length < 3)
      await ctx.snap(page, `shared/soldiers/workbench/manual-${alive ? "alive" : "dead"}`, {
        shot,
        threshold: 0,
        maxDiffRatio: 0,
      });
  }
  ctx.check(
    "manual life control changes corpse treatment without changing the clip",
    !shots[0].equals(shots[1]) && shots[0].equals(shots[2]),
  );
  const pose = await page.evaluate(() => window.__battleModels.stats().pose);
  ctx.check(
    "manual life control preserves clip and phase",
    pose.clip === "idle" && pose.phase === 0.5,
  );
  await page.evaluate((saved) => window.__battleModels.set(saved), saved);
  await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
  await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
}

async function checkLatePoseReload(ctx, page) {
  const restored = await page.evaluate(() => window.__battleModels.reload());
  ctx.check(
    "admission probe starts from the complete authored catalog",
    restored.ok,
    restored.error,
  );
  const catalogUrl = new URL("/assets/soldiers/catalog.json", ctx.target).href;
  await page.route(catalogUrl, async (route) => {
    const catalog = await (await route.fetch()).json();
    delete catalog.appearances[14];
    await route.fulfill({ json: catalog });
  });
  try {
    const result = await page.evaluate(async () => {
      const harness = window.__battleModels;
      const previous = harness.world.soldierAssets;
      const originalFetch = window.fetch;
      let release, signal;
      const entered = new Promise((resolve) => {
        signal = resolve;
      });
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        if (String(args[0]).includes("/catalog.json")) {
          signal();
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        return response;
      };
      try {
        const pending = harness.reload();
        await Promise.race([
          entered,
          pending.then(() => {
            throw new Error("Reload did not await catalog loading");
          }),
        ]);
        harness.set({
          classId: 14,
          clip: harness.world.soldierAssets[14].manifest.presentation.actions.atEase.clip,
          phase: 0,
        });
        release();
        const loaded = await pending;
        return {
          ...loaded,
          retainedGeneration: harness.world.soldierAssets === previous,
          activeClass: harness.stats().pose.classId,
          retainedAppearance: Boolean(harness.world.soldierAssets[14]),
        };
      } finally {
        release?.();
        window.fetch = originalFetch;
      }
    });
    ctx.check(
      "pose changed during catalog loading retains the last valid crowd",
      !result.ok &&
        result.error.includes("appearance 14") &&
        result.retainedAppearance &&
        result.activeClass === 14 &&
        result.retainedGeneration,
      JSON.stringify(result),
    );
  } finally {
    await page.unroute(catalogUrl);
  }
}
