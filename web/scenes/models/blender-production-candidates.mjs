import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { PHOTOREAL_SUBSTRATE } from "../../../packages/photoreal-renderer/src/stats.ts";

export const meta = {
  name: "blender-production-candidates",
  kind: "visual",
  world: "battle-models",
  tier: "full",
  snapshots: ["shared/soldiers/candidates/human", "shared/soldiers/candidates/mounted"],
  describe:
    "Locally authored Blender GLBs baked into complete candidate bundles use the production workbench, weighted poses and sun shadows without replacing the production catalog.",
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  const catalog = "/assets/soldiers/candidates/blender-reference/catalog.json";
  try {
    await page.goto(
      `${ctx.target}/renderer/battle-models?ref=1&catalog=${encodeURIComponent(catalog)}`,
    );
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    const initial = await page.evaluate(() => {
      window.__battleModels.freeze();
      return window.__battleModels.stats();
    });
    ctx.check(
      "candidate catalog initializes its own appearance and clip",
      initial.pose.classId === 40 &&
        initial.pose.clip === "bend" &&
        initial.catalog.endsWith(catalog),
      JSON.stringify(initial.pose),
    );
    await page.evaluate(() => {
      const caption = document.createElement("div");
      caption.id = "candidate-caption";
      caption.style.cssText =
        "position:fixed;left:18px;top:12px;color:#efdfb8;background:#211a12;padding:8px 12px;font:24px Georgia,serif;pointer-events:none";
      document.body.append(caption);
    });
    for (const [id, classId] of [
      ["human", 40],
      ["mounted", 41],
    ]) {
      const metadata = JSON.parse(
        await readFile(
          new URL(
            `../../../packages/soldier-assets/assets/test/blender-reference/${id}.landmarks.json`,
            import.meta.url,
          ),
        ),
      );
      // The standard-loader oracle frames the union of all source poses. Use
      // that same source-space extent, including the composed mounted samples.
      const low = [Infinity, Infinity, Infinity];
      const high = [-Infinity, -Infinity, -Infinity];
      for (const sample of metadata.samples)
        for (const vertices of Object.values(sample.positions))
          for (const [x, y, z] of vertices) {
            [x, -z, y].forEach((value, axis) => {
              low[axis] = Math.min(low[axis], value);
              high[axis] = Math.max(high[axis], value);
            });
          }
      const target = low.map((value, axis) => (value + high[axis]) / 2);
      const zoom = 460 / Math.max(...high.map((value, axis) => value - low[axis]));
      const clips = await page.evaluate(
        (classId) => window.__battleModels.world.soldierAssets[classId].animation.clips,
        classId,
      );
      const samples = metadata.samples.filter((sample) =>
        clips.some((clip) => clip.name === sample.clip),
      );
      ctx.check(
        `${id}: direct source clips are present`,
        samples.length === (id === "human" ? 4 : 8),
        JSON.stringify(clips),
      );
      const tiles = [];
      for (const sample of samples)
        for (const [view, yaw] of [
          ["front", 0.3],
          ["side", 1.6],
        ]) {
          const clip = clips.find((clip) => clip.name === sample.clip);
          const pose = {
            classId,
            clip: sample.clip,
            phase: clip.duration > 0 ? sample.seconds / clip.duration : 0,
            formation: false,
            target,
            zoom,
            yaw,
            pitch: 1.15,
          };
          const before = await page.evaluate(
            ({ pose, caption }) => {
              const harness = window.__battleModels;
              const frame = harness.stats().frame;
              harness.set(pose);
              document.querySelector("#candidate-caption").textContent = caption;
              return frame;
            },
            { pose, caption: `${id} · ${sample.name} · ${view} · production` },
          );
          await page.waitForFunction(
            (frame) => window.__battleModels.stats().frame > frame,
            before,
          );
          await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
          const stats = await page.evaluate(() => window.__battleModels.stats());
          ctx.check(
            `${id}/${sample.name}/${view}: production weighted pose submitted`,
            stats.render.substrate === PHOTOREAL_SUBSTRATE &&
              stats.render.soldiers === 1 &&
              stats.sampled.clip === sample.clip &&
              stats.sampled.phase === pose.phase,
            JSON.stringify(stats.sampled),
          );
          const shot = await page.screenshot();
          const frame = await page.evaluate((pose) => {
            const harness = window.__battleModels;
            const frame = harness.stats().frame;
            harness.set(pose);
            return frame;
          }, pose);
          await page.waitForFunction((frame) => window.__battleModels.stats().frame > frame, frame);
          await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
          ctx.check(
            `${id}/${sample.name}/${view}: fresh render is byte-stable`,
            shot.equals(await page.screenshot()),
          );
          tiles.push(PNG.sync.read(shot));
        }
      const sheet = new PNG({ width: 1280, height: (tiles.length / 2) * 400 });
      tiles.forEach((tile, index) => {
        for (let y = 0; y < 400; y++)
          for (let x = 0; x < 640; x++) {
            const from = (y * 2 * tile.width + x * 2) * 4;
            const to =
              ((Math.floor(index / 2) * 400 + y) * sheet.width + (index % 2) * 640 + x) * 4;
            tile.data.copy(sheet.data, to, from, from + 4);
          }
      });
      await ctx.snap(page, `shared/soldiers/candidates/${id}`, {
        shot: PNG.sync.write(sheet),
        threshold: 0,
        maxDiffRatio: 0,
      });
    }
    const beforeReload = await page.screenshot();
    const reloaded = await page.evaluate(() => window.__battleModels.reload());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
    ctx.check(
      "candidate reload retains the chosen catalog and production pixels",
      reloaded.ok && beforeReload.equals(await page.screenshot()),
    );
    await page.route(`**${catalog}`, (route) =>
      route.fulfill({ contentType: "application/json", body: "invalid local candidate" }),
    );
    const failed = await page.evaluate(() => window.__battleModels.reload());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
    ctx.check(
      "bad candidate rebuild keeps its last good production render",
      !failed.ok && failed.error.length > 0 && beforeReload.equals(await page.screenshot()),
    );
  } finally {
    await page.close();
  }
}
