import { hasBattleWorldDepthContract, hasCampaignWorldDepthContract } from '../_renderer-contract.mjs';

export const meta = {
  name: 'campaign-handoff',
  kind: 'flow',
  world: 'campaign-handoff',
  tier: 'full',
  snapshots: [],
  describe: 'Default WebGPU campaign launches a WebGPU campaign battle and returns to campaign.',
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 }, errorPrefix: 'campaign-handoff' });
  await page.goto(`${ctx.target}/?campaign=handoff`);
  await page.waitForFunction(() => window.__campaignReady === true && window.__campaignGpuStats?.ready === true, undefined, { timeout: 18000 });
  await page.evaluate(() => {
    window.__campaign.freeze(true);
    window.__campaign.cam(0, 450, 5.8);
  });
  await page.waitForTimeout(220);

  const campaignStart = await page.evaluate(() => ({
    renderer: window.__campaignGpuStats?.renderer,
    gpu: window.__campaignGpuStats,
    armies: window.__campaign.armies().map((army) => ({ id: army.id, faction: army.faction, soldiers: army.soldiers, encounter: army.encounter })),
    battleReady: window.__campaign.battleReady(),
  }));
  ctx.check(
    'handoff fixture opens in the default WebGPU campaign renderer',
    campaignStart.renderer === 'renderer-campaign'
      && hasCampaignWorldDepthContract(campaignStart.gpu)
      && campaignStart.armies.length === 2
      && campaignStart.battleReady === -1,
    JSON.stringify(campaignStart),
  );

  const pending = await page.evaluate(() => {
    window.__campaign.place(0, 1, 0, 3);
    window.__campaign.place(1, 1, 0, 4);
    window.__campaign.tick(2000);
    const eid = window.__campaign.battleReady();
    return {
      eid,
      encounter: eid >= 0 ? JSON.parse(window.__campaign.encounterJson(eid)) : null,
      armies: window.__campaign.armies().map((army) => ({ id: army.id, faction: army.faction, soldiers: army.soldiers, encounter: army.encounter })),
    };
  });
  ctx.check(
    'campaign contact produces a pending player battle',
    pending.eid >= 0
      && pending.encounter?.attacker?.soldiers > 0
      && pending.encounter?.defender?.soldiers > 0
      && pending.armies.every((army) => army.encounter === pending.eid),
    JSON.stringify(pending),
  );

  const launched = await page.evaluate(() => window.__campaign.fightReady());
  ctx.check('fightReady launches the pending encounter', launched === true, String(launched));
  await page.waitForFunction(() => {
    const stats = window.__game?.stats?.();
    return window.__ready === true
      && stats?.renderer === 'gpu'
      && stats.renderStats?.ready === true
      && stats.renderStats.soldiers === stats.soldiers;
  }, undefined, { timeout: 22000 });
  await page.waitForTimeout(300);
  const battleStats = await page.evaluate(() => ({
    ready: window.__ready,
    game: window.__game.stats(),
    continueLabel: document.querySelector('#pause-exit')?.textContent ?? '',
    gameoverLabel: document.querySelector('#gameover-menu')?.textContent ?? '',
  }));
  ctx.check(
    'campaign battle opens in the default WebGPU battle renderer',
    battleStats.ready === true
      && battleStats.game.renderer === 'gpu'
      && battleStats.game.renderStats?.ready === true
      && battleStats.game.renderStats?.soldiers === battleStats.game.soldiers
      && hasBattleWorldDepthContract(battleStats.game.renderStats)
      && battleStats.game.soldiers > 0
      && battleStats.continueLabel.includes('Campaign')
      && battleStats.gameoverLabel === 'Continue',
    JSON.stringify(battleStats),
  );

  await page.click('#btn-menu');
  await page.click('#pause-exit');
  await page.waitForFunction(() => window.__campaignReady === true && window.__campaignGpuStats?.ready === true && window.__ready === false, undefined, { timeout: 22000 });
  await page.waitForTimeout(260);
  const returned = await page.evaluate(() => ({
    campaignReady: window.__campaignReady,
    battleReadyFlag: window.__ready,
    renderer: window.__campaignGpuStats?.renderer,
    gpu: window.__campaignGpuStats,
    battleReady: window.__campaign.battleReady(),
    tick: window.__campaign.currentTick(),
    armies: window.__campaign.armies().map((army) => ({ id: army.id, faction: army.faction, soldiers: army.soldiers, encounter: army.encounter })),
    canSave: (() => {
      try {
        return typeof window.__campaign.save() === 'string';
      } catch {
        return false;
      }
    })(),
  }));
  ctx.check(
    'Continue returns to the same WebGPU campaign and clears battle state',
    returned.campaignReady === true
      && returned.battleReadyFlag === false
      && returned.renderer === 'renderer-campaign'
      && hasCampaignWorldDepthContract(returned.gpu)
      && returned.battleReady === -1
      && returned.armies.every((army) => army.encounter === -1)
      && returned.canSave === true,
    JSON.stringify(returned),
  );

  await page.close();
}
