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
} from "./terrainFeatures";
import type { BattleEnvironmentId } from "../environment/environment";

export interface BattleMapCatalogEntry {
  id: string;
  /** The integer passed to Game.start_battle / load_map. */
  wasmMapId: number;
  /** Pinned generated-map seed; present only for curated generated entries. */
  generatedSeed?: string;
  label: string;
  description: string;
  edges: BattleEdgeRoles;
  groundCover: BattleGroundCover;
  /** A deliberately flat parade ground opts out of the rolling-relief expectation. */
  intentionallyFlat?: boolean;
}

type BattleTerrainPresentationSource = Pick<BattleMapCatalogEntry, "id" | "edges" | "groundCover">;

export const GENERATED_BATTLE_MAP_DEFAULT_ENVIRONMENT =
  "overcast-highland" satisfies BattleEnvironmentId;

export interface GeneratedBattleMapManifest {
  seed: number | string;
  groundCover: BattleGroundCover;
  edges: BattleEdgeRoles;
  featureSummary?: {
    lakeCells?: number;
    forestCells?: number;
    passableForestCells?: number;
    streams?: number;
    streamCells?: number;
    mudCells?: number;
    screeCells?: number;
    roughFieldCells?: number;
  };
}

export interface CuratedGeneratedBattleMapSeed {
  id: string;
  label: string;
  seed: number;
  description: string;
  character: string;
  manifest: GeneratedBattleMapManifest;
}

// Legacy hand-map metadata is retained only for old wasm map ids/deep links.
// It is not part of the public quick-battle catalog.
const LEGACY_HAND_BATTLE_MAP_CATALOG: readonly BattleMapCatalogEntry[] = [
  {
    id: "river-and-crags",
    wasmMapId: 0,
    label: "River & Crags",
    description: "A green plain between a crag wall to the west and a broad river to the east.",
    edges: { north: "open-fog", south: "open-fog", west: "cliff", east: "ocean" },
    groundCover: "green-grass",
  },
  {
    id: "walled-plain",
    wasmMapId: 1,
    label: "Walled Plain",
    description: "Rolling farmland sealed by a city wall to the west and sea-cliffs to the east.",
    edges: { north: "open-fog", south: "open-fog", west: "wall", east: "cliff" },
    groundCover: "green-grass",
  },
  {
    id: "coastal-scrub",
    wasmMapId: 2,
    label: "Coastal Scrub",
    description: "Sun-bleached scrub over low dunes; ocean to the west, sea-cliffs to the east.",
    edges: { north: "open-fog", south: "open-fog", west: "ocean", east: "cliff" },
    groundCover: "yellow-grass",
  },
];

export const CURATED_GENERATED_BATTLE_MAP_SEEDS: readonly CuratedGeneratedBattleMapSeed[] = [
  {
    id: "shore-and-crags",
    label: "Shore & Crags",
    seed: 1,
    description: "A cliff-bound highland field with a water reach sealing the eastern flank.",
    character: "water flank",
    manifest: {
      seed: 1,
      groundCover: "green-grass",
      edges: { north: "open-fog", south: "open-fog", west: "cliff", east: "ocean" },
    },
  },
  {
    id: "highland-vale",
    label: "Highland Vale",
    seed: 7,
    description: "The pinned generated-map vale: cliff walls on both flanks, open fog north and south.",
    character: "cliff/cliff anchor",
    manifest: {
      seed: 7,
      groundCover: "green-grass",
      edges: { north: "open-fog", south: "open-fog", west: "cliff", east: "cliff" },
    },
  },
  {
    id: "wooded-pass",
    label: "Wooded Pass",
    seed: 8,
    description: "A wooded western flank against an opposing cliff wall and rolling green corridor.",
    character: "forest flank",
    manifest: {
      seed: 8,
      groundCover: "green-grass",
      edges: { north: "open-fog", south: "open-fog", west: "cliff", east: "cliff" },
    },
  },
];

export const CURATED_GENERATED_BATTLE_MAP_CATALOG: readonly BattleMapCatalogEntry[] =
  CURATED_GENERATED_BATTLE_MAP_SEEDS.map((entry) =>
    generatedBattleMapEntry(entry.manifest, {
      id: entry.id,
      label: entry.label,
      description: entry.description,
    }),
  );

// Public quick-battle map catalog: curated generated maps only.
export const BATTLE_MAP_CATALOG: readonly BattleMapCatalogEntry[] =
  CURATED_GENERATED_BATTLE_MAP_CATALOG;

const ALL_BATTLE_MAP_CATALOG: readonly BattleMapCatalogEntry[] = [
  ...BATTLE_MAP_CATALOG,
  ...LEGACY_HAND_BATTLE_MAP_CATALOG,
];

export function battleMapById(id: string): BattleMapCatalogEntry | undefined {
  return ALL_BATTLE_MAP_CATALOG.find((m) => m.id === id);
}

export function battleMapByWasmId(wasmMapId: number): BattleMapCatalogEntry | undefined {
  return LEGACY_HAND_BATTLE_MAP_CATALOG.find((m) => m.wasmMapId === wasmMapId);
}

export function generatedBattleMapEntry(
  manifest: GeneratedBattleMapManifest | string,
  overrides: Partial<Pick<BattleMapCatalogEntry, "id" | "label" | "description">> = {},
): BattleMapCatalogEntry {
  const m =
    typeof manifest === 'string'
      ? (JSON.parse(manifest) as GeneratedBattleMapManifest)
      : manifest;
  const seed = String(m.seed);
  const features = m.featureSummary;
  const lakes = features?.lakeCells ?? 0;
  const streams = features?.streams ?? 0;
  const forest = features?.passableForestCells ?? features?.forestCells ?? 0;
  const fallbackId = `generated-${seed}`;
  return {
    id: overrides.id ?? fallbackId,
    wasmMapId: -1,
    generatedSeed: seed,
    label: overrides.label ?? `Generated ${seed}`,
    description:
      overrides.description ??
      `${lakes} lake cells, ${forest} passable forest cells, ${streams} streams.`,
    edges: m.edges,
    groundCover: m.groundCover,
  };
}

/**
 * Assemble the full presentation for a booted map: catalog roles + the
 * height-field view and extracted features over the live terrain grid. This is
 * the single seam slice 03's renderer draws from.
 */
export function buildBattleTerrainPresentation(
  entry: BattleTerrainPresentationSource,
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
