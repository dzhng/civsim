import { PNG } from "pngjs";
export const meta = {
  name: "landscape-materials",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: [
    "landscape-materials-campaign",
    "landscape-materials-battle",
    "landscape-materials-near",
    "landscape-materials-far",
  ],
  describe:
    "Equivalent dry inputs share rock, grass and steep-face response through both terrain consumers.",
};
export async function run(ctx) {
  const images = [];
  for (const consumer of ["campaign", "battle"]) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      errorPrefix: `landscape-materials-${consumer}`,
    });
    const warnings = [];
    page.on("console", (m) => {
      if (m.type() === "warning" && /GPU|shader|bind|validation/i.test(m.text()))
        warnings.push(m.text());
    });
    await page.goto(`${ctx.target}/renderer/landscape-materials?consumer=${consumer}`);
    await page.waitForFunction(() => window.__rendererLabReady === true);
    await page.waitForTimeout(500);
    const shot = await page.screenshot();
    images.push(PNG.sync.read(shot));
    ctx.check(`${consumer}: clean GPU validation`, warnings.length === 0, warnings.join("\n"));
    await ctx.snap(null, `landscape-materials-${consumer}`, {
      shot,
      threshold: 0,
      maxDiffRatio: 0,
    });
    await page.close();
  }
  const changed = changedPixels(images[0], images[1]);
  ctx.check(
    "equivalent consumers have identical RGBA",
    changed === 0,
    `${changed} different pixels`,
  );
  const control = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "landscape-materials-normal-control",
  });
  const controlWarnings = [];
  control.on("console", (m) => {
    if (m.type() === "warning" && /GPU|shader|bind|validation/i.test(m.text()))
      controlWarnings.push(m.text());
  });
  await control.goto(`${ctx.target}/renderer/landscape-materials?normal=geometric`);
  await control.waitForFunction(() => window.__rendererLabReady === true);
  await control.waitForTimeout(500);
  const normalPixels = changedPixels(images[0], PNG.sync.read(await control.screenshot()));
  ctx.check(
    "procedural normal changes visible shading",
    normalPixels > 100,
    `${normalPixels} pixels respond to the normal field`,
  );
  for (const view of ["near", "far"]) {
    await control.goto(`${ctx.target}/renderer/landscape-materials?view=${view}`);
    await control.waitForFunction(() => window.__rendererLabReady === true);
    await control.waitForTimeout(500);
    await ctx.snap(control, `landscape-materials-${view}`, { threshold: 0, maxDiffRatio: 0 });
  }
  ctx.check(
    "normal and scale controls have clean GPU validation",
    controlWarnings.length === 0,
    controlWarnings.join("\n"),
  );
  await control.close();
}

function changedPixels(a, b) {
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if (!a.data.subarray(i, i + 4).equals(b.data.subarray(i, i + 4))) changed++;
  return changed;
}
