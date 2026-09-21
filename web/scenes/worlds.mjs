export async function battleReal(ctx, opts = {}) {
  const page = await ctx.newPage({ errorPrefix: opts.errorPrefix });
  const params = new URLSearchParams({ map: "A", ai: opts.ai ?? "off" });
  if (opts.debugBlocks) params.set("debug", "blocks");
  await page.goto(`${ctx.target}?${params}`);
  await ready(page, "__ready", opts.timeout);
  await battleRendererReady(page, opts.timeout);
  await page.waitForTimeout(opts.settle ?? 800);
  return page;
}

export async function battleDuel(ctx, opts = {}) {
  const page = await ctx.newPage({ errorPrefix: opts.errorPrefix });
  const params = new URLSearchParams({
    battle: "duel",
    a: String(opts.a ?? 0),
    b: String(opts.b ?? 0),
    ai: opts.ai ?? "off",
  });
  if (opts.debugBlocks) params.set("debug", "blocks");
  await page.goto(`${ctx.target}?${params}`);
  await ready(page, "__ready", opts.timeout);
  await battleRendererReady(page, opts.timeout);
  await page.waitForTimeout(opts.settle ?? 300);
  return page;
}

export async function battle5v5(ctx, opts = {}) {
  const page = await ctx.newPage({
    viewport: opts.viewport,
    deviceScaleFactor: opts.deviceScaleFactor,
    errorPrefix: opts.errorPrefix,
  });
  const params = new URLSearchParams({ battle: "5v5", ai: opts.ai ?? "on" });
  await page.goto(`${ctx.target}?${params}`);
  await ready(page, "__ready", opts.timeout);
  await battleRendererReady(page, opts.timeout);
  return page;
}

export async function campaign(ctx, kind, opts = {}) {
  const page = await ctx.newPage({
    viewport: opts.viewport,
    deviceScaleFactor: opts.deviceScaleFactor,
    errorPrefix: opts.errorPrefix,
  });
  if (kind === "new") {
    await page.goto(`${ctx.target}/`);
    await page.waitForSelector("#menu-new-campaign", { timeout: opts.menuTimeout ?? 60000 });
    await page.click("#menu-new-campaign");
  } else {
    await page.goto(`${ctx.target}/?campaign=${kind}`);
  }
  await ready(page, "__campaignReady", opts.timeout);
  return page;
}

export async function labRoute(ctx, route, query = "") {
  const page = await ctx.newPage({
    viewport: { width: 900, height: 620 },
    errorPrefix: `gpu-${route}`,
  });
  await page.goto(`${ctx.target}/renderer/${route}${query}`);
  await ready(page, "__rendererLabReady", 18000);
  return page;
}

// Cold authored-roster loading is separate from frame-time performance gates.
export async function ready(page, flag, timeoutMs = 60000) {
  await page.waitForFunction((name) => window[name] === true, flag, { timeout: timeoutMs });
}

/** Battle boot contract: the page flag alone means the shell mounted; the
 *  renderer is ready only once it has presented and admitted every soldier.
 *  Every battle boot waits on this so no scene freezes or shoots a half-built
 *  frame. */
export async function battleRendererReady(page, timeoutMs = 60000) {
  await page.waitForFunction(
    () => {
      const stats = window.__game?.stats?.();
      return (
        window.__ready === true &&
        stats?.renderer === "gpu" &&
        stats.renderStats?.ready === true &&
        stats.renderStats.soldiers === stats.soldiers &&
        stats.renderStats.expectedSoldiers === stats.soldiers &&
        stats.renderStats.substrate === "typegpu" &&
        stats.renderStats.presentedFrameId > 0 &&
        stats.renderStats.drawCalls > 0
      );
    },
    undefined,
    { timeout: timeoutMs },
  );
}
