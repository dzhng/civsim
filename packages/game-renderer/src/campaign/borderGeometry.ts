export interface CampaignBorderPolyline {
  pts: [number, number][];
  bb?: [number, number, number, number];
  left?: CampaignBorderSide | null;
  right?: CampaignBorderSide | null;
}

interface CampaignBorderSide {
  owner: number;
  color: [number, number, number];
}

const CAMPAIGN_FACTION_BORDER_TOTAL_WIDTH_KM = 4.1;
const CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM = 0.7;
const CAMPAIGN_FACTION_BORDER_STRIP_WIDTH_KM =
  (CAMPAIGN_FACTION_BORDER_TOTAL_WIDTH_KM - CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM) * 0.5;
const CAMPAIGN_FACTION_BORDER_ALPHA = 0.94;
const CAMPAIGN_FACTION_BORDER_SEAM: [number, number, number, number] = [0.11, 0.07, 0.04, 0.76];

export function campaignBorderVertices(
  borders: CampaignBorderPolyline[],
  color: [number, number, number, number] = [0.19, 0.12, 0.07, 0.74],
): Float32Array {
  const out: number[] = [];
  for (const border of borders) {
    for (let i = 1; i < border.pts.length; i++) {
      const a = border.pts[i - 1];
      const b = border.pts[i];
      out.push(a[0], a[1], ...color, b[0], b[1], ...color);
    }
  }
  return new Float32Array(out);
}

// Border strips drape on the terrain: each vertex carries z = heightAt + a small
// lift so the strips ride the height-mapped surface (the wash drapes via the
// surface mesh; a flat z=0 strip would be depth-buried under raised land).
const CAMPAIGN_FACTION_BORDER_LIFT_KM = 0.12;

export function campaignFactionBorderVertices(
  borders: CampaignBorderPolyline[],
  heightAt: (x: number, y: number) => number = () => 0,
  options: { surfaceStep?: number; landAt?: (x: number, y: number) => boolean } = {},
): Float32Array {
  const { surfaceStep = Infinity, landAt } = options;
  const out: number[] = [];
  for (const border of borders) {
    const pts = border.pts;
    if (pts.length < 2) continue;
    pushPolylineStrip(
      out,
      pts,
      -CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5,
      CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5,
      CAMPAIGN_FACTION_BORDER_SEAM,
      heightAt,
      surfaceStep,
      landAt,
    );
    if (border.left) {
      pushPolylineStrip(
        out,
        pts,
        CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5,
        CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5 + CAMPAIGN_FACTION_BORDER_STRIP_WIDTH_KM,
        factionColor(border.left),
        heightAt,
        surfaceStep,
        landAt,
      );
    }
    if (border.right) {
      pushPolylineStrip(
        out,
        pts,
        -CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5,
        -CAMPAIGN_FACTION_BORDER_SEAM_WIDTH_KM * 0.5 - CAMPAIGN_FACTION_BORDER_STRIP_WIDTH_KM,
        factionColor(border.right),
        heightAt,
        surfaceStep,
        landAt,
      );
    }
  }
  return new Float32Array(out);
}

function factionColor(side: CampaignBorderSide): [number, number, number, number] {
  return [
    side.color[0] / 255,
    side.color[1] / 255,
    side.color[2] / 255,
    CAMPAIGN_FACTION_BORDER_ALPHA,
  ];
}

function pushPolylineStrip(
  out: number[],
  pts: [number, number][],
  offset0: number,
  offset1: number,
  color: [number, number, number, number],
  heightAt: (x: number, y: number) => number = () => 0,
  surfaceStep = Infinity,
  landAt?: (x: number, y: number) => boolean,
) {
  const normals: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    normals.push(len > 0.0001 ? [-dy / len, dx / len] : [0, 0]);
  }
  const side0: [number, number][] = [];
  const side1: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = normals[Math.max(0, i - 1)];
    const next = normals[Math.min(normals.length - 1, i)];
    let nx = prev[0] + next[0];
    let ny = prev[1] + next[1];
    const len = Math.hypot(nx, ny);
    if (len > 0.0001) {
      nx /= len;
      ny /= len;
    } else {
      nx = next[0];
      ny = next[1];
    }
    const dot = Math.max(0.42, nx * next[0] + ny * next[1]);
    const p = pts[i];
    side0.push([p[0] + (nx * offset0) / dot, p[1] + (ny * offset0) / dot]);
    side1.push([p[0] + (nx * offset1) / dot, p[1] + (ny * offset1) / dot]);
  }
  for (let i = 1; i < pts.length; i++) {
    const a = side0[i - 1],
      b = side0[i],
      c = side1[i - 1],
      d = side1[i];
    if (surfaceStep === Infinity) {
      pushTriangle(out, [a, b, c], color, heightAt, landAt);
      pushTriangle(out, [c, b, d], color, heightAt, landAt);
      continue;
    }
    const along = Math.max(
      1,
      Math.ceil(
        Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(d[0] - c[0], d[1] - c[1])) /
          surfaceStep,
      ),
    );
    const across = Math.max(
      1,
      Math.ceil(
        Math.max(Math.hypot(c[0] - a[0], c[1] - a[1]), Math.hypot(d[0] - b[0], d[1] - b[1])) /
          surfaceStep,
      ),
    );
    const point = (u: number, v: number): [number, number] => [
      (a[0] + (b[0] - a[0]) * u) * (1 - v) + (c[0] + (d[0] - c[0]) * u) * v,
      (a[1] + (b[1] - a[1]) * u) * (1 - v) + (c[1] + (d[1] - c[1]) * u) * v,
    ];
    for (let u = 0; u < along; u++)
      for (let v = 0; v < across; v++) {
        const p = point(u / along, v / across),
          q = point((u + 1) / along, v / across),
          r = point(u / along, (v + 1) / across),
          t = point((u + 1) / along, (v + 1) / across);
        pushTriangle(out, [p, q, r], color, heightAt, landAt);
        pushTriangle(out, [r, q, t], color, heightAt, landAt);
      }
  }
}

/** Clip the subdivided strip at the same point-truth coast used by terrain.
 * Find crossings on short triangle edges; retain the dry side of each crossing. */
function pushTriangle(
  out: number[],
  points: [number, number][],
  color: [number, number, number, number],
  heightAt: (x: number, y: number) => number,
  landAt?: (x: number, y: number) => boolean,
) {
  const clipped: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const dryA = !landAt || landAt(...a),
      dryB = !landAt || landAt(...b);
    if (dryA) clipped.push(a);
    if (dryA !== dryB) {
      let dry = dryA ? a : b,
        wet = dryA ? b : a;
      for (let n = 0; n < 14; n++) {
        const mid: [number, number] = [(dry[0] + wet[0]) / 2, (dry[1] + wet[1]) / 2];
        if (landAt!(...mid)) dry = mid;
        else wet = mid;
      }
      clipped.push(dry);
    }
  }
  for (let i = 1; i + 1 < clipped.length; i++)
    for (const p of [clipped[0], clipped[i], clipped[i + 1]]) pushVertex(out, p, color, heightAt);
}

function pushVertex(
  out: number[],
  p: [number, number],
  color: [number, number, number, number],
  heightAt: (x: number, y: number) => number = () => 0,
) {
  out.push(
    p[0],
    p[1],
    Math.max(0, heightAt(p[0], p[1])) + CAMPAIGN_FACTION_BORDER_LIFT_KM,
    color[0],
    color[1],
    color[2],
    color[3],
  );
}
