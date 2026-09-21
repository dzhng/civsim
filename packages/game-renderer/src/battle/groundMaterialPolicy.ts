/**
 * The single contrast owner for battle turf. These are amplitude/value controls,
 * not palette colors: meadow hue remains owned by meadowPalette.ts.
 */
export const TURF_CONTRAST = {
  ground: {
    driftStrength: 0.12,
    mottleStrength: 0.24,
    minimum: 0.56,
    maximum: 1.36,
  },
  canopy: {
    anchorMix: 0.5,
    anchorChroma: 0.55,
    anchorLift: 1.015,
    anchorWarmth: 0.048,
    valueSpread: 0.14,
    fineSpread: 0.04,
    valueMinimum: 0.88,
    valueMaximum: 1.12,
    mixStrength: 0.42,
  },
  quad: {
    scrubStrength: 0.2,
    default: {
      oliveSpread: 0.6,
      speckleStrength: 0.19,
      dryMixBase: 0.22,
      trampleMix: 0.15,
      stubbleStrength: 0.11,
      darkFleckStrength: 0.23,
      stoneFleckStrength: 0.18,
      dustStrength: 0.14,
    },
    wideDetail: {
      oliveSpread: 0.6,
      speckleStrength: 0.195,
      dryMixBase: 0.2,
      trampleMix: 0.14,
      stubbleStrength: 0.063,
      darkFleckStrength: 0.25,
      stoneFleckStrength: 0.19,
      dustStrength: 0.12,
    },
  },
  edge: {
    noiseScale: 0.22,
    noiseDisplacementMeters: 1.4,
    featherMeters: 1,
    turfSpillStart: 0.24,
    turfSpillEnd: 0.72,
    mudInteriorStartMeters: 1.75,
    mudInteriorEndMeters: 4,
    roadInteriorStartMeters: -0.5,
    roadInteriorEndMeters: 0.5,
    displacementBoundMeters: 2.5,
  },
} as const;

/** Fixed spatial vocabulary; amplitudes and material weights live above. */
export const TURF_SHAPE = {
  ground: {
    driftScale: 0.08,
    mottleScale: 1.1,
  },
  canopy: {
    broadScale: 0.045,
    midScale: 0.14,
    contrastLow: 0.34,
    contrastHigh: 0.66,
    broadWeight: 0.62,
    midWeight: 0.38,
  },
} as const;
