// Pure state for the React custom-battle army builder — no runtime catalog
// import (the catalog types come in type-only, erased at build/strip time), so
// the emitted launch config is unit-testable without mounting React.
//
// The output `armyConfig` MUST match what the old vanilla builder produced for
// the same click sequence. The load-bearing subtlety: picks come out in Map
// INSERTION order (template units first in template order, then any class a
// player adds later, in click order) — NOT ascending class id. So the state
// keeps a real Map per side and the reducer mirrors the vanilla mutations
// exactly; a plain numeric-keyed object would silently reorder integer keys.
// Factions are a separate per-team picker and do not affect army ordering.

import type { BattleFactionId } from "@packages/game-renderer/src/battle/factionColors";
import type { BattleEnvironmentId } from "@packages/game-renderer/src/environment/environment";
import type { QuickBattleConfig, QuickBattleUnitPick } from "../../battle/quickBattleCatalog";

export type Army = Map<number, number>;

export const DEFAULT_BATTLE_FACTIONS: [BattleFactionId, BattleFactionId] = ["azure", "crimson"];

export interface ArmyBuilderState {
  mapId: number;
  generatedSeed: string;
  generatedMapId?: string;
  environment: BattleEnvironmentId;
  armies: [Army, Army];
  factions: [BattleFactionId, BattleFactionId];
}

export type ArmyBuilderAction =
  | { kind: "map"; mapId: number; generatedSeed?: string; generatedMapId?: string }
  | { kind: "generatedSeed"; seed: string }
  | { kind: "rerollGeneratedSeed" }
  | { kind: "environment"; environment: BattleEnvironmentId }
  | { kind: "faction"; team: 0 | 1; factionId: BattleFactionId }
  | { kind: "count"; team: 0 | 1; classId: number; delta: number }
  | { kind: "template"; team: 0 | 1; units: readonly { classId: number; count: number }[] };

const cloneArmies = (armies: [Army, Army]): [Army, Army] => [
  new Map(armies[0]),
  new Map(armies[1]),
];

export function armyBuilderReducer(s: ArmyBuilderState, a: ArmyBuilderAction): ArmyBuilderState {
  switch (a.kind) {
    case "map":
      return {
        ...s,
        mapId: a.mapId,
        generatedSeed:
          a.generatedSeed === undefined ? s.generatedSeed : sanitizeSeed(a.generatedSeed),
        generatedMapId: a.generatedMapId,
      };
    case "generatedSeed":
      return { ...s, generatedSeed: sanitizeSeed(a.seed), generatedMapId: undefined };
    case "rerollGeneratedSeed":
      return { ...s, generatedSeed: rerollSeed(s.generatedSeed), generatedMapId: undefined };
    case "environment":
      return { ...s, environment: a.environment };
    case "faction": {
      const factions: [BattleFactionId, BattleFactionId] = [...s.factions];
      factions[a.team] = a.factionId;
      return { ...s, factions };
    }
    case "count": {
      const armies = cloneArmies(s.armies);
      const army = armies[a.team];
      // Mirror vanilla `set`: clamp at 0, KEEP the key (0-count entries hold
      // their slot so a re-increment stays in place). pick() filters them out.
      army.set(a.classId, Math.max(0, (army.get(a.classId) ?? 0) + a.delta));
      return { ...s, armies };
    }
    case "template": {
      const armies = cloneArmies(s.armies);
      const army = armies[a.team];
      army.clear();
      for (const u of a.units) army.set(u.classId, u.count);
      return { ...s, armies };
    }
  }
}

/** Living picks for a side, in Map order, count>0 — the army the battle gets. */
export function pickArmy(army: Army): QuickBattleUnitPick[] {
  return [...army].filter(([, n]) => n > 0).map(([classId, count]) => ({ classId, count }));
}

export function armyConfig(s: ArmyBuilderState): QuickBattleConfig {
  return {
    mapId: s.mapId,
    generatedSeed: s.generatedSeed,
    environment: s.environment,
    teams: [pickArmy(s.armies[0]), pickArmy(s.armies[1])],
    factions: [s.factions[0], s.factions[1]],
  };
}

export function sanitizeSeed(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.slice(0, 20) || "0";
}

export function rerollSeed(current: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < current.length; i++) {
    h ^= current.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= Date.now() & 0xffff_ffff;
  h ^= Math.floor(Math.random() * 0xffff_ffff);
  return String(h >>> 0);
}
