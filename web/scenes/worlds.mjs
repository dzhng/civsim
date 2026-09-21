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

/** Settle physical terrain before measuring or photographing a campaign view.
 * Keep this outside immediate-frame assertions: those deliberately observe the
 * frame just submitted by cam(), not a later settled frame. */
export async function campaignPresentationReady(page, timeout = 120000) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  await page.waitForFunction(
    () =>
      window.__campaignGpuStats?.residency?.ready ||
      window.__campaignGpuStats?.residency?.failed?.length,
    undefined,
    { timeout },
  );
  const failed = await page.evaluate(() => window.__campaignGpuStats.residency.failed);
  if (failed.length) throw new Error(`Campaign terrain failed: ${JSON.stringify(failed)}`);
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

/** Require both first-frame settlement and the complete soldier upload before
 * freezing or photographing a battle. Terminal GPU failure ends the wait. */
export async function battleRendererReady(page, timeoutMs = 60000) {
  try {
    await page.waitForFunction(
      () => {
        const stats = window.__game?.stats?.();
        return (
          window.__gpuFatal ||
          (window.__ready === true &&
            stats?.renderer === "gpu" &&
            stats.renderStats?.ready === true &&
            stats.renderStats.soldiers === stats.soldiers &&
            stats.renderStats.expectedSoldiers === stats.soldiers &&
            stats.renderStats.substrate === "typegpu" &&
            stats.renderStats.presentedFrameId > 0 &&
            stats.renderStats.drawCalls > 0)
        );
      },
      undefined,
      { timeout: timeoutMs },
    );
  } catch (error) {
    // A blocked page must not make timeout diagnosis itself unbounded.
    let timer;
    let state;
    try {
      state = await Promise.race([
        page
          .evaluate(() => {
            const stats = window.__game?.stats?.();
            return {
              ready: window.__ready,
              fatal: window.__gpuFatal,
              renderer: stats?.renderer,
              renderReady: stats?.renderStats?.ready,
              soldiers: stats?.soldiers,
              uploaded: stats?.renderStats?.soldiers,
              loading: document.getElementById("battle-loading")?.textContent,
            };
          })
          .catch((reason) => ({ snapshotError: String(reason) })),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve({ unresponsive: true }), 5000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    throw new Error(`${error.message}; battle readiness state: ${JSON.stringify(state)}`, {
      cause: error,
    });
  }
  const fatal = await page.evaluate(() => window.__gpuFatal);
  if (fatal) throw new Error(`Battle renderer failed: ${JSON.stringify(fatal)}`);
}
