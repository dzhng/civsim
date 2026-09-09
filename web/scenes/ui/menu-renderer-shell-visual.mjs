export const meta = {
  name: "menu-renderer-shell-visual",
  kind: "visual",
  world: "menu",
  tier: "quick",
  snapshots: ["menu-renderer-ready", "menu-renderer-unsupported", "menu-quick-battle-modal"],
  describe:
    "Menu shell WebGPU status, unsupported state, and the custom-battle army builder with weather and faction pickers.",
};

export async function run(ctx) {
  const unsupported = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "menu-renderer-shell-visual-unsupported",
  });
  await unsupported.goto(`${ctx.target}/?gpu=off`);
  await unsupported.waitForFunction(
    () => window.__appShellStats?.gpu?.checked === true,
    undefined,
    { timeout: 18000 },
  );
  await unsupported.waitForTimeout(160);
  await ctx.snap(unsupported, "menu-renderer-unsupported");
  await unsupported.close();

  if (process.env.VERIFY_GPU !== "1") {
    ctx.check(
      "WebGPU menu visuals require VERIFY_GPU=1",
      true,
      "unsupported menu snapshot still ran",
    );
    return;
  }

  const ready = await ctx.newPage({
    viewport: { width: 1280, height: 800 },
    errorPrefix: "menu-renderer-shell-visual-ready",
  });
  await ready.goto(ctx.target);
  await ready.waitForFunction(() => window.__appShellStats?.gpu?.ok === true, undefined, {
    timeout: 18000,
  });
  await ready.waitForTimeout(160);
  await ctx.snap(ready, "menu-renderer-ready");
  await ready.click("#menu-quick-battle");
  await ready.waitForFunction(
    () => document.getElementById("quick-battle-modal")?.classList.contains("open"),
    undefined,
    { timeout: 4000 },
  );
  // A random map thumbnail cannot be a repeatable menu baseline.
  await ready.locator("#qb-generated-seed").fill("7");
  await ready.evaluate(async () => {
    await Promise.all(
      Array.from(document.querySelectorAll("#quick-battle-modal img"), (image) => image.decode()),
    );
  });
  await ready.locator("#quick-battle-modal h2").click();
  await ready.waitForFunction(() => {
    const canvas = document.getElementById("qb-generated-preview");
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] !== 16 || pixels[i + 1] !== 18 || pixels[i + 2] !== 15) colored++;
    return colored > canvas.width * canvas.height * 0.25;
  });
  await ctx.snap(ready, "menu-quick-battle-modal", {
    shot: await ready.screenshot({ animations: "disabled" }),
  });
  await ready.close();
}
