import { PNG } from "pngjs";
export const meta = {
  name: "landscape-water",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: [0, 2, 4, 6].map((t) => `landscape-water-t${t}`),
  describe: "Source water coverage, shallow/deep response and injected-clock phase return.",
};
export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    errorPrefix: "landscape-water",
  });
  const warnings = [];
  page.on("console", (m) => {
    if (m.type() === "warning" && /GPU|shader|bind|validation/i.test(m.text()))
      warnings.push(m.text());
  });
  const capture = async (query) => {
    await page.goto(`${ctx.target}/renderer/landscape-water?${query}`);
    await page.waitForFunction(() => window.__rendererLabReady === true, undefined, {
      timeout: 90000,
    });
    const stats = await page.evaluate(() => window.__rendererLabStats.stats);
    ctx.check(
      `${query}: canonical source untouched`,
      stats.sourceUnchanged && stats.sourceShore,
      JSON.stringify(stats),
    );
    return await page.screenshot({ timeout: 180000 });
  };
  const control = PNG.sync.read(await capture("control=1"));
  const mask = PNG.sync.read(await capture("mask=1"));
  const images = [];
  for (const time of [0, 2, 4, 6]) {
    const shot = await capture(`time=${time}`);
    const image = PNG.sync.read(shot);
    images.push(image);
    const dry = dryDifferences(control, image, mask);
    ctx.check(
      `t${time}: dry land unchanged`,
      dry.count > 50000 && dry.changed === 0,
      JSON.stringify(dry),
    );
    await ctx.snap(null, `landscape-water-t${time}`, { shot, threshold: 0, maxDiffRatio: 0 });
  }
  const returned = PNG.sync.read(await capture("time=8"));
  ctx.check("phase return is exact RGBA", differences(images[0], returned) === 0);
  ctx.check(
    "water motion is visible",
    differences(images[0], images[1], [340, 160, 220, 440]) > 100,
  );
  const near = mean(images[0], [560, 490, 10, 20]),
    deep = mean(images[0], [380, 490, 20, 20]);
  ctx.check(
    "shallows are lighter than offshore water",
    near > deep + 5,
    JSON.stringify({ near, deep }),
  );
  ctx.check("clean GPU validation", warnings.length === 0, warnings.join("\n"));
  await page.close();
}
function differences(a, b, rect = [0, 0, a.width, a.height]) {
  let count = 0;
  for (let y = rect[1]; y < rect[1] + rect[3]; y++)
    for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
      const i = (y * a.width + x) * 4;
      if ([0, 1, 2, 3].some((c) => a.data[i + c] !== b.data[i + c])) count++;
    }
  return count;
}
function mean(a, rect) {
  let sum = 0;
  for (let y = rect[1]; y < rect[1] + rect[3]; y++)
    for (let x = rect[0]; x < rect[0] + rect[2]; x++) {
      const i = (y * a.width + x) * 4;
      sum += (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3;
    }
  return sum / (rect[2] * rect[3]);
}

function dryDifferences(a, b, mask) {
  let changed = 0,
    count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (mask.data[i] !== 0 || mask.data[i + 1] !== 0 || mask.data[i + 2] !== 0) continue;
    count++;
    if ([0, 1, 2, 3].some((c) => a.data[i + c] !== b.data[i + c])) changed++;
  }
  return { changed, count };
}
