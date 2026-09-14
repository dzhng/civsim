import { PNG } from "pngjs";
export const meta = {
  name: "landscape-materials",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["landscape-materials-campaign", "landscape-materials-battle"],
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
  let changed = 0;
  for (let i = 0; i < images[0].data.length; i += 4)
    if (!images[0].data.subarray(i, i + 4).equals(images[1].data.subarray(i, i + 4))) changed++;
  ctx.check(
    "equivalent consumers have identical RGBA",
    changed === 0,
    `${changed} different pixels`,
  );
}
