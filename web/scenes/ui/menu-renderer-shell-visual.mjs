export const meta = {
  name: 'menu-renderer-shell-visual',
  kind: 'visual',
  world: 'menu',
  tier: 'quick',
  snapshots: ['menu-renderer-ready', 'menu-renderer-unsupported', 'menu-renderer-duel-modal', 'menu-quick-battle-modal'],
  describe: 'Menu shell WebGPU status, unsupported state, duel modal, and the (vanilla) custom-battle army builder.',
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
  // Close the duel (Escape) and open the still-vanilla custom-battle army
  // builder from the React menu — proves the React→vanilla coexistence and
  // gives S4 a baseline of the army builder to preserve when it migrates.
  await ready.keyboard.press('Escape');
  await ready.waitForTimeout(80);
  await ready.click('#menu-quick-battle');
  await ready.waitForFunction(() => document.getElementById('quick-battle-modal')?.classList.contains('open'), undefined, { timeout: 4000 });
  await ready.waitForTimeout(120);
  await ctx.snap(ready, 'menu-quick-battle-modal');
  await ready.close();
}
