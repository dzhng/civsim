import init, { Campaign, Game, type InitOutput } from './wasm/game_wasm.js';
import { currentScene, switchScene } from './scene';
import { MenuScene } from './menu/scene';
import type { QuickBattleConfig } from './menu/quickBattleSetup';
import { BattleScene, type BattleKind } from './battle/scene';
import { CampaignScene, loadCampaignData } from './campaign/scene';
import type { CampaignData } from './campaign/data';
import { checkGpuSupport, type GpuSupportState } from '../../packages/game-renderer/src/appShell';

const params = new URLSearchParams(location.search);
let wasm: InitOutput;
let gpuStatus: GpuSupportState | null = null;

if (location.pathname.startsWith('/renderer')) {
  const { mountRendererLab } = await import('../../apps/renderer-lab/src/router');
  await mountRendererLab(location.pathname);
} else {
  gpuStatus = await checkGpuSupport({ forceUnsupported: params.get('gpu') === 'off' });
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

// 1x establishment soldiers per class — mirrors contract::unit_size (close-order
// foot 500, loose foot 350, horse 200, gun crew 80), keyed by class id.
const QUICK_BATTLE_ESTABLISHMENT = [500, 500, 350, 500, 350, 350, 200, 200, 80, 500, 500, 500, 500, 500, 500];

function createQuickBattleGame(cfg: QuickBattleConfig): Game {
  const game = new Game(BATTLE_SEED);
  game.load_map(cfg.mapId);
  cfg.teams.forEach((picks, team) => {
    const units = picks.flatMap((p) => Array.from({ length: p.count }, () => p.classId));
    const y = team === 0 ? -260 : 260;
    const facing = team === 0 ? Math.PI / 2 : -Math.PI / 2;
    const spread = Math.min(1700, Math.max(200, units.length * 70));
    units.forEach((classId, i) => {
      const x = units.length > 1 ? -spread / 2 + (spread * i) / (units.length - 1) : 0;
      const soldiers = QUICK_BATTLE_ESTABLISHMENT[classId] ?? 500;
      const files = Math.max(6, Math.round(Math.sqrt(soldiers * 1.6)));
      game.spawn_class(x, y, facing, soldiers, files, classId, team);
    });
  });
  if (AI_ON) game.set_ai_team(1);
  return game;
}

function launchQuickBattle(cfg: QuickBattleConfig) {
  switchScene(new BattleScene({
    wasm,
    game: createQuickBattleGame(cfg),
    kind: 'mapA',
    onExit: () => switchScene(menu),
    onLaunch: launchBattle,
  }));
}

// Canonical class id/name/cost rows for the setup panel, straight from the sim.
const quickBattleClasses = (() => {
  const probe = new Game(BATTLE_SEED);
  const specs = JSON.parse(probe.class_specs()) as Array<{ id: number; name: string; cost: number }>;
  return specs.map((s) => ({ id: s.id, name: s.name, cost: s.cost }));
})();

const SAVE_KEY = 'campaign-save';

// A fake one-road, two-city map for the visual harness: our city (Roma) — road
// — a neutral city (Neapolis), one mixed-roster player army to pose. The bg
// raster is a deterministic muted land texture (classifies to grass); no fetch,
// no sea, no garrison battles — just a controlled stage for army/city model
// screenshots.
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
  const bg = await controlledCampaignBitmap(180, 112, [154, 170, 104]);
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
      { faction: 'rome', at: 'Roma', roster: [['LightSpear', 16]] },
      { faction: 'samnium', at: 'Capua', roster: [['LightSpear', 16]] },
    ],
  } as unknown as CampaignData['map'];
  const bgRect = { min: [-54, Y - 32] as [number, number], max: [54, Y + 32] as [number, number] };
  const bg = await controlledCampaignBitmap(216, 128, [154, 170, 104]);
  const nodeIndex = new Map(map.nodes.map((n, i) => [n.id, i]));
  return { data: { map, bg, bgRect, nodeIndex }, mapJson: JSON.stringify(map) };
}

