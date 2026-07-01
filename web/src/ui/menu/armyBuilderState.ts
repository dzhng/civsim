// Pure state for the React custom-battle army builder (S4) — no runtime catalog
// import (the catalog types come in type-only, erased at build/strip time), so
// this byte-identical-output contract is unit-testable under `node --test`.
//
// The output `armyConfig` MUST match what the old vanilla builder produced for
// the same click sequence. The load-bearing subtlety: picks come out in Map
// INSERTION order (template units first in template order, then any class a
// player adds later, in click order) — NOT ascending class id. So the state
// keeps a real Map per side and the reducer mirrors the vanilla mutations
// exactly; a plain numeric-keyed object would silently reorder integer keys.

import type { QuickBattleConfig, QuickBattleUnitPick } from "../../battle/quickBattleCatalog";

export type Army = Map<number, number>;

export interface ArmyBuilderState {
  mapId: number;
  armies: [Army, Army];
}

export type ArmyBuilderAction =
  | { kind: "map"; mapId: number }
  | { kind: "count"; team: 0 | 1; classId: number; delta: number }
  | { kind: "template"; team: 0 | 1; units: readonly { classId: number; count: number }[] };

const cloneArmies = (armies: [Army, Army]): [Army, Army] => [
  new Map(armies[0]),
  new Map(armies[1]),
];

export function armyBuilderReducer(s: ArmyBuilderState, a: ArmyBuilderAction): ArmyBuilderState {
  switch (a.kind) {
    case "map":
      return { ...s, mapId: a.mapId };
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
  return { mapId: s.mapId, teams: [pickArmy(s.armies[0]), pickArmy(s.armies[1])] };
}
