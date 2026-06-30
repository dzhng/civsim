import { PNG } from 'pngjs';

export const meta = {
  name: 'renderer-fault-injection',
  kind: 'flow',
  world: 'none',
  tier: 'full',
  snapshots: [],
  describe: 'Each forced GPU fault (bad shader, rejected submit, device loss) surfaces a diagnostic, never a silent blank canvas.',
};

function countNonBlank(png) {
  let nonBlank = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (Math.abs(r - 21) > 8 || Math.abs(g - 22) > 8 || Math.abs(b - 26) > 8) nonBlank++;
  }
  return nonBlank;
}

export async function run(ctx) {
  // This scene deliberately triggers console errors (the diagnostics under
  // test), so it manages its own page instead of ctx.newPage() — otherwise the
  // shared "no page errors" gate would flag the expected fault logs.
  const page = await ctx.browser.newPage({ viewport: { width: 900, height: 620 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  try {
    await page.goto(`${ctx.target}/renderer/fault-injection`);
    await page.waitForFunction(
      () => window.__rendererLabReady === true && window.__rendererLabStats?.stats?.route === 'fault-injection',
      undefined,
      { timeout: 18000 },
    );
    await page.waitForFunction(() => typeof window.__faultInjection?.injectBadShader === 'function', undefined, { timeout: 5000 });

    const initialPixels = countNonBlank(PNG.sync.read(await page.screenshot()));
    ctx.check('fault-injection: renders a live frame before any fault', initialPixels > 150000, JSON.stringify({ initialPixels }));

    // 1. Bad shader → structured WGSL compile error (file, line, message).
    const badShader = await page.evaluate(() => window.__faultInjection.injectBadShader());
    ctx.check(
      'fault-injection: bad shader surfaces a structured compile error',
      badShader.badShader?.errorCount > 0
        && typeof badShader.badShader?.firstError?.message === 'string'
        && badShader.badShader.firstError.message.length > 0
        && Number.isFinite(badShader.badShader.firstError.line)
        && badShader.badShader.handlerFired === true,
      JSON.stringify(badShader.badShader),
    );
    ctx.check(
      'fault-injection: bad shader logs a diagnostic (not a blank screen)',
      consoleErrors.some((line) => /WGSL compile error/i.test(line)),
      JSON.stringify(consoleErrors.slice(0, 3)),
    );

    // 2. Rejected submission → captured, structured error, not silent.
    const rejected = await page.evaluate(() => window.__faultInjection.rejectSubmission());
    ctx.check(
      'fault-injection: rejected submission is captured, not silent',
      rejected.rejectedSubmission?.triggered === true && rejected.rejectedSubmission?.captured === true,
      JSON.stringify(rejected.rejectedSubmission),
    );

    // 3. Forced device loss → reaches a defined fatal-error surface, never hangs.
    const lost = await page.evaluate(() => window.__faultInjection.forceDeviceLoss());
    ctx.check(
      'fault-injection: forced device loss reaches a defined fatal state',
      lost.deviceLoss?.triggered === true && lost.deviceLoss?.fatalSurface === true && lost.health?.fatal === true,
      JSON.stringify({ deviceLoss: lost.deviceLoss, health: lost.health }),
    );
    const fatalPanel = await page.evaluate(() => {
      const el = document.getElementById('gpu-fatal-surface');
      return { present: Boolean(el), text: el?.textContent ?? '', fatal: window.__gpuFatal ?? null };
    });
    ctx.check(
      'fault-injection: a reload panel is shown over the canvas after device loss',
      fatalPanel.present && /reset|reload/i.test(fatalPanel.text),
      JSON.stringify(fatalPanel),
    );
  } finally {
    await page.close();
  }
}