async function buildAlignmentCampaign(): Promise<{ data: CampaignData; mapJson: string }> {
  const map = {
    half_w: 120,
    half_h: 80,
    attribution: 'alignment-test',
    nodes: [
      { id: 1, name: 'Roma', pos: [-62, 18], kind: 'city', tier: 2, port: false, owner: 'rome' },
      { id: 2, name: 'Tibur', pos: [-28, 22], kind: 'city', tier: 1, port: false, owner: 'rome' },
      { id: 3, name: 'Narnia', pos: [-42, 46], kind: 'city', tier: 1, port: false, owner: 'rome' },
      { id: 4, name: 'Ostia/Portus', pos: [-76, -8], kind: 'city', tier: 1, port: true, owner: 'rome' },
    ],
    edges: [
      { a: 1, b: 2, kind: 'road', via: [[-62, 18], [-46, 19], [-28, 22]], tiles: Array(7).fill('open') },
      { a: 1, b: 3, kind: 'road', via: [[-62, 18], [-55, 34], [-42, 46]], tiles: Array(7).fill('open') },
      { a: 1, b: 4, kind: 'road', via: [[-62, 18], [-70, 5], [-76, -8]], tiles: Array(7).fill('open') },
    ],
    ambush_spots: [],
    factions: [
      { id: 'rome', name: 'Rome', color: [200, 40, 40], playable: true },
      { id: 'independents', name: 'Independent', color: [130, 130, 130], playable: false },
    ],
    start_armies: [
      { faction: 'rome', at: 'Roma', roster: [['MediumInfantry', 1000], ['MediumSpear', 500], ['Archers', 500]] },
    ],
  } as unknown as CampaignData['map'];
  const bgRect = { min: [-100, -60] as [number, number], max: [100, 70] as [number, number] };
  const bg = await alignmentCampaignBitmap(256, 166);
  const nodeIndex = new Map(map.nodes.map((n, i) => [n.id, i]));
  return { data: { map, bg, bgRect, nodeIndex }, mapJson: JSON.stringify(map) };
}

async function controlledCampaignBitmap(width: number, height: number, rgb: [number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const broad = smoothNoise(nx * 4.2 + 7.1, ny * 3.4 + 2.6);
      const fine = smoothNoise(nx * 18.0 + 1.7, ny * 13.0 + 5.3);
      const striation = Math.sin((nx * 5.5 + ny * 1.2) * Math.PI * 2) * 0.5 + 0.5;
      const moisture = smoothNoise(nx * 2.0 + 12.4, ny * 2.2 + 0.8);
      const shade = (broad - 0.5) * 25 + (fine - 0.5) * 11 + (striation - 0.5) * 8;
      const green = (moisture - 0.5) * 18;
      const o = i * 4;
      pixels[o] = clampByte(rgb[0] + shade - green * 0.25);
      pixels[o + 1] = clampByte(rgb[1] + shade * 0.82 + green);
      pixels[o + 2] = clampByte(rgb[2] + shade * 0.55 - green * 0.18);
      pixels[o + 3] = 255;
    }
  }
  return createImageBitmap(new ImageData(pixels, width, height));
}

async function alignmentCampaignBitmap(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const land: [number, number, number] = [196, 178, 138];
  const sea: [number, number, number] = [38, 60, 84];
  const mountain: [number, number, number] = [142, 120, 96];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const isSea = nx > 0.68;
      const isMountain = !isSea && nx > 0.20 && nx < 0.36 && ny < 0.30;
      const rgb = isSea ? sea : isMountain ? mountain : land;
      const shade = (smoothNoise(nx * 8.1 + 0.7, ny * 6.7 + 3.2) - 0.5) * 10;
      const o = (y * width + x) * 4;
      pixels[o] = clampByte(rgb[0] + shade);
      pixels[o + 1] = clampByte(rgb[1] + shade);
      pixels[o + 2] = clampByte(rgb[2] + shade);
      pixels[o + 3] = 255;
    }
  }
  return createImageBitmap(new ImageData(pixels, width, height));
}

function smoothNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function hash2(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
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
    mapJson,
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
  onCustomBattle: launchQuickBattle,
  classSpecs: quickBattleClasses,
  onDuel: (a, b, ai) => {
    duel.a = a;
    duel.b = b;
    duel.ai = ai;
    launchBattle('duel');
  },
  onNewCampaign: () => void launchCampaign(false),
  onLoadCampaign: () => void launchCampaign(true),
  hasSave: () => localStorage.getItem(SAVE_KEY) !== null,
  gpuStatus: gpuStatus!,
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
if (!gpuStatus!.ok && (wantsCampaign || wantsBattle)) switchScene(menu);
else if (params.get('campaign') === 'test') void launchCampaign(false, await buildTestCampaign());
else if (params.get('campaign') === 'handoff') void launchCampaign(false, await buildHandoffCampaign());
else if (params.get('campaign') === 'alignment') void launchCampaign(false, await buildAlignmentCampaign());
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
    gpu: gpuStatus,
    postCutoverScreenshots: 'renderer-only',
  };
}
