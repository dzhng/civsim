import { hasBattleWorldDepthContract, hasCampaignWorldDepthContract } from '../_renderer-contract.mjs';

export const meta = {
  name: 'menu-renderer-shell',
  kind: 'flow',
  world: 'menu',
  tier: 'quick',
  snapshots: [],
  describe: 'Normal menu shell gates WebGPU launches, supports modals, and reaches battle/campaign routes.',
};

export async function run(ctx) {
  await runUnsupportedFixture(ctx);

  if (process.env.VERIFY_GPU !== '1') {
    ctx.check('WebGPU launch flow requires VERIFY_GPU=1', true, 'forced-failure fixture still ran');
    return;
  }

  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'menu-renderer-shell' });
  await page.goto(ctx.target);
  await page.waitForFunction(() => window.__appShellStats?.gpu?.checked === true, undefined, { timeout: 18000 });
  const shell = await page.evaluate(() => ({
    stats: window.__appShellStats,
    menuDisplay: getComputedStyle(document.getElementById('menu-ui')).display,
    statusText: document.getElementById('menu-renderer-status')?.textContent ?? '',
    launchDisabled: Array.from(document.querySelectorAll('#menu-ui button[data-battle], #menu-1v1, #menu-new-campaign'))
      .some((button) => button.disabled),
  }));
  ctx.check(
    'normal boot opens WebGPU-ready menu shell',
    shell.stats?.gpu?.ok === true && shell.menuDisplay === 'flex' && !shell.launchDisabled && shell.statusText.includes('WebGPU ready'),
    JSON.stringify(shell),
  );

  // Custom Battle setup: map options come from the shared catalog, both army
  // builders show class rows + live validation, and a template loads a valid
  // army while overfilling slots flips the army invalid (validation drives the
  // launch gate). This exercises quickBattleCatalog through the real UI.
  await page.click('#menu-quick-battle');
  const qb = await page.evaluate(() => {
    const open = document.getElementById('quick-battle-modal')?.classList.contains('open');
    const maps = Array.from(document.querySelectorAll('#qb-maps .qb-map strong')).map((e) => e.textContent);
    const rows = document.querySelectorAll('#qb-army-0 .qb-row').length;
    const defaultValid = document.getElementById('qb-launch')?.disabled === false;
    // Overfill side 0 past the slot cap by clicking the cheapest class's + many times.
    const plus = document.querySelector('#qb-army-0 .qb-row:last-child .qb-step:last-child');
    for (let i = 0; i < 30; i++) plus?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const overInvalid = document.getElementById('qb-launch')?.disabled === true
      && document.querySelector('#qb-army-0 .qb-footer')?.classList.contains('over');
    return { open, maps, rows, defaultValid, overInvalid };
  });
  ctx.check(
    'Custom Battle setup is catalog-driven with live army validation',
    qb.open === true && qb.maps.length === 3 && qb.rows >= 15 && qb.defaultValid && qb.overInvalid,
    JSON.stringify(qb),
  );
  await page.click('#qb-back');

  await page.click('#menu-manual');
  const manualOpen = await page.evaluate(() => ({
    display: getComputedStyle(document.getElementById('manual')).display,
    chars: document.getElementById('manual').textContent.length,
  }));
  ctx.check('menu manual opens before entering a renderer', manualOpen.display === 'block' && manualOpen.chars > 4000, JSON.stringify(manualOpen));
  await page.keyboard.press('Escape');
  const manualClosed = await page.evaluate(() => getComputedStyle(document.getElementById('manual')).display);
  ctx.check('Escape closes menu manual', manualClosed === 'none', manualClosed);

  await page.click('#menu-1v1');
  await page.waitForTimeout(80);
  const duelModal = await page.evaluate(() => ({
    display: getComputedStyle(document.getElementById('duel-modal')).display,
    active: document.activeElement?.id ?? '',
    options: document.getElementById('duel-a').options.length,
  }));
  ctx.check('duel picker opens with keyboard focus', duelModal.display === 'flex' && duelModal.active === 'duel-a' && duelModal.options > 4, JSON.stringify(duelModal));
  await page.click('#menu-duel');
  await waitForRendererBattleUpload(page);
  const duelStats = await page.evaluate(() => window.__game.stats());
  ctx.check(
    'duel launches through the default WebGPU battle renderer',
    battleStatsMatch(duelStats),
    JSON.stringify(duelStats),
  );
  await returnBattleToMenu(page);

  await page.click('button[data-battle="5v5"]');
  await waitForRendererBattleUpload(page);
  const quickStats = await page.evaluate(() => window.__game.stats());
  ctx.check(
    'quick battle launches through the default WebGPU battle renderer',
    battleStatsMatch(quickStats) && quickStats.units >= 10,
    JSON.stringify(quickStats),
  );
  await returnBattleToMenu(page);

  await page.click('#menu-new-campaign');
  await page.waitForFunction(() => window.__campaignReady === true && window.__campaignGpuStats?.ready === true, undefined, { timeout: 30000 });
  const campaignStats = await page.evaluate(() => window.__campaignGpuStats);
  ctx.check(
    'menu starts the normal WebGPU campaign route',
    campaignStats.renderer === 'renderer-campaign'
      && campaignStats.cityEntities > 20
      && hasCampaignWorldDepthContract(campaignStats),
    JSON.stringify(campaignStats),
  );
  await page.click('#cmp-exit');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('menu-ui')).display === 'flex', undefined, { timeout: 12000 });
  const returned = await page.evaluate(() => ({
    menu: getComputedStyle(document.getElementById('menu-ui')).display,
    shell: window.__appShellStats,
  }));
  ctx.check('campaign exits back to the same WebGPU-aware menu shell', returned.menu === 'flex' && returned.shell?.gpu?.ok === true, JSON.stringify(returned));

  await page.close();
}

