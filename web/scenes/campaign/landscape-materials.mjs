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
  const authored = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const authoredWarnings = [];
  authored.on("console", (m) => {
    if (m.type() === "warning" && /GPU|shader|bind|validation/i.test(m.text()))
      authoredWarnings.push(m.text());
  });
  await authored.goto(`${ctx.target}/renderer/landscape-materials?consumer=battle&slopes=authored`);
  await authored.waitForFunction(() => window.__rendererLabReady === true);
  await authored.waitForTimeout(500);
  const authoredPixels = changedPixels(images[1], PNG.sync.read(await authored.screenshot()));
  ctx.check(
    "authored terrain without gameplay slope bands retains shared face response",
    authoredPixels === 0,
    `${authoredPixels} different pixels from equivalent explicit profile`,
  );
  ctx.check(
    "authored material preserves source height, normals and semantic tint",
    await authored.evaluate(() => window.__rendererLabStats.stats.sourceUnchanged === true),
  );
  ctx.check(
    "authored material has clean GPU validation",
    authoredWarnings.length === 0,
    authoredWarnings.join("\n"),
  );
  for (const slopes of ["authored", "generated"]) {
    await authored.goto(
      `${ctx.target}/renderer/landscape-materials?consumer=battle&slopes=${slopes}&tint=rock`,
    );
    await authored.waitForFunction(() => window.__rendererLabReady === true);
    await authored.waitForTimeout(500);
    const pixels = changedPixels(images[1], PNG.sync.read(await authored.screenshot()));
    ctx.check(
      slopes === "authored"
        ? "authored rock footprints retain ground color while geometric faces still respond"
        : "generated exposed-rock classification still changes surface response",
      slopes === "authored" ? pixels === 0 : pixels > 100,
      `${pixels} changed pixels`,
    );
  }
  await authored.close();
  const control = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "landscape-materials-scale-control",
  });
  const controlWarnings = [];
  control.on("console", (m) => {
    if (m.type() === "warning" && /GPU|shader|bind|validation/i.test(m.text()))
      controlWarnings.push(m.text());
  });
  for (const view of ["near", "far"]) {
    await control.goto(`${ctx.target}/renderer/landscape-materials?view=${view}`);
    await control.waitForFunction(() => window.__rendererLabReady === true);
    await control.waitForTimeout(500);
    await ctx.snap(control, `landscape-materials-${view}`, { threshold: 0, maxDiffRatio: 0 });
  }
  ctx.check(
    "scale controls have clean GPU validation",
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
