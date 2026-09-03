export type BattleFactionId = "azure" | "crimson" | "neutral";

export interface BattleFaction {
  id: BattleFactionId;
  name: string;
  primary: readonly [number, number, number];
  bannerCss: string;
}

export const BATTLE_FACTIONS = [
  {
    id: "azure",
    name: "Azure",
    primary: [0.15, 0.38, 0.96],
    bannerCss: "#6f9ae8",
  },
  {
    id: "crimson",
    name: "Crimson",
    primary: [0.94, 0.15, 0.12],
    bannerCss: "#e0604f",
  },
  {
    id: "neutral",
    name: "Neutral",
    primary: [0.82, 0.7, 0.34],
    bannerCss: "#d1b357",
  },
] as const satisfies readonly BattleFaction[];

type ActiveBattleFactions = readonly [BattleFactionId, BattleFactionId];

let activeFactions: ActiveBattleFactions | undefined;

export function setActiveFactions(teamToFactionId?: readonly [string, string] | null): void {
  activeFactions = teamToFactionId
    ? [validFactionId(teamToFactionId[0], 0), validFactionId(teamToFactionId[1], 1)]
    : undefined;
}

function validFactionId(id: string | undefined, fallbackTeam: 0 | 1): BattleFactionId {
  const faction = BATTLE_FACTIONS.find((candidate) => candidate.id === id);
  return faction?.id ?? BATTLE_FACTIONS[fallbackTeam].id;
}

export function factionForTeam(team: number, overrides?: readonly [string, string]): BattleFaction {
  const overrideId = team === 0 || team === 1 ? (overrides ?? activeFactions)?.[team] : undefined;
  if (overrideId) {
    const override = BATTLE_FACTIONS.find((faction) => faction.id === overrideId);
    if (override) return override;
  }
  if (team === 0) return BATTLE_FACTIONS[0];
  if (team === 1) return BATTLE_FACTIONS[1];
  return BATTLE_FACTIONS[2];
}

export function factionPrimaryCss(faction: BattleFaction): string {
  return `rgb(${faction.primary.map((channel) => Math.round(channel * 255)).join(", ")})`;
}
