import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { run } from '../../../../../web/scenes/models/battle-model-budget.mjs';
import { GPU_HARDWARE_FLAGS } from '../../../../../web/renderer-probe-lib.mjs';
const require = createRequire(new URL('../../../../../web/package.json', import.meta.url));
const { chromium } = require('playwright');
Object.assign(process.env, {
  VERIFY_GPU: '1', VERIFY_GPU_ADAPTER: 'hardware', BUDGET_FIXTURE: 'mounted',
  BUDGET_DETAIL: JSON.stringify({ subdivisions: [3,1,0], jointCopies: 8, influences: 4, keySubdivisions: 2 }),
  BUDGET_TEXTURE_SIZE: '1024', BUDGET_STOPS: 'close', BUDGET_FRAMES: '180',
  BUDGET_CAMERA: 'gameplay', BUDGET_WIDTH: '1280', BUDGET_HEIGHT: '800', BUDGET_SOLDIERS: '30000',
});
const checks = [], errors = [];
let profile, clockMetrics;
const browser = await chromium.launch({ channel: 'chrome', args: GPU_HARDWARE_FLAGS });
try {
  await run({
    target: 'http://127.0.0.1:5177',
    check(name, ok, detail) { checks.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name); },
    async newPage(options) {
      const page = await browser.newPage(options);
      page.on('pageerror', error => errors.push(String(error)));
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
      await cdp.send('Performance.enable');
      await page.exposeFunction('__cpuProfileStart', async () => {
        clockMetrics = await cdp.send('Performance.getMetrics');
        await cdp.send('Profiler.start');
        console.log('PROFILE START before initial draw and 60-frame warmup');
      });
      await page.exposeFunction('__cpuProfileStop', async () => {
        ({ profile } = await cdp.send('Profiler.stop'));
        console.log('PROFILE STOP');
      });
      const evaluate = page.evaluate.bind(page);
      page.evaluate = async (fn, argument) => {
        let code = fn.toString();
        if (!code.includes('FrameBudgetProbe')) return evaluate(fn, argument);
        const replacements = [
          ['for (const mode of ["steady", "interruptions"])', 'for (const mode of ["interruptions"])'],
          ['for (const instrumented of [false, true])', 'for (const instrumented of [false])'],
          ['draw(0);', 'await window.__cpuProfileStart();\ndraw(0);'],
          ['await probe?.drain();', 'await window.__cpuProfileStop();\nawait probe?.drain();'],
          ['frameId: id,\n                      rafMs:', 'frameId: id,\n                      frameStartMs: start,\n                      rafMs:'],
        ];
        for (const [from, to] of replacements) {
          if (code.split(from).length !== 2) throw new Error('Nonunique harness anchor: ' + from);
          code = code.replace(from, to);
        }
        const start = code.indexOf('// Allocation observation is separate from timing:');
        const end = code.indexOf('return rows;', start);
        if (start < 0 || end < 0) throw new Error('Allocation boundary missing');
        code = code.slice(0, start) + code.slice(end);
        return evaluate(`(${code})(${JSON.stringify(argument)})`);
      };
      return page;
    },
  });
} finally {
  await browser.close();
  if (profile) await writeFile(new URL('banks-interruption.cpuprofile', import.meta.url), JSON.stringify(profile));
  await writeFile(new URL('banks-interruption.json', import.meta.url), JSON.stringify({
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceChanges: execFileSync('git', ['status', '--porcelain', '--', 'packages', 'web'], { encoding: 'utf8' }).trim(),
    scope: 'Existing interruption/control row, 60 warmup + 180 measured frames; other rows and allocation omitted in evaluated harness only. CPU profiler starts before warmup at 1ms. Diagnostic, not acceptance timing.',
    clockMetrics, checks, errors,
  }, null, 2));
}
