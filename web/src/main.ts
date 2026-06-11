import init, { Campaign, Game } from './wasm/game_wasm.js';
import { currentScene, switchScene } from './scene';
import { MenuScene } from './menu/scene';
import { BattleScene, type BattleKind } from './battle/scene';
import { CampaignScene, loadCampaignData } from './campaign/scene';

const wasm = await init();

const params = new URLSearchParams(location.search);
const BATTLE_SEED = 0x5eed_c0de;
const AI_ON = params.get('ai') !== 'off';

function createGame(kind: BattleKind): Game {
  const game = new Game(BATTLE_SEED);
  if (kind === '1v1') game.start_sandbox(0);
  else if (kind === '5v5') game.start_sandbox(1);
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

async function launchCampaign(fromSave: boolean) {
  const { data, mapJson } = await loadCampaignData();
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
  onNewCampaign: () => void launchCampaign(false),
  onLoadCampaign: () => void launchCampaign(true),
  hasSave: () => localStorage.getItem(SAVE_KEY) !== null,
});

// ?battle=1v1|5v5 and ?map=A|B boot straight into the battle (old links and
// the verify harness); a bare URL opens the main menu.
const sandbox = params.get('battle');
if (sandbox === '1v1' || sandbox === '5v5') launchBattle(sandbox);
else if (params.has('map') || params.has('battle')) launchBattle(params.get('map') === 'B' ? 'mapB' : 'mapA');
else switchScene(menu);

function frame(now: number) {
  currentScene()?.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
