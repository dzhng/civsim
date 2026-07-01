export async function battleReal(ctx, opts = {}) {
  const page = await ctx.newPage({ errorPrefix: opts.errorPrefix });
  const params = new URLSearchParams({ map: "A", ai: opts.ai ?? "off" });
  if (opts.debugBlocks) params.set("debug", "blocks");
  await page.goto(`${ctx.target}?${params}`);
  await page.waitForFunction(() => window.__ready === true, undefined, {
    timeout: opts.timeout ?? 20000,
  });
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
  await page.waitForFunction(() => window.__ready === true, undefined, {
    timeout: opts.timeout ?? 20000,
  });
  await page.waitForTimeout(opts.settle ?? 300);
  return page;
}

export async function battle5v5(ctx, opts = {}) {
  const page = await ctx.newPage({ errorPrefix: opts.errorPrefix });
  const params = new URLSearchParams({ battle: "5v5", ai: opts.ai ?? "on" });
  await page.goto(`${ctx.target}?${params}`);
  await page.waitForFunction(() => window.__ready === true, undefined, {
    timeout: opts.timeout ?? 20000,
  });
  return page;
}

export async function bannerGallery(ctx) {
  const page = await ctx.newPage({ errorPrefix: "banner" });
  await page.goto(`${ctx.target}?test=banners`);
  await page.waitForSelector("#banner-gallery .ubanner", { timeout: 10000 });
  await page.waitForTimeout(150);
  return page;
}
