// The battle map catalog: one frozen source of map presentation metadata that
// the menu picker (slice 04), battle launch, and verification scenes all read,
// so no surface redeclares a map's label, sealed sides, or ground cover. The
// terrain GEOMETRY (tint, height, passability) stays canonical in the sim and
// arrives per-battle as a BattleTerrainGrid; this catalog adds only the
// presentation roles that the sim does not own.

import {
  edgeSealMismatches,
  extractBattleTerrainFeatures,
  terrainHeightField,
  type BattleEdgeRoles,
  type BattleGroundCover,
  type BattleTerrainGrid,
  type BattleTerrainPresentation,
} from './terrainFeatures';

export interface BattleMapCatalogEntry {
  id: string;
  /** The integer passed to Game.start_battle / load_map. */
  wasmMapId: number;
  label: string;
  description: string;
  edges: BattleEdgeRoles;
  groundCover: BattleGroundCover;
  /** A deliberately flat parade ground opts out of the rolling-relief expectation. */
  intentionallyFlat?: boolean;
}

// West and east are the sealed sides on every map (open corridor runs N–S);
// north and south dissolve into distance fog. These roles present the blockers
// the sim already paints — they never create or remove passability.
export const BATTLE_MAP_CATALOG: readonly BattleMapCatalogEntry[] = [
  {
    id: 'river-and-crags',
    wasmMapId: 0,
    label: 'River & Crags',
    description: 'A green plain between a crag wall to the west and a broad river to the east.',
    edges: { north: 'open-fog', south: 'open-fog', west: 'cliff', east: 'ocean' },
    groundCover: 'green-grass',
  },
  {
    id: 'walled-plain',
    wasmMapId: 1,
    label: 'Walled Plain',
    description: 'Rolling farmland sealed by a city wall to the west and sea-cliffs to the east.',
    edges: { north: 'open-fog', south: 'open-fog', west: 'wall', east: 'cliff' },
    groundCover: 'green-grass',
  },
  {
    id: 'coastal-scrub',
    wasmMapId: 2,
    label: 'Coastal Scrub',
    description: 'Sun-bleached scrub over low dunes; ocean to the west, sea-cliffs to the east.',
    edges: { north: 'open-fog', south: 'open-fog', west: 'ocean', east: 'cliff' },
    groundCover: 'yellow-grass',
  },
];

export function battleMapById(id: string): BattleMapCatalogEntry | undefined {
  return BATTLE_MAP_CATALOG.find((m) => m.id === id);
}

/**
 * Assemble the full presentation for a booted map: catalog roles + the
 * height-field view and extracted features over the live terrain grid. This is
 * the single seam slice 03's renderer draws from.
 */
export function buildBattleTerrainPresentation(
  entry: BattleMapCatalogEntry,
  grid: BattleTerrainGrid,
  seed: number,
): BattleTerrainPresentation {
  return {
    mapId: entry.id,
    edges: entry.edges,
    groundCover: entry.groundCover,
    height: terrainHeightField(grid),
    features: extractBattleTerrainFeatures(grid, seed),
  };
}

/** Sides whose declared role disagrees with the terrain's passability (should be empty). */
export function presentationEdgeMismatches(
  entry: BattleMapCatalogEntry,
  grid: BattleTerrainGrid,
): Array<keyof BattleEdgeRoles> {
  return edgeSealMismatches(grid, entry.edges);
}
