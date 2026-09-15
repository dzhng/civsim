import { PNG } from "pngjs";
export const meta = {
  name: "scenery-normals",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["scenery-normals-uniform", "scenery-normals-tall", "scenery-normals-wide"],
  describe:
    "Nonuniform scenery instances match an independently inverse-transpose baked reference under fixed light.",
};
export async function run(ctx) {
  for (const pose of ["uniform", "tall", "wide"]) {
    const shots = [];
    for (const baked of [false, true]) {
      const page = await ctx.newPage({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        errorPrefix: `scenery-normals-${pose}`,
      });
      const warnings = [];
      page.on("console", (m) => {
        if (m.type() === "warning" && /GPU|shader|bind|validation/i.test(m.text()))
          warnings.push(m.text());
      });
      await page.goto(`${ctx.target}/renderer/scenery-normals?pose=${pose}&baked=${baked ? 1 : 0}`);
      await page.waitForFunction(() => window.__rendererLabStats?.route === "scenery-normals");
      await page.waitForTimeout(500);
      const shot = await page.screenshot();
      shots.push(PNG.sync.read(shot));
      if (!baked)
        await ctx.snap(null, `scenery-normals-${pose}`, { shot, threshold: 0, maxDiffRatio: 0 });
      ctx.check(
        `${pose}/${baked ? "baked" : "instance"}: clean GPU validation`,
        !warnings.length,
        warnings.join("\n"),
      );
      await page.close();
    }
    let changed = 0,
      maxDelta = 0,
      channelDelta = 0;
    for (let i = 0; i < shots[0].data.length; i++) {
      const d = Math.abs(shots[0].data[i] - shots[1].data[i]);
      maxDelta = Math.max(maxDelta, d);
      channelDelta += d;
    }
    for (let i = 0; i < shots[0].data.length; i += 4)
      if (!shots[0].data.subarray(i, i + 4).equals(shots[1].data.subarray(i, i + 4))) changed++;
    ctx.check(
      `${pose}: instance matches inverse-transpose reference`,
      // CPU-baked attributes and GPU arithmetic normalize in different orders.
      // This bound only covers their quantization; each instance snapshot stays exact.
      maxDelta <= 3 && channelDelta / shots[0].data.length < 0.004,
      `${changed} different RGBA pixels; maxDelta=${maxDelta}; channelDelta=${channelDelta}`,
    );
  }
}
