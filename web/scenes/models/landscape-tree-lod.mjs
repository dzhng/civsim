import { PNG } from "pngjs";
import { writeFileSync } from "node:fs";
import { encodeGif, pngToRGBA } from "../../shots/_gif.mjs";
export const meta = {
  name: "landscape-tree-lod",
  kind: "visual",
  world: "landscape-tree-lod",
  tier: "full",
  snapshots: [
    "shared/props/landscape-tree-lod",
    ...["campaign", "battle"].flatMap((p) =>
      [12, 26, 45].map((z) => `shared/props/tree-lod-${p}-${z}`),
    ),
  ],
  describe: "Production tree crowns retain coverage through zoom and return at both map pitches.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "landscape-tree-lod",
  });
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && /GPU|shader|bind|validation/i.test(message.text()))
      warnings.push(message.text());
  });
  await page.goto(`${ctx.target}/renderer/landscape-tree-lod?ref=1`);
  await page.waitForFunction(() => window.__rendererLabReady === true);
  await ctx.snap(null, "shared/props/landscape-tree-lod", {
    shot: await page.locator("#renderer-canvas").screenshot(),
  });
  for (const [pitchName, pitch] of [
    ["campaign", 0.55],
    ["battle", 1],
  ]) {
    await page.goto(
      `${ctx.target}/renderer/landscape-tree-lod?ref=1&kind=broadleaf&pitch=${pitch}&zoom=12`,
    );
    await page.waitForFunction(() => window.__rendererLabReady === true);
    const frames = [];
    const counts = [];
    const coverage = [];
    for (const zoom of [12, 26, 45, 26, 12]) {
      await page.evaluate((z) => window.__treeLod.draw(z), zoom);
      const shot = await page.locator("#renderer-canvas").screenshot();
      await ctx.snap(null, `shared/props/tree-lod-${pitchName}-${zoom}`, { shot });
      frames.push(pngToRGBA(shot));
      const png = PNG.sync.read(shot);
      let green = 0;
      for (let i = 0; i < png.data.length; i += 4)
        if (png.data[i + 1] > png.data[i] * 1.1 && png.data[i + 1] > png.data[i + 2] * 1.2) green++;
      coverage.push(green / (zoom * zoom));
      counts.push(await page.evaluate(() => window.__treeLod.stats().sceneryDetailed));
    }
    ctx.check(
      `${pitchName}: close leaves return to crown-only distance`,
      counts[0] === 0 && counts[2] > 0 && counts[4] === 0,
      JSON.stringify(counts),
    );
    ctx.check(
      `${pitchName}: crown coverage survives representation changes`,
      Math.min(...coverage) > Math.max(...coverage) * 0.65,
      JSON.stringify(coverage),
    );
    writeFileSync(
      new URL(`../../shots/models/shared/props/tree-lod-${pitchName}.gif`, import.meta.url),
      encodeGif(frames, frames[0].width, frames[0].height, 60),
    );
  }
  ctx.check(
    "tree geometry and shaders have no GPU validation warnings",
    warnings.length === 0,
    warnings.join("\n"),
  );
  await page.close();
}
