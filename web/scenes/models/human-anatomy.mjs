import { PNG } from "pngjs";
import { PHOTOREAL_SUBSTRATE } from "../../../packages/photoreal-renderer/src/stats.ts";
import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";

const views = [
  ["front", 0],
  ["side", Math.PI / 2],
  ["rear", Math.PI],
  ["three-quarter", Math.PI / 4],
];
// Workbench chart pitch is tilt FROM top-down, not elevation above ground.
// Close inspection exposes anatomy; gameplay tilt exposes foreshortening, not a perf envelope.
const cameras = [
  { name: "close", pitch: 1.4, zoom: 230 },
  { name: "gameplay-pitch", pitch: 0.42, zoom: 190 },
];
const crop = { x: 320, y: 96, width: 640, height: 640 };

export const meta = {
  name: "human-anatomy",
  kind: "visual",
  world: "human-anatomy-candidate",
  tier: "full",
  snapshots: cameras.map(({ name }) => `shared/soldiers/anatomy/${name}`),
  describe:
    "Shared untextured Blender anatomy, neutral and deep-bend contact sheets through the production workbench. Candidate-only: no motion, LOD or art-budget acceptance.",
};

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  const catalog = "/assets/soldiers/candidates/human-anatomy/catalog.json";
  try {
    await page.goto(
      `${ctx.target}/renderer/battle-models?ref=1&catalog=${encodeURIComponent(catalog)}`,
    );
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    const admission = await page.evaluate(() => {
      const harness = window.__battleModels;
      harness.freeze();
      const caption = document.createElement("div");
      caption.id = "anatomy-caption";
      caption.style.cssText =
        "position:fixed;left:336px;top:112px;color:#efdfb8;background:#211a12;padding:8px 12px;font:20px Georgia,serif;white-space:pre;pointer-events:none";
      document.body.append(caption);
      return {
        catalog: harness.stats().catalog,
        assets: [0, 14].map((id) => {
          const asset = harness.world.soldierAssets[id];
          return {
            id,
            name: asset.manifest.name,
            presentation: asset.manifest.presentation,
            bones: asset.rig.bones.length,
            triangles: asset.tiers.map((mesh) => mesh.indices.length / 3),
            clips: asset.animation.clips.map(({ name, duration, loop }) => ({
              name,
              duration,
              loop,
            })),
          };
        }),
      };
    });
    ctx.check(
      "shared anatomy candidate is manually inspectable for both first-pair classes",
      admission.catalog.endsWith(catalog) &&
        admission.assets.every(
          (asset) =>
            asset.name === "human-anatomy" &&
            asset.presentation === null &&
            asset.clips.some((clip) => clip.name === "bend" && clip.duration > 0 && !clip.loop),
        ),
      JSON.stringify(admission),
    );

    const capture = async (pose, caption) => {
      const before = await page.evaluate(
        ({ pose, caption }) => {
          const harness = window.__battleModels;
          const frame = harness.stats().frame;
          harness.set(pose);
          document.querySelector("#anatomy-caption").textContent = caption;
          return frame;
        },
        { pose, caption },
      );
      await page.waitForFunction((frame) => window.__battleModels.stats().frame > frame, before);
      await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
      return page.screenshot({ clip: crop });
    };

    for (const camera of cameras) {
      const sheet = new PNG({ width: crop.width * views.length, height: crop.height * 2 });
      let tile = 0;
      for (const [stance, phase] of [
        ["neutral", 0],
        ["deep bend", 0.5],
      ]) {
        for (const [view, yaw] of views) {
          const pose = {
            classId: 0,
            clip: "bend",
            phase,
            formation: false,
            target: [0, 0, 0.95],
            yaw,
            pitch: camera.pitch,
            zoom: camera.zoom,
          };
          const caption = `Shared human candidate · ${camera.name}\n${stance} · ${view}`;
          const shot = await capture(pose, caption);
          const stats = await page.evaluate(() => window.__battleModels.stats());
          ctx.check(
            `${camera.name}/${stance}/${view}: production weighted pose submitted`,
            stats.render.substrate === PHOTOREAL_SUBSTRATE &&
              stats.render.width === 1280 &&
              stats.render.height === 800 &&
              stats.render.soldiers === 1 &&
              stats.render.lod.skinned === 1 &&
              stats.sampled.clip === "bend" &&
              stats.sampled.phase === phase &&
              stats.render.crowd.palettes.some(
                (palette) => palette.bones === admission.assets[0].bones,
              ),
            JSON.stringify({
              sampled: stats.sampled,
              lod: stats.render.lod,
              palettes: stats.render.crowd.palettes,
            }),
          );
          ctx.check(
            `${camera.name}/${stance}/${view}: newly rendered frozen crop is byte-stable`,
            shot.equals(await capture(pose, caption)),
          );
          // Both class entries share the same human, so verify selection without duplicating sheets.
          if (tile === 0) {
            ctx.check(
              `${camera.name}: class 14 selects the same shared anatomy pixels`,
              shot.equals(await capture({ ...pose, classId: 14 }, caption)),
            );
          }
          const image = PNG.sync.read(shot);
          PNG.bitblt(
            image,
            sheet,
            0,
            0,
            crop.width,
            crop.height,
            (tile % views.length) * crop.width,
            Math.floor(tile / views.length) * crop.height,
          );
          tile++;
        }
      }
      // Exact deterministic captures: there is no admitted raster-noise allowance.
      await ctx.snap(page, `shared/soldiers/anatomy/${camera.name}`, {
        shot: PNG.sync.write(sheet),
        threshold: 0,
        maxDiffRatio: 0,
      });
    }
  } finally {
    await page.close();
  }
}
