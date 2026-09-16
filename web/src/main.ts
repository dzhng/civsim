import { startSceneFrames } from "./shared/sceneFrames";
import { BATTLE_BENCHMARK_SCENARIO } from "./battle/benchmark/benchmarkScenario";
import init, { Campaign, Game, type InitOutput } from "./wasm/game_wasm.js";
import { currentScene, switchScene } from "./scene";
import { MenuScene } from "./menu/scene";
import { QUICK_BATTLE_GENERATED_MAP_ID, type QuickBattleConfig } from "./battle/quickBattleCatalog";
import { BattleScene, type BattleKind } from "./battle/scene";
import type { BattleSimSetup, BattleStart } from "./battle/sim/battleSetup";
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

  /** How a battle begins, as data the authority builds its one `Game` from. */
  function describeBattle(kind: BattleKind): BattleSimSetup {
    if (kind === "duel")
      return {
        source: "shell",
        simSeed: BATTLE_SEED,
        start: { kind: "duel", a: duel.a, b: duel.b },
        aiTeams: duel.ai ? [1] : [],
        openingOrders: "none",
      };
    const start: BattleStart =
      kind === "5v5"
        ? { kind: "sandbox", variant: 1 }
        : kind === "surround"
          ? { kind: "sandbox", variant: 4 }
          : kind === "flank"
            ? { kind: "sandbox", variant: 5 }
            : kind === "gen"
              ? { kind: "generated", mapSeed: generatedSeed.toString() }
              : { kind: "authored", map: kind === "mapB" ? 1 : 0 };
    return {
      source: "shell",
      simSeed: BATTLE_SEED,
      start,
      aiTeams: AI_ON ? [1] : [],
      openingOrders: "none",
    };
  }

  function launchBenchmark() {
    const scenario = BATTLE_BENCHMARK_SCENARIO;
    setActiveFactions();
    switchScene(
      new BattleScene({
        setup: {
          source: "shell",
          simSeed: scenario.simSeed,
          start: { kind: "generated", mapSeed: scenario.mapSeed },
          aiTeams: [1],
          openingOrders: "player-nearest-enemy",
        },
        kind: "gen",
        benchmark: scenario,
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
      new BattleScene({
        setup: describeBattle(kind),
        kind,
        wasmMapId: kind === "mapA" ? 0 : kind === "mapB" ? 1 : undefined,
        environment: kind === "gen" ? DEFAULT_BATTLE_ENVIRONMENT : undefined,
        onExit: () => location.assign("/"),
        onLaunch: launchBattle,
      }),
    );
  }

  function launchQuickBattle(cfg: QuickBattleConfig) {
    setActiveFactions(cfg.factions);
    const generated = cfg.mapId === QUICK_BATTLE_GENERATED_MAP_ID;
    switchScene(
      new BattleScene({
        setup: {
          source: "shell",
          simSeed: BATTLE_SEED,
          start: {
            kind: "custom",
            map: generated
              ? { kind: "generated", seed: parseGeneratedSeed(cfg.generatedSeed ?? "0").toString() }
              : { kind: "authored", id: cfg.mapId },
            teams: cfg.teams.map((picks) =>
              picks.flatMap((p) => Array.from({ length: p.count }, () => p.classId)),
            ),
          },
          aiTeams: AI_ON ? [1] : [],
          openingOrders: "none",
        },
        kind: generated ? "gen" : "mapA",
        // A generated quick battle takes its authored map id from the manifest the
        // sim publishes; an authored one already knows it.
        wasmMapId: generated ? undefined : cfg.mapId,
        environment: cfg.environment ?? DEFAULT_BATTLE_ENVIRONMENT,
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
      // The campaign describes the encounter; the authority builds its one `Game`
      // from that description in the worker and reports the outcome back here.
      onBattle: (handoff, report) => {
        setActiveFactions();
        const battle: BattleScene = new BattleScene({
          setup: { source: "campaign", handoff },
          kind: "mapA", // cosmetic only; relaunch buttons are neutered below
          inCampaign: true,
          onExit: () => {
            // The result has to be asked for before the scene switch disposes the
            // authority. A battle that cannot state its outcome keeps its own error
            // surface and leaves the encounter outstanding rather than resolving it.
            void battle.battleResult().then((result) => {
              if (report(result)) switchScene(scene);
            });
          },
          onLaunch: () => {}, // campaign battles can't be swapped for sandboxes
        });
        switchScene(battle);
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

  startSceneFrames(
    (now) => currentScene()?.frame(now),
    (callback) => requestAnimationFrame(callback),
    (error) => window.reportError(error),
  );
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
