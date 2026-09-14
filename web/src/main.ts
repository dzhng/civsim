import {
  BATTLE_BENCHMARK_SCENARIO,
  benchmarkOpeningOrders,
} from "./battle/benchmark/benchmarkScenario";
import init, { Campaign, Game, type InitOutput } from "./wasm/game_wasm.js";
import { currentScene, switchScene } from "./scene";
import { MenuScene } from "./menu/scene";
import { QUICK_BATTLE_GENERATED_MAP_ID, type QuickBattleConfig } from "./battle/quickBattleCatalog";
import { BattleScene, type BattleKind, type GeneratedBattleMapDescriptor } from "./battle/scene";
import { CampaignScene } from "./campaign/scene";
import { loadCampaignData, type CampaignData } from "./campaign/data";
import {
  buildAlignmentCampaign,
  buildHandoffCampaign,
  buildTestCampaign,
} from "./campaign/fixtures";
import { readCampaignSave } from "./campaign/save";
import { checkGpuSupport, type GpuSupportState } from "@packages/game-renderer/src/appShell";
import { DEFAULT_BATTLE_ENVIRONMENT } from "@packages/game-renderer/src/environment/environment";
import { setActiveFactions } from "@packages/game-renderer/src/battle/factionColors";
import { generatedBattleMapEntry } from "@packages/game-renderer/src/battle/mapCatalog";

import { quickBattleUrl, readQuickBattleUrl } from "./battle/quickBattleUrl";

const params = new URLSearchParams(location.search);
let wasm: InitOutput;
let gpuStatus: GpuSupportState | null = null;

if (location.pathname.startsWith("/renderer")) {
  const { mountRendererLab } = await import("../../apps/renderer-lab/src/router");
  await mountRendererLab(location.pathname);
} else {
  gpuStatus = await checkGpuSupport({ forceUnsupported: params.get("gpu") === "off" });
  wasm = await init();
  await main();
  publishAppShellStats();
}

