import { PNG } from "pngjs";
import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.mjs";
import { PHOTOREAL_SUBSTRATE } from "../../../packages/photoreal-renderer/src/stats.ts";

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
    for (const [name, pose] of [
      [
        "heavy-front",
        { classId: 0, clip: "idle", phase: 0, yaw: 0.45, pitch: 1.15, zoom: 190, formation: false },
      ],
      [
        "phalanx-side",
        { classId: 14, clip: "idle", phase: 0, yaw: 1.2, pitch: 1.15, zoom: 150, formation: false },
      ],
      [
        "formation",
        {
          classId: 0,
          clip: "march",
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
      await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
      const stats = await page.evaluate(() => window.__battleModels.stats());
      ctx.check(
        `${name}: production path and submitted count`,
        stats.render.substrate === PHOTOREAL_SUBSTRATE &&
          stats.render.soldiers === (pose.formation ? 16 : 1),
        JSON.stringify({ substrate: stats.render.substrate, soldiers: stats.render.soldiers }),
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
    const before = await page.screenshot();
    const loaded = await page.evaluate(() => window.__battleModels.reload());
    await page.waitForFunction(() => window.__battleModels.stats().reloads === 1);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
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
    await page.route("**/assets/soldiers/catalog.json", (route) =>
      route.fulfill({ contentType: "application/json", body: "malformed fixture" }),
    );
    const failed = await page.evaluate(() => window.__battleModels.reload());
    ctx.check(
      "failed reload is explicit and preserves last good crowd",
      !failed.ok &&
        failed.error.length > 0 &&
        (await page.evaluate(() => window.__battleModels.stats().render.soldiers === 16)),
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
      !incompatible.ok && incompatible.error.includes("active appearance"),
    );
    await page.unroute("**/assets/soldiers/catalog.json");
    await page.route(animationUrl, async (route) => {
      const response = await route.fetch();
      const animation = await response.json();
      animation.clips = animation.clips.filter((clip) => clip.name !== "march");
      await route.fulfill({ json: animation });
    });
    const missingClip = await page.evaluate(() => window.__battleModels.reload());
    ctx.check(
      "incompatible reload retains the active appearance-specific clip",
      !missingClip.ok && missingClip.error.includes("active appearance"),
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
      "truncated animation matrix data is rejected explicitly",
      !truncated.ok && truncated.error.includes("matrix data"),
      JSON.stringify(truncated),
    );
    await page.unroute(animationUrl);
    await page.route(animationUrl, async (route) => {
      const response = await route.fetch();
      const animation = await response.json();
      animation.clips = animation.clips.filter((clip) => clip.name !== "attack_a");
      await route.fulfill({ json: animation });
    });
    const missingFutureAction = await page.evaluate(() => window.__battleModels.reload());
    ctx.check(
      "production reload rejects a missing non-active action before replacing the crowd",
      !missingFutureAction.ok &&
        missingFutureAction.error.includes("attack_a") &&
        (await page.evaluate(() =>
          window.__battleModels.world.soldierAssets[0].animation.clips.some(
            (clip) => clip.name === "attack_a",
          ),
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
      incompleteStartup?.includes("attack_a"),
      String(incompleteStartup),
    );
    await page.unroute(animationUrl);
    const nodesBefore = await page.evaluate(
      () => window.__battleModels.world.world.scene.children.length,
    );
    await page.route(animationUrl, async (route) => {
      const response = await route.fetch();
      const vat = await response.json();
      delete vat.clips;
      await route.fulfill({ json: vat });
    });
    for (let retry = 0; retry < 2; retry++) {
      const malformed = await page.evaluate(() => window.__battleModels.reload());
      const nodesAfter = await page.evaluate(
        () => window.__battleModels.world.world.scene.children.length,
      );
      ctx.check(
        `invalid VAT retry ${retry}: no orphaned scene meshes`,
        !malformed.ok && nodesBefore === nodesAfter,
        JSON.stringify({ nodesBefore, nodesAfter }),
      );
    }
    await page.unroute(animationUrl);
    const allocationFailure = await page.evaluate(async () => {
      const harness = window.__battleModels;
      const scene = harness.world.world.scene;
      const add = scene.add;
      const before = scene.children.length;
      let attempts = 0;
      let peak = before;
      scene.add = function (...objects) {
        if (++attempts === 3) throw new Error("Injected replacement allocation failure");
        const result = add.apply(this, objects);
        peak = Math.max(peak, this.children.length);
        return result;
      };
      try {
        const result = await harness.reload();
        return { ...result, before, after: scene.children.length, peak, attempts };
      } finally {
        scene.add = add;
      }
    });
    ctx.check(
      "partially allocated replacement is rolled back without orphaned meshes",
      !allocationFailure.ok &&
        allocationFailure.error.includes("Injected replacement allocation failure") &&
        allocationFailure.peak > allocationFailure.before &&
        allocationFailure.before === allocationFailure.after,
      JSON.stringify(allocationFailure),
    );
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
    ctx.check(
      "rejected bundles preserve the last good production pixels",
      after.equals(await page.screenshot()),
    );
    // The failed reload schedules a redraw of the retained pose. Finish it
    // before manually driving the two production entry points.
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    await page.evaluate(async () => {
      // three's post scene PassNode updates once per browser frame. A second
      // submission in the retained pose's frame would sample its cached image.
      await new Promise(requestAnimationFrame);
      const world = window.__battleModels.world;
      world.setStatic(new Uint32Array(1), [0], [0]);
      world.draw(
        new Float32Array([0, 0]),
        new Float32Array([Math.PI / 2]),
        new Float32Array([1]),
        new Float32Array([1]),
        1,
        world.stats().camera,
        [0],
        120,
      );
      world.render();
      await world.settlePresentedFrame();
    });
    ctx.check(
      "battle submission replaces the retained formation",
      await page.evaluate(() => window.__battleModels.world.stats().soldiers === 1),
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
    await page.evaluate(async (source) => {
      const { buildCrowdInstances } = await import("/@fs" + source);
      await new Promise(requestAnimationFrame);
      const world = window.__battleModels.world;
      const built = buildCrowdInstances({
        positions: new Float32Array([0, 0]),
        facings: new Float32Array([Math.PI / 2]),
        frames: new Float32Array([1]),
        alive: new Float32Array([1]),
        soldierUnit: new Uint32Array(1),
        unitTeam: [0],
        unitClass: [0],
        simTick: 120,
        terrainHeight: () => 0,
      });
      world.drawInstances(built.instances, world.stats().camera);
      world.render();
      await world.settlePresentedFrame();
    }, instanceModule);
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
    await page.waitForFunction(() => window.__battleModels.stats().reloads === 2);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
    await ctx.snap(page, "shared/soldiers/workbench/controls", { threshold: 0, maxDiffRatio: 0 });
  } finally {
    await page.close();
  }
}
