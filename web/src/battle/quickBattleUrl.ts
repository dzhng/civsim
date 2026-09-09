import { BATTLE_ENVIRONMENT_OPTIONS } from "@packages/game-renderer/src/environment/environment";
import { BATTLE_FACTIONS } from "@packages/game-renderer/src/battle/factionColors";
import {
  QUICK_BATTLE_GENERATED_MAP_ID,
  QUICK_BATTLE_MAPS,
  validateQuickBattleArmy,
  type QuickBattleClassSpec,
  type QuickBattleConfig,
} from "./quickBattleCatalog";

/** The URL describes the starting battle, not a save of a running simulation. */
export function quickBattleUrl(path: "/battle" | "/battle/run", config: QuickBattleConfig): string {
  return `${path}?${new URLSearchParams({ setup: JSON.stringify(config) })}`;
}

export function readQuickBattleUrl(
  params: URLSearchParams,
  classes: QuickBattleClassSpec[],
): QuickBattleConfig | null {
  try {
    const raw = params.get("setup");
    if (!raw || raw.length > 8000) return null;
    const cfg = JSON.parse(raw) as QuickBattleConfig;
    if (!cfg || !Number.isInteger(cfg.mapId)) return null;
    if (
      cfg.mapId !== QUICK_BATTLE_GENERATED_MAP_ID &&
      !QUICK_BATTLE_MAPS.some((m) => m.wasmMapId === cfg.mapId)
    )
      return null;
    if (!BATTLE_ENVIRONMENT_OPTIONS.some((e) => e.id === cfg.environment)) return null;
    if (
      cfg.generatedSeed !== undefined &&
      (typeof cfg.generatedSeed !== "string" || !/^\d{1,20}$/.test(cfg.generatedSeed))
    )
      return null;
    if (
      cfg.factions !== undefined &&
      (!Array.isArray(cfg.factions) ||
        cfg.factions.length !== 2 ||
        !cfg.factions.every((id) => BATTLE_FACTIONS.some((f) => f.id === id)))
    )
      return null;
    if (!Array.isArray(cfg.teams) || cfg.teams.length !== 2) return null;
    for (const army of cfg.teams) {
      if (!Array.isArray(army) || army.length > classes.length) return null;
      const ids = new Set<number>();
      for (const pick of army) {
        if (
          !pick ||
          !Number.isSafeInteger(pick.count) ||
          pick.count <= 0 ||
          !classes.some((c) => c.id === pick.classId) ||
          ids.has(pick.classId)
        )
          return null;
        ids.add(pick.classId);
      }
      if (!validateQuickBattleArmy(army, (id) => classes.find((c) => c.id === id)!.cost).valid)
        return null;
    }
    return cfg;
  } catch {
    return null;
  }
}
