// Tactical overlay vertex helpers: line cues are (x, y, r, g, b, a) per vertex
// (GL_LINES pairs); ring instances are (x, y, radius, r, g, b, a). Alpha rides
// each vertex so transient cues (the order-preview flash) fade to TRANSPARENT;
// fading the color instead would sink the cue to black over lit ground.

/** The ONE selection/status green — campaign selection rings, battle soldier
 *  rings, and the player's order-preview cues all read this. */
export const SELECTION_GREEN: [number, number, number] = [0.31, 0.82, 0.39];

/** Soldier-ring footprint radius, meters — selection and destination previews. */
export const SOLDIER_RING_RADIUS = 0.45;

/** Destination preview: one soldier ring per man at his prospective formation
 *  slot — the same decal style as the live selection rings, so "where they
 *  stand now" and "where they will stand" read as one visual language. Front
 *  rank sits on the destination point, ranks fall back behind it, and the
 *  last partial rank centres on the frontage. */
export function pushDestRings(
  rings: number[],
  x: number,
  y: number,
  facing: number,
  alive: number,
  files: number,
  spacing: number,
  r: number,
  g: number,
  b: number,
  a: number,
) {
  const fx = Math.cos(facing),
    fy = Math.sin(facing);
  const rx = fy,
    ry = -fx;
  const rankGap = 1.1;
  const n = Math.max(0, Math.floor(alive));
  const perRank = Math.max(1, Math.floor(files));
  for (let i = 0; i < n; i++) {
    const rank = Math.floor(i / perRank);
    const rankCount = Math.min(perRank, n - rank * perRank);
    const off = (i % perRank) * spacing - ((rankCount - 1) * spacing) / 2;
    const back = rank * rankGap;
    rings.push(x + rx * off - fx * back, y + ry * off - fy * back, SOLDIER_RING_RADIUS, r, g, b, a);
  }
}

/** Progress pie: an arc of `frac` of a full turn, 16ths, starting at 12 o'clock. */
export function pushPie(
  verts: number[],
  x: number,
  y: number,
  frac: number,
  R: number,
  r: number,
  g: number,
  b: number,
  a: number,
) {
  const segs = Math.max(2, Math.ceil(16 * frac));
  for (let s = 0; s < segs; s++) {
    const a0 = (s / 16) * Math.PI * 2 + Math.PI / 2;
    const a1 = ((s + 1) / 16) * Math.PI * 2 + Math.PI / 2;
    verts.push(
      x + Math.cos(a0) * R,
      y + Math.sin(a0) * R,
      r,
      g,
      b,
      a,
      x + Math.cos(a1) * R,
      y + Math.sin(a1) * R,
      r,
      g,
      b,
      a,
    );
  }
}
