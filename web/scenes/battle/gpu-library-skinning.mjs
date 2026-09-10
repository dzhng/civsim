import { mkdir, writeFile } from "node:fs/promises";
import { UNIT_INFO } from "../_battle-unit-info.mjs";
import { campaign } from "../worlds.mjs";

export const meta = {
  name: "gpu-library-skinning",
  kind: "visual",
  world: "battle-5v5",
  tier: "full",
  snapshots: ["gpu-library-battle-close", "gpu-library-campaign-close"],
  describe: "Actual weighted soldier skinning in battle mesh/shadow and campaign raw pipelines.",
};
export async function run(ctx) {
  const expected = process.env.RENDERER_LIBRARY ?? "native";
  const baseDir =
    process.env.VERIFY_GPU_ADAPTER === "hardware"
      ? new URL("../../../specs/gpu-library-production-spike/evidence/reference/", import.meta.url)
          .pathname
      : undefined;
  async function capture(page, name) {
    const shot = await page.screenshot();
    await ctx.snap(page, name, { baseDir, shot });
    if (baseDir) {
      const dir = new URL(
        `../../../specs/gpu-library-production-spike/evidence/${expected}/`,
        import.meta.url,
      );
      await mkdir(dir, { recursive: true });
      await writeFile(new URL(`${name}.png`, dir), shot);
    }
  }
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${ctx.target}?battle=5v5&ai=off`);
  await page.waitForFunction(
    () => window.__ready && window.__game?.stats().renderStats?.ready,
    undefined,
    { timeout: 60000 },
  );
  await page.evaluate(async (info) => {
    window.__game.freeze();
    const unit = window.__game.unitInfo(4);
    Object.assign(window.__cam, { yaw: 0, zoom: 24, x: unit[info.x], y: unit[info.y] });
    window.__cam.clampView?.();
    await window.__game.freezeAtTick(240);
  }, UNIT_INFO);
  await page.waitForTimeout(500);
  const crowd = await page.evaluate(() => window.__game.stats().renderStats.crowd);
  ctx.check(
    "selected battle kernel renders visible and shadow meshes",
    crowd.skinningLibrary === expected && crowd.meshDrawCalls > 0 && crowd.shadowMeshDrawCalls > 0,
    JSON.stringify({
      library: crowd.skinningLibrary,
      meshDrawCalls: crowd.meshDrawCalls,
      shadowMeshDrawCalls: crowd.shadowMeshDrawCalls,
      tiers: crowd.tierHistogram,
    }),
  );
  await capture(page, "gpu-library-battle-close");
  await page.close();
  const map = await campaign(ctx, "test", {
    viewport: { width: 1280, height: 800 },
    timeout: 60000,
  });
  await map.evaluate(() => {
    window.__campaign.freeze(true);
    const army = window.__campaign.armies().find((a) => a.mine);
    window.__campaign.cam(army.x, army.y, 18);
  });
  await map.waitForTimeout(500);
  const raw = await map.evaluate(() => window.__campaignGpuStats.soldierCrowd);
  ctx.check(
    "selected campaign kernel renders soldiers",
    raw.skinningLibrary === expected && raw.instances > 0,
    JSON.stringify(raw),
  );
  await capture(map, "gpu-library-campaign-close");
  await map.close();
}