async function runUnsupportedFixture(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1000, height: 760 }, errorPrefix: 'menu-renderer-unsupported' });
  await page.goto(`${ctx.target}/?gpu=off`);
  await page.waitForFunction(() => window.__appShellStats?.gpu?.checked === true, undefined, { timeout: 18000 });
  const blocked = await page.evaluate(() => ({
    stats: window.__appShellStats,
    statusText: document.getElementById('menu-renderer-status')?.textContent ?? '',
    launchButtons: Array.from(document.querySelectorAll('#menu-ui button[data-battle], #menu-1v1, #menu-new-campaign, #menu-load-save'))
      .map((button) => ({ id: button.id || button.dataset.battle, disabled: button.disabled, title: button.title })),
  }));
  ctx.check(
    'unsupported WebGPU fixture shows a blocking menu message',
    blocked.stats?.gpu?.ok === false
      && blocked.statusText.includes('WebGPU unavailable')
      && blocked.launchButtons.every((button) => button.disabled === true && button.title.length > 0),
    JSON.stringify(blocked),
  );

  await page.click('#menu-manual');
  const manualStillWorks = await page.evaluate(() => ({
    display: getComputedStyle(document.getElementById('manual')).display,
    chars: document.getElementById('manual').textContent.length,
    ready: window.__ready === true,
    campaignReady: window.__campaignReady === true,
  }));
  ctx.check(
    'unsupported fixture keeps non-renderer menu surfaces usable',
    manualStillWorks.display === 'block' && manualStillWorks.chars > 4000 && !manualStillWorks.ready && !manualStillWorks.campaignReady,
    JSON.stringify(manualStillWorks),
  );
  await page.close();

  const deepLink = await ctx.newPage({ viewport: { width: 1000, height: 760 }, errorPrefix: 'menu-renderer-unsupported-deeplink' });
  await deepLink.goto(`${ctx.target}/?gpu=off&battle=5v5`);
  await deepLink.waitForFunction(() => window.__appShellStats?.gpu?.checked === true, undefined, { timeout: 18000 });
  const blockedDeepLink = await deepLink.evaluate(() => ({
    menu: getComputedStyle(document.getElementById('menu-ui')).display,
    ready: window.__ready === true,
    campaignReady: window.__campaignReady === true,
    statusText: document.getElementById('menu-renderer-status')?.textContent ?? '',
  }));
  ctx.check(
    'unsupported WebGPU blocks renderer deep links at the app shell',
    blockedDeepLink.menu === 'flex'
      && !blockedDeepLink.ready
      && !blockedDeepLink.campaignReady
      && blockedDeepLink.statusText.includes('WebGPU unavailable'),
    JSON.stringify(blockedDeepLink),
  );
  await deepLink.close();
}

async function returnBattleToMenu(page) {
  await page.click('#btn-menu');
  await page.click('#pause-exit');
  await page.waitForFunction(() => window.__ready === false && getComputedStyle(document.getElementById('menu-ui')).display === 'flex', undefined, { timeout: 12000 });
}

async function waitForRendererBattleUpload(page) {
  await page.waitForFunction(() => {
    const stats = window.__game?.stats?.();
    return window.__ready === true
      && stats?.renderer === 'gpu'
      && stats.renderStats?.ready === true
      && stats.renderStats.soldiers === stats.soldiers;
  }, undefined, { timeout: 22000 });
}

function battleStatsMatch(stats) {
  return stats.renderer === 'gpu'
    && stats.renderStats?.ready === true
    && stats.renderStats.soldiers === stats.soldiers
    && stats.renderStats.expectedSoldiers === stats.soldiers
    && hasBattleWorldDepthContract(stats.renderStats);
}
