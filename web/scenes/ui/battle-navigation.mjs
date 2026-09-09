import { ready } from "../worlds.mjs";

export const meta = {
  name: "battle-navigation",
  kind: "flow",
  world: "menu",
  tier: "quick",
  snapshots: ["battle-loading"],
  describe:
    "Cold battle loads stay visible and paused; setup/run URLs survive Back, Forward and reload.",
};

export async function run(ctx) {
  if (process.env.VERIFY_GPU !== "1") return;
  const page = await ctx.newPage({ viewport: { width: 1600, height: 900 } });
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/soldiers/catalog.json", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(ctx.target);
  await page.locator("#menu-quick-battle").click();
  await page.waitForURL("**/battle");
  await page.locator("#qb-weather").selectOption("dusk");
  await page.locator("#qb-launch").click();
  await page.waitForURL("**/battle/run?*");
  await page.locator("#battle-loading").waitFor();
  const runUrl = page.url();
  const chosen = JSON.parse(new URL(runUrl).searchParams.get("setup"));
  const before = await page.evaluate(() => window.__game.tickCount());
  await ctx.snap(page, "battle-loading", {
    shot: await page.screenshot({ animations: "disabled" }),
  });
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.__game.tickCount());
  ctx.check(
    "battle does not advance while assets are pending",
    before === 0 && after === 0,
    JSON.stringify({ before, after }),
  );
  release();
  await ready(page, "__ready", 120000);
  ctx.check(
    "loading cover clears after the battlefield renders",
    (await page.locator("#battle-loading").count()) === 0,
  );
  await page.goBack();
  await page.waitForURL("**/battle?*");
  await page.locator("#qb-launch").waitFor();
  ctx.check(
    "Back restores the chosen setup",
    JSON.stringify(JSON.parse(new URL(page.url()).searchParams.get("setup"))) ===
      JSON.stringify(chosen) && (await page.locator("#qb-weather").inputValue()) === "dusk",
  );
  await page.reload();
  await page.locator("#qb-launch").waitFor();
  ctx.check(
    "setup reload preserves weather",
    (await page.locator("#qb-weather").inputValue()) === "dusk",
  );
  await page.goForward();
  await page.waitForURL(runUrl);
  await ready(page, "__ready", 120000);
  await page.reload();
  await ready(page, "__ready", 120000);
  ctx.check("run reload keeps the exact starting battle URL", page.url() === runUrl);
  await page.close();
}
