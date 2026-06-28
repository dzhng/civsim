export const meta = {
  name: 'menu-webgpu-shell-visual',
  kind: 'visual',
  world: 'menu',
  tier: 'quick',
  snapshots: ['menu-webgpu-ready', 'menu-webgpu-unsupported', 'menu-webgpu-duel-modal'],
  describe: 'Menu shell WebGPU status, unsupported state, and duel modal composition.',
};

export async function run(ctx) {
  const unsupported = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'menu-webgpu-shell-visual-unsupported' });
  await unsupported.goto(`${ctx.target}/?webgpu=off`);
  await unsupported.waitForFunction(() => window.__appShellStats?.webgpu?.checked === true, undefined, { timeout: 18000 });
  await unsupported.waitForTimeout(160);
  await ctx.snap(unsupported, 'menu-webgpu-unsupported');
  await unsupported.close();

  if (process.env.VERIFY_WEBGPU !== '1') {
    ctx.check('WebGPU menu visuals require VERIFY_WEBGPU=1', true, 'unsupported menu snapshot still ran');
    return;
  }

  const ready = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'menu-webgpu-shell-visual-ready' });
  await ready.goto(ctx.target);
  await ready.waitForFunction(() => window.__appShellStats?.webgpu?.ok === true, undefined, { timeout: 18000 });
  await ready.waitForTimeout(160);
  await ctx.snap(ready, 'menu-webgpu-ready');
  await ready.click('#menu-1v1');
  await ready.waitForTimeout(120);
  await ctx.snap(ready, 'menu-webgpu-duel-modal');
  await ready.close();
}
