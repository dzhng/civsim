export interface TerrainProfile {
  /** Frequency in native world units; it never changes geometry or coverage. */
  detailScale: number;
  slopeBands: { slowMin: number; rollingMax: number; cliffMin: number };
}
export const CAMPAIGN_TERRAIN_PROFILE: TerrainProfile = {
  detailScale: 2,
  slopeBands: { rollingMax: 0.18, slowMin: 0.35, cliffMin: 0.8 },
};
export const TERRAIN_MATERIAL = {
  ground: {
    driftScale: 0.08,
    mottleScale: 1.1,
    driftStrength: 0.12,
    mottleStrength: 0.24,
    minimum: 0.56,
    maximum: 1.36,
  },
  rock: {
    faceLow: [0.32, 0.32, 0.29],
    faceHigh: [0.45, 0.43, 0.36],
    fracture: [0.21, 0.22, 0.21],
    screeLow: [0.43, 0.42, 0.36],
    screeHigh: [0.57, 0.54, 0.45],
    screePebble: [0.3, 0.3, 0.27],
    bench: [0.34, 0.43, 0.21],
  },
} as const;
