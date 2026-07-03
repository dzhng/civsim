// The diegetic selection-ring decal profile — a thin soft band at the rim
// plus a whisper of interior fill. ONE owner across substrates (the campaign
// raw-WGSL selection pass, the battle TSL ring layer) so "the selection ring"
// cannot drift between the two maps. Distances are fractions of the ring
// radius; the fill band's inner edge hugs the cut.
export const SELECTION_RING_PROFILE = {
  /** Band alpha ramps up across innerCut→innerFade, back down outerEdge→1. */
  innerCut: 0.836,
  innerFade: 0.872,
  outerEdge: 0.988,
  ringAlpha: 0.98,
  /** Interior wash: its outer smoothstep pair and strength. */
  fillOuterStart: 0.99,
  fillOuterEnd: 0.948,
  fillAlpha: 0.034,
  /** Fill inner edge, relative to the cut. */
  fillInnerBelowCut: 0.014,
  fillInnerAboveCut: 0.01,
} as const;
