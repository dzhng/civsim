import { PNG } from "pngjs";
export const meta = {
  name: "campaign-composition",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: [
    "campaign-composition",
    "campaign-composition-selected",
    "campaign-composition-fog",
    "campaign-composition-dpr2",
    "campaign-composition-flat",
  ],
  describe: "One physical campaign world for terrain, roads, entities and interaction.",
};
export async function run(ctx) {
  for (const dpr of [1, 2]) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: dpr,
      errorPrefix: `campaign-composition-${dpr}`,
    });
    const warnings = [];
    page.on("console", (m) => {
      if (m.type() === "warning" && /GPU|shader|bind|validation/i.test(m.text()))
        warnings.push(m.text());
    });
    await page.goto(`${ctx.target}/renderer/campaign-composition?ref=1`);
    await page.waitForFunction(() => window.__rendererLabReady === true, undefined, {
      timeout: 90000,
    });
    await page.waitForTimeout(1000);
    const stats = await page.evaluate(() => window.__rendererLabStats.stats);
    ctx.check(
      `DPR${dpr}: single world draws the composition`,
      stats.objects === 3 && stats.triangles > 1000,
      JSON.stringify(stats),
    );
    const screenshot = await page.screenshot({ timeout: 180000 });
    await ctx.snap(null, dpr === 1 ? "campaign-composition" : "campaign-composition-dpr2", {
      threshold: 0,
      maxDiffRatio: 0,
      shot: screenshot,
    });
    // Fixed CSS coordinates selected from the rendered body pixels, not from the
    // renderer's projection helper or debug selection hooks.
    await page.mouse.click(797, 450);
    ctx.check(
      `DPR${dpr}: actual elevated army click`,
      (await page.evaluate(() => window.__rendererLabStats.stats.selected)) === "army",
    );
    if (dpr === 1)
      await ctx.snap(null, "campaign-composition-selected", {
        threshold: 0,
        maxDiffRatio: 0,
        shot: await page.screenshot(),
      });
    await page.locator("#composition-fog").click();
    const fog = await page.evaluate(() => window.__rendererLabStats.stats);
    ctx.check(
      `DPR${dpr}: fog hides entity, flag, label and selection`,
      fog.objects === 2 &&
        fog.standards.standards === 2 &&
        fog.selected === null &&
        (await page.locator('[data-entity="army"]').count()) === 0,
      JSON.stringify(fog),
    );
    if (dpr === 1)
      await ctx.snap(null, "campaign-composition-fog", {
        threshold: 0,
        maxDiffRatio: 0,
        shot: await page.screenshot(),
      });
    await page.locator("#composition-fog").click();
    await page.mouse.click(420, 505);
    ctx.check(
      `DPR${dpr}: actual city click`,
      (await page.evaluate(() => window.__rendererLabStats.stats.selected)) === "city",
    );
    await page.setViewportSize({ width: 1100, height: 750 });
    await page.waitForTimeout(300);
    await page.locator("#composition-reset").click();
    await page.waitForFunction(() => window.__rendererLabStats.stats.generation === 1, undefined, {
      timeout: 90000,
    });
    ctx.check(
      `DPR${dpr}: resized world recreates`,
      (await page.evaluate(() => window.__rendererLabStats.stats.objects)) === 3,
    );
    ctx.check(`DPR${dpr}: GPU validation clean`, warnings.length === 0, warnings.join("\n"));
    if (dpr === 1) {
      const blue = (shot) => {
        const image = PNG.sync.read(shot);
        let count = 0;
        for (let y = 298; y < 340; y++)
          for (let x = 590; x < 635; x++) {
            const k = (y * image.width + x) * 4;
            const [r, g, b] = image.data.subarray(k, k + 3);
            if (b > r * 1.2 && b > g * 1.1) count++;
          }
        return count;
      };
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${ctx.target}/renderer/campaign-composition?ref=1&ridge=0`);
      await page.waitForFunction(() => window.__rendererLabReady === true, undefined, {
        timeout: 90000,
      });
      await page.waitForTimeout(1000);
      const flatShot = await page.screenshot();
      await ctx.snap(null, "campaign-composition-flat", {
        threshold: 0,
        maxDiffRatio: 0,
        shot: flatShot,
      });
      const roadPixels = (shot) => {
        const image = PNG.sync.read(shot);
        let count = 0;
        for (let y = 298; y < 345; y++)
          for (let x = 520; x < 555; x++) {
            const k = (y * image.width + x) * 4;
            const [r, g, b] = image.data.subarray(k, k + 3);
            if (r > 165 && Math.max(r, g, b) - Math.min(r, g, b) < 20) count++;
          }
        return count;
      };
      ctx.check(
        "ridge occludes the rear road",
        roadPixels(flatShot) > 5 && roadPixels(screenshot) === 0,
        JSON.stringify({ exposed: roadPixels(flatShot), occluded: roadPixels(screenshot) }),
      );
      const exposed = blue(flatShot),
        occluded = blue(screenshot);
      ctx.check(
        "ridge occludes rear army despite hostile submission order",
        exposed > 15 && occluded === 0,
        JSON.stringify({ exposed, occluded }),
      );
    }
    await page.close();
  }
}
