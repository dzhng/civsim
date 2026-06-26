import init, { Campaign, Game, type InitOutput } from './wasm/game_wasm.js';
import { currentScene, switchScene } from './scene';
import { MenuScene } from './menu/scene';
import { BattleScene, type BattleKind } from './battle/scene';
import { CampaignScene, loadCampaignData } from './campaign/scene';
import type { CampaignData } from './campaign/data';
import { checkWebGpuSupport, type WebGpuSupportState } from '../../packages/game-renderer/src/appShell';

const params = new URLSearchParams(location.search);
let wasm: InitOutput;
let webGpuStatus: WebGpuSupportState | null = null;

if (location.pathname.startsWith('/webgpu')) {
  const { mountWebgpuLab } = await import('../../apps/webgpu-lab/src/router');
  await mountWebgpuLab(location.pathname);
} else {
  webGpuStatus = await checkWebGpuSupport({ forceUnsupported: params.get('webgpu') === 'off' });
  publishAppShellStats();
  wasm = await init();

// Standalone component harness: render the unit-banner gallery and stop, so the
// component can be eyeballed and pixel-snapshotted without the sim or engine.
if (params.get('test') === 'banners') {
  const { mountBannerGallery } = await import('./battle/unitBanner');
  const root = document.createElement('div');
  document.body.appendChild(root);
  mountBannerGallery(root);
  (window as unknown as { __ready: boolean }).__ready = true;
} else {
  await main();
}
}

