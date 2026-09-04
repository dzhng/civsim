import {
  BATTLE_MAP_CATALOG,
  type BattleMapCatalogEntry,
} from "@packages/game-renderer/src/battle/mapCatalog";
import type { BattleFactionId } from "@packages/game-renderer/src/battle/factionColors";
import type { BattleEnvironmentId } from "@packages/game-renderer/src/environment/environment";

// Quick Battle setup data: a pure, DOM-free catalog the setup panel and its
// tests both consume. Map options are the frozen BattleMapCatalogEntry
// list — this module never redeclares edge roles, ground cover, or wasm map ids.
// Class ids match web/src/battle/classData.ts (0..14); unit costs are canonical
// in the sim (contract::unit_cost, surfaced through Game.class_specs()), so the
// validator takes a cost lookup rather than copying the table.

export const QUICK_BATTLE_GOLD = 15000;
export const QUICK_BATTLE_MAX_UNITS = 20;
export const QUICK_BATTLE_GENERATED_MAP_ID = -1;

/** The map choices, straight from the shared curated generated-map catalog. */
export const QUICK_BATTLE_MAPS: readonly BattleMapCatalogEntry[] = BATTLE_MAP_CATALOG;

export interface QuickBattleUnitPick {
  classId: number;
  /** Number of units (army slots) of this class. */
  count: number;
}

/** A selectable class row in the army builder (id/name/cost from Game.class_specs()). */
export interface QuickBattleClassSpec {
  id: number;
  name: string;
  cost: number;
}

/** The launched custom battle: a map and two armies. */
export interface QuickBattleConfig {
  mapId: number;
  generatedSeed?: string;
  environment: BattleEnvironmentId;
  teams: [QuickBattleUnitPick[], QuickBattleUnitPick[]];
  factions?: [BattleFactionId, BattleFactionId];
}

export interface QuickBattleValidation {
  goldSpent: number;
  slotsUsed: number;
  overBudget: boolean;
  overSlots: boolean;
  empty: boolean;
  valid: boolean;
}

export type ClassCost = (classId: number) => number;

export function validateQuickBattleArmy(
  army: QuickBattleUnitPick[],
  cost: ClassCost,
): QuickBattleValidation {
  let slotsUsed = 0;
  let goldSpent = 0;
  for (const pick of army) {
    const n = Math.max(0, Math.floor(pick.count));
    slotsUsed += n;
    goldSpent += n * Math.max(0, cost(pick.classId));
  }
  const overBudget = goldSpent > QUICK_BATTLE_GOLD;
  const overSlots = slotsUsed > QUICK_BATTLE_MAX_UNITS;
  const empty = slotsUsed === 0;
  return {
    goldSpent,
    slotsUsed,
    overBudget,
    overSlots,
    empty,
    valid: !overBudget && !overSlots && !empty,
  };
}

export interface QuickBattleArmyTemplate {
  id: string;
  name: string;
  units: QuickBattleUnitPick[];
}

// Prebuilt armies. The full hosts fill close to the 20-unit cap and stay under
// 15,000 gold; Duel is a deliberate single-unit army for balance testing.
// (Class ids: 0 HeavySword, 1 LightSpear, 3 HeavyPhalanx, 4 Archers,
//  5 Skirmishers, 6 ShockCavalry, 7 HorseArchers, 9 Peasant, 10 LightSword,
//  11 HeavySpear, 12 MediumInfantry, 13 MediumSpear, 14 MediumPhalanx.)
export const QUICK_BATTLE_TEMPLATES: readonly QuickBattleArmyTemplate[] = [
  {
    id: "balanced-host",
    name: "Balanced Host",
    units: [
      { classId: 12, count: 4 },
      { classId: 13, count: 4 },
      { classId: 4, count: 3 },
      { classId: 5, count: 2 },
      { classId: 6, count: 2 },
      { classId: 0, count: 1 },
      { classId: 3, count: 1 },
    ],
  },
  {
    id: "cavalry-wing",
    name: "Cavalry Wing",
    units: [
      { classId: 6, count: 5 },
      { classId: 7, count: 4 },
      { classId: 12, count: 2 },
      { classId: 1, count: 3 },
    ],
  },
  {
    id: "pike-and-bow",
    name: "Pike And Bow",
    units: [
      { classId: 3, count: 2 },
      { classId: 14, count: 4 },
      { classId: 11, count: 2 },
      { classId: 4, count: 4 },
      { classId: 5, count: 4 },
    ],
  },
  {
    id: "duel",
    name: "Duel",
    units: [{ classId: 0, count: 1 }],
  },
];
