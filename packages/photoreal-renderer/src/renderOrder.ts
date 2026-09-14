/** Shared world/decal/UI ordering under the renderer’s reverse-Z sort policy. */
export const RENDER_ORDER = {
  backdrop: -10,
  terrain: -9,
  markers: -8,
  worldOpaque: 0,
  groundCues: 3,
  effectLines: 10,
  debugBlocks: 11,
  debugTriangles: 12,
  // UI band: drawn after every world/backdrop transparent (the reversed-sort
  // painter contract means a lower-order transparent backdrop would wash
  // over anything below it in the list).
  readout: 20,
} as const;