async function main() {
const BATTLE_SEED = 0x5eed_c0de;
const AI_ON = params.get('ai') !== 'off';

// The duel bench remembers its last setup so Restart reproduces the fight.
// AI defaults OFF for duels: the enemy stands there and takes it.
const duel = {
  a: Number(params.get('a') ?? 0),
  b: Number(params.get('b') ?? 0),
  ai: params.get('ai') === 'on',
};

function createGame(kind: BattleKind): Game {
  const game = new Game(BATTLE_SEED);
  if (kind === 'duel') {
    game.start_duel(duel.a, duel.b);
    if (duel.ai) game.set_ai_team(1);
    return game;
  }
  if (kind === '5v5') game.start_sandbox(1);
  else if (kind === 'surround') game.start_sandbox(4);
  else if (kind === 'flank') game.start_sandbox(5);
  else game.start_battle(kind === 'mapB' ? 1 : 0);
  if (AI_ON) game.set_ai_team(1);
  return game;
}

function launchBattle(kind: BattleKind) {
  switchScene(new BattleScene({
    wasm,
    game: createGame(kind),
    kind,
    onExit: () => switchScene(menu),
    onLaunch: launchBattle,
  }));
}

const SAVE_KEY = 'campaign-save';

// A fake one-road, two-city map for the visual harness: our city (Roma) — road
// — a neutral city (Neapolis), one mixed-roster player army to pose. The bg
// raster is a flat land swatch (classifies to grass); no fetch, no sea, no
// garrison battles — just a controlled stage for army/city model screenshots.
async function buildTestCampaign(): Promise<{ data: CampaignData; mapJson: string }> {
  // y ~ 450 puts the stage in a temperate (green-grass) latitude band.
  const Y = 450;
  const map = {
    half_w: 60,
    half_h: 500,
    attribution: 'test',
    nodes: [
      { id: 1, name: 'Roma', pos: [-25, Y], kind: 'city', tier: 2, port: false, owner: 'rome' },
      { id: 2, name: 'Neapolis', pos: [25, Y], kind: 'city', tier: 2, port: false, owner: 'independents' },
    ],
    edges: [
      { a: 1, b: 2, kind: 'road', via: [[-25, Y], [25, Y]], tiles: Array(8).fill('open') },
    ],
    ambush_spots: [],
    factions: [
      { id: 'rome', name: 'Rome', color: [200, 40, 40], playable: true },
      { id: 'independents', name: 'Independent', color: [130, 130, 130], playable: false },
    ],
    start_armies: [
      { faction: 'rome', at: 'Roma', roster: [['MediumInfantry', 1000], ['MediumSpear', 500], ['Archers', 500], ['ShockCavalry', 300]] },
    ],
  } as unknown as CampaignData['map'];
  const bgRect = { min: [-45, Y - 28] as [number, number], max: [45, Y + 28] as [number, number] };
  const bg = await solidCampaignBitmap(180, 112, [196, 178, 138]);
  const nodeIndex = new Map(map.nodes.map((n, i) => [n.id, i]));
  return { data: { map, bg, bgRect, nodeIndex }, mapJson: JSON.stringify(map) };
}

async function buildHandoffCampaign(): Promise<{ data: CampaignData; mapJson: string }> {
  const Y = 450;
  const map = {
    half_w: 70,
    half_h: 500,
    attribution: 'handoff-test',
    nodes: [
      { id: 1, name: 'Roma', pos: [-30, Y], kind: 'city', tier: 2, port: false, owner: 'rome' },
      { id: 2, name: 'Capua', pos: [30, Y], kind: 'city', tier: 2, port: false, owner: 'samnium' },
    ],
    edges: [
      { a: 1, b: 2, kind: 'road', via: [[-30, Y], [30, Y]], tiles: Array(8).fill('open') },
    ],
    ambush_spots: [],
    factions: [
      { id: 'rome', name: 'Rome', color: [200, 40, 40], playable: true },
      { id: 'samnium', name: 'Samnium', color: [40, 80, 190], playable: true, ai_persona: 'neutral' },
      { id: 'independents', name: 'Independent', color: [130, 130, 130], playable: false },
    ],
    start_armies: [
      { faction: 'rome', at: 'Roma', roster: [['LightSpear', 420]] },
      { faction: 'samnium', at: 'Capua', roster: [['LightSpear', 420]] },
    ],
  } as unknown as CampaignData['map'];
  const bgRect = { min: [-54, Y - 32] as [number, number], max: [54, Y + 32] as [number, number] };
  const bg = await solidCampaignBitmap(216, 128, [196, 178, 138]);
  const nodeIndex = new Map(map.nodes.map((n, i) => [n.id, i]));
  return { data: { map, bg, bgRect, nodeIndex }, mapJson: JSON.stringify(map) };
}

async function solidCampaignBitmap(width: number, height: number, rgb: [number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    pixels[o] = rgb[0];
    pixels[o + 1] = rgb[1];
    pixels[o + 2] = rgb[2];
    pixels[o + 3] = 255;
  }
  return createImageBitmap(new ImageData(pixels, width, height));
}

async function launchCampaign(fromSave: boolean, testData?: { data: CampaignData; mapJson: string }) {
  const { data, mapJson } = testData ?? await loadCampaignData();
  const save = fromSave ? localStorage.getItem(SAVE_KEY) : null;
  const campaign = save ? Campaign.load(mapJson, save) : new Campaign(mapJson, (Math.random() * 2 ** 31) | 0, 0);
  if (!campaign) return;
  const scene: CampaignScene = new CampaignScene({
    wasm,
    campaign,
    data,
    onExit: () => switchScene(menu),
    onBattle: (game, done) => {
      switchScene(new BattleScene({
        wasm,
        game,
        kind: 'mapA', // cosmetic only; relaunch buttons are neutered below
        inCampaign: true,
        onExit: () => {
          done();
          switchScene(scene);
        },
        onLaunch: () => {}, // campaign battles can't be swapped for sandboxes
      }));
    },
  });
  switchScene(scene);
}

const menu = new MenuScene({
  onQuickBattle: launchBattle,
  onDuel: (a, b, ai) => {
    duel.a = a;
    duel.b = b;
    duel.ai = ai;
    launchBattle('duel');
  },
  onNewCampaign: () => void launchCampaign(false),
  onLoadCampaign: () => void launchCampaign(true),
  hasSave: () => localStorage.getItem(SAVE_KEY) !== null,
  webGpuStatus: webGpuStatus!,
});

// ?battle=duel&a=0&b=6&ai=on, ?battle=5v5, ?map=A|B boot straight into the
// battle (deep links and the verify harness); a bare URL opens the menu.
const sandbox = params.get('battle');
const wantsCampaign = params.has('campaign');
const wantsBattle = sandbox === 'duel'
  || sandbox === '5v5'
  || sandbox === 'surround'
  || sandbox === 'flank'
  || params.has('map')
  || params.has('battle');
if (!webGpuStatus!.ok && (wantsCampaign || wantsBattle)) switchScene(menu);
else if (params.get('campaign') === 'test') void launchCampaign(false, await buildTestCampaign());
else if (params.get('campaign') === 'handoff') void launchCampaign(false, await buildHandoffCampaign());
else if (wantsCampaign) void launchCampaign(false);
else if (sandbox === 'duel' || sandbox === '5v5' || sandbox === 'surround' || sandbox === 'flank') launchBattle(sandbox);
else if (params.has('map') || params.has('battle')) launchBattle(params.get('map') === 'B' ? 'mapB' : 'mapA');
else switchScene(menu);

function frame(now: number) {
  currentScene()?.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
}

function publishAppShellStats() {
  (window as unknown as { __appShellStats?: unknown }).__appShellStats = {
    webgpu: webGpuStatus,
    postCutoverScreenshots: 'webgpu-only',
  };
}