async function main() {
  const BATTLE_SEED = 0x5eed_c0de;
  const AI_ON = params.get("ai") !== "off";
  const generatedSeed = parseGeneratedSeed(params.get("seed") ?? "0");

  // The duel bench remembers its last setup so Restart reproduces the fight.
  // AI defaults OFF for duels: the enemy stands there and takes it.
  const duel = {
    a: Number(params.get("a") ?? 0),
    b: Number(params.get("b") ?? 0),
    ai: params.get("ai") === "on",
  };

  function createGame(kind: BattleKind): Game {
    const game = new Game(BATTLE_SEED);
    if (kind === "duel") {
      game.start_duel(duel.a, duel.b);
      if (duel.ai) game.set_ai_team(1);
      return game;
    }
    if (kind === "5v5") game.start_sandbox(1);
    else if (kind === "surround") game.start_sandbox(4);
    else if (kind === "flank") game.start_sandbox(5);
    else if (kind === "gen") game.start_battle_generated(generatedSeed);
    else game.start_battle(kind === "mapB" ? 1 : 0);
    if (AI_ON) game.set_ai_team(1);
    return game;
  }

  function launchBenchmark() {
    const scenario = BATTLE_BENCHMARK_SCENARIO;
    setActiveFactions();
    const game = new Game(scenario.simSeed);
    game.start_battle_generated(BigInt(scenario.mapSeed));
    game.set_ai_team(1);
    const info = new Float32Array(
      wasm.memory.buffer,
      game.unit_info_ptr(),
      game.unit_count() * game.unit_info_stride(),
    );
    const orders = benchmarkOpeningOrders(info, game.unit_info_stride());
    for (const order of orders) game.set_attack_order(order.unit, order.target);
    switchScene(
      new BattleScene({
        wasm,
        game,
        kind: "gen",
        benchmark: scenario,
        generatedMap: JSON.parse(game.generated_map_descriptor()) as GeneratedBattleMapDescriptor,
        environment: DEFAULT_BATTLE_ENVIRONMENT,
        onExit: () => location.assign("/"),
        onLaunch: launchBattle,
        restart: () => location.reload(),
      }),
    );
  }

  function launchBattle(kind: BattleKind) {
    setActiveFactions();
    switchScene(
      (() => {
        const game = createGame(kind);
        const generatedMap =
          kind === "gen"
            ? ({
                ...(JSON.parse(game.generated_map_descriptor()) as GeneratedBattleMapDescriptor),
                defaultEnvironment: DEFAULT_BATTLE_ENVIRONMENT,
              } satisfies GeneratedBattleMapDescriptor)
            : undefined;
        return new BattleScene({
          wasm,
          game,
          kind,
          wasmMapId: kind === "mapA" ? 0 : kind === "mapB" ? 1 : undefined,
          generatedMap,
          onExit: () => location.assign("/"),
          onLaunch: launchBattle,
        });
      })(),
    );
  }

  function createQuickBattleGame(cfg: QuickBattleConfig): Game {
    setActiveFactions(cfg.factions);
    const game = new Game(BATTLE_SEED);
    if (cfg.mapId === QUICK_BATTLE_GENERATED_MAP_ID) {
      game.load_generated_map(parseGeneratedSeed(cfg.generatedSeed ?? "0"));
    } else {
      game.load_map(cfg.mapId);
    }
    cfg.teams.forEach((picks, team) => {
      const units = picks.flatMap((p) => Array.from({ length: p.count }, () => p.classId));
      game.deploy_custom_army(team, new Uint32Array(units));
    });
    if (AI_ON) game.set_ai_team(1);
    return game;
  }

  function launchQuickBattle(cfg: QuickBattleConfig) {
    const generated = cfg.mapId === QUICK_BATTLE_GENERATED_MAP_ID;
    const environment = cfg.environment ?? DEFAULT_BATTLE_ENVIRONMENT;
    const game = createQuickBattleGame(cfg);
    const generatedMap = generated
      ? ({
          ...(JSON.parse(game.generated_map_descriptor()) as GeneratedBattleMapDescriptor),
          defaultEnvironment: environment,
        } satisfies GeneratedBattleMapDescriptor)
      : undefined;
    const generatedEntry = generated
      ? generatedBattleMapEntry(game.generated_map_manifest())
      : null;
    switchScene(
      new BattleScene({
        wasm,
        game,
        kind: generated ? "gen" : "mapA",
        wasmMapId: generatedEntry?.wasmMapId ?? cfg.mapId,
        environment,
        generatedMap,
        restart: () => location.reload(),
        onExit: () => location.assign(quickBattleUrl("/battle", cfg)),
        onLaunch: launchBattle,
      }),
    );
  }

  // Canonical class id/name/cost rows for the setup panel, straight from the sim.
  const quickBattleClasses = (() => {
    const probe = new Game(BATTLE_SEED);
    const specs = JSON.parse(probe.class_specs()) as Array<{
      id: number;
      name: string;
      cost: number;
    }>;
    probe.free();
    return specs.map((s) => ({ id: s.id, name: s.name, cost: s.cost }));
  })();

  async function launchCampaign(
    fromSave: boolean,
    testData?: { data: CampaignData; mapJson: string },
  ) {
    const { data, mapJson } = testData ?? (await loadCampaignData());
    const save = fromSave ? readCampaignSave() : null;
    const campaign = save
      ? Campaign.load(mapJson, save)
      : new Campaign(mapJson, (Math.random() * 2 ** 31) | 0, 0);
    if (!campaign) return;
    const scene: CampaignScene = new CampaignScene({
      wasm,
      campaign,
      data,
      mapJson,
      onExit: () => location.assign("/"),
      onBattle: (game, done) => {
        setActiveFactions();
        switchScene(
          new BattleScene({
            wasm,
            game,
            kind: "mapA", // cosmetic only; relaunch buttons are neutered below
            inCampaign: true,
            onExit: () => {
              done();
              switchScene(scene);
            },
            onLaunch: () => {}, // campaign battles can't be swapped for sandboxes
          }),
        );
      },
    });
    switchScene(scene);
  }

  const routeConfig = readQuickBattleUrl(params, quickBattleClasses);
  const battleSetup =
    location.pathname === "/battle" || (location.pathname === "/battle/run" && !routeConfig);
  if (location.pathname === "/battle/run" && !routeConfig)
    history.replaceState(null, "", "/battle");
  const menu = new MenuScene({
    battleSetup,
    initialConfig: routeConfig ?? undefined,
    setupError:
      params.has("setup") && !routeConfig
        ? "This battle link is invalid. Choose your armies to start a new battle."
        : undefined,
    onCustomBattle: (cfg) => {
      history.replaceState(null, "", quickBattleUrl("/battle", cfg));
      location.assign(quickBattleUrl("/battle/run", cfg));
    },
    classSpecs: quickBattleClasses,
    onNewCampaign: () => location.assign("/campaign"),
    onBenchmark: () => location.assign("/benchmark"),
    onLoadCampaign: () => location.assign("/campaign?load=1"),
    hasSave: () => readCampaignSave() !== null,
    gpuStatus: gpuStatus!,
  });

  // ?battle=duel&a=0&b=6&ai=on, ?battle=5v5, ?map=A|B boot straight into the
  // battle (deep links and the verify harness); a bare URL opens the menu.
  const sandbox = params.get("battle");
  const wantsCampaign = params.has("campaign") || location.pathname === "/campaign";
  const wantsBattle =
    location.pathname === "/benchmark" ||
    location.pathname === "/battle/run" ||
    sandbox === "duel" ||
    sandbox === "5v5" ||
    sandbox === "surround" ||
    sandbox === "flank" ||
    params.has("map") ||
    params.has("battle");
  if (!gpuStatus!.ok && (wantsCampaign || wantsBattle)) switchScene(menu);
  else if (location.pathname === "/benchmark") launchBenchmark();
  else if (location.pathname === "/battle/run" && routeConfig) launchQuickBattle(routeConfig);
  else if (battleSetup) switchScene(menu);
  else if (params.get("campaign") === "test") void launchCampaign(false, await buildTestCampaign());
  else if (params.get("campaign") === "handoff")
    void launchCampaign(false, await buildHandoffCampaign());
  else if (params.get("campaign") === "alignment")
    void launchCampaign(false, await buildAlignmentCampaign());
  else if (wantsCampaign) void launchCampaign(params.get("load") === "1");
  else if (sandbox === "duel" || sandbox === "5v5" || sandbox === "surround" || sandbox === "flank")
    launchBattle(sandbox);
  else if (params.has("map") || params.has("battle")) {
    const map = params.get("map")?.toLowerCase();
    launchBattle(map === "gen" ? "gen" : params.get("map") === "B" ? "mapB" : "mapA");
  } else switchScene(menu);

  function frame(now: number) {
    currentScene()?.frame(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function parseGeneratedSeed(raw: string): bigint {
  try {
    const seed = BigInt(raw);
    return seed >= 0n ? BigInt.asUintN(64, seed) : 0n;
  } catch {
    return 0n;
  }
}

function publishAppShellStats() {
  (window as unknown as { __appShellStats?: unknown }).__appShellStats = {
    gpu: gpuStatus,
    postCutoverScreenshots: "renderer-only",
  };
}
