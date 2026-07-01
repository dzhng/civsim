import { PNG } from "pngjs";
import { battleDuel } from "../worlds.mjs";

export const meta = {
  name: "battle-lod",
  kind: "flow",
  world: "battle-duel",
  tier: "quick",
  snapshots: [],
  describe: "Unit sprite readability across zoom levels.",
};

export async function run(ctx) {
  const page = await battleDuel(ctx, { debugBlocks: true, settle: 400, errorPrefix: "lod" });

  for (const z of [1, 2, 4, 6, 9]) {
    const box = await page.evaluate((zoom) => {
      const a = window.__game.unitInfo(0);
      const c = window.__cam;
      c.zoom = zoom;
      // Centre the unit in frame (viewCenter accounts for the perspective look-ahead).
      c.setViewCenter?.(a[0], a[1]);
      c.clampView?.();
      window.__game.freeze();
      const cnt = a[7];
      const start = window.__game.soldierStartOf(0);
      let x0 = 1e9,
        y0 = 1e9,
        x1 = -1e9,
        y1 = -1e9;
      const dpr = window.devicePixelRatio || 1;
      for (let i = 0; i < cnt; i++) {
        const [wx, wy] = window.__game.soldierPos(start + i);
        const [sx, sy] = c.worldToScreen(wx, wy).map((v) => v * dpr);
        x0 = Math.min(x0, sx);
        x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy);
        y1 = Math.max(y1, sy);
      }
      return [x0, y0, x1, y1];
    }, z);
    const buf = await page.screenshot();
    await page.evaluate(() => window.__game.freeze(false));
    const png = PNG.sync.read(buf);
    const cx0 = Math.max(0, Math.floor(box[0] - 4));
    const cx1 = Math.min(png.width - 1, Math.ceil(box[2] + 4));
    const cy0 = Math.max(0, Math.floor(box[1] - 4));
    const cy1 = Math.min(png.height - 1, Math.ceil(box[3] + 4));
    let n = 0,
      unit = 0,
      blue = 0,
      dark = 0;
    for (let y = cy0; y <= cy1; y++) {
      for (let x = cx0; x <= cx1; x++) {
        const o = (y * png.width + x) * 4;
        const r = png.data[o],
          g = png.data[o + 1],
          b = png.data[o + 2];
        n++;
        if (Math.max(r, g, b) < 45) dark++;
        if (!(g > r + 8 && g > b + 8)) {
          unit++;
          if (b - r > 20 && b > 70) blue++;
        }
      }
    }
    const darkFrac = n > 0 ? dark / n : 1;
    const blueShare = unit ? blue / unit : 0;
    const detail = `darkFrac ${(darkFrac * 100).toFixed(0)}% blueShare ${(blueShare * 100).toFixed(0)}%`;
    ctx.check(`LOD z${z}: unit is not a black slab`, darkFrac < 0.2, detail);
    ctx.check(`LOD z${z}: unit reads team-blue`, blueShare > 0.55, detail);
  }

  await page.close();
}
