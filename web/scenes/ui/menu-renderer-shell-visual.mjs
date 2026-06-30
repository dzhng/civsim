export const meta = {
  name: 'menu-renderer-shell-visual',
  kind: 'visual',
  world: 'menu',
  tier: 'quick',
  snapshots: ['menu-renderer-ready', 'menu-renderer-unsupported', 'menu-renderer-duel-modal'],
  describe: 'Menu shell WebGPU status, unsupported state, and duel modal composition.',
};

export async function run(ctx) {
  const unsupported = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'menu-renderer-shell-visual-unsupported' });
  await unsupported.goto(`${ctx.target}/?gpu=off`);
  await unsupported.waitForFunction(() => window.__appShellStats?.gpu?.checked === true, undefined, { timeout: 18000 });
  await unsupported.waitForTimeout(160);
  await ctx.snap(unsupported, 'menu-renderer-unsupported');
  await unsupported.close();

  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('WebGPU menu visuals require VERIFY_GPU=1', true, 'unsupported menu snapshot still ran');
    return;
  }

  const ready = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'menu-renderer-shell-visual-ready' });
  await ready.goto(ctx.target);
  await ready.waitForFunction(() => window.__appShellStats?.gpu?.ok === true, undefined, { timeout: 18000 });
  await ready.waitForTimeout(160);
  await ctx.snap(ready, 'menu-renderer-ready');
  await ready.click('#menu-1v1');
  await ready.waitForTimeout(120);
  await ctx.snap(ready, 'menu-renderer-duel-modal');
  await ready.close();
}
