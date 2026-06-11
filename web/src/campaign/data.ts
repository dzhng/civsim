// Static campaign map data: the same JSON mapgen emits and the wasm Campaign
// loads. The frontend renders topology straight from it; only dynamic state
// (armies, owners) comes out of wasm.

export interface MapNode {
  id: number;
  name: string;
  pos: [number, number];
  kind: 'city' | 'junction';
  tier: number;
  port: boolean;
  owner: string;
}

export interface MapEdge {
  a: number;
  b: number;
  kind: 'road' | 'sea';
  via: [number, number][];
  tiles: string[];
}

export interface MapFaction {
  id: string;
  name: string;
  color: [number, number, number];
  playable: boolean;
}

export interface CampaignMap {
  half_w: number;
  half_h: number;
  attribution: string;
  nodes: MapNode[];
  edges: MapEdge[];
  ambush_spots: { edge: number; tile: number; side: number }[];
  factions: MapFaction[];
}

export interface CampaignData {
  map: CampaignMap;
  bg: ImageBitmap;
  bgRect: { min: [number, number]; max: [number, number] };
  /// node JSON id -> dense index (the wasm side's node ids)
  nodeIndex: Map<number, number>;
}

export async function loadCampaignData(): Promise<{ data: CampaignData; mapJson: string }> {
  const [mapRes, bgMetaRes, bgBlob] = await Promise.all([
    fetch('/data/campaign-map.json'),
    fetch('/data/campaign-bg.json'),
    fetch('/data/campaign-bg.png').then((r) => r.blob()),
  ]);
  const mapJson = await mapRes.text();
  const map = JSON.parse(mapJson) as CampaignMap;
  const bgRect = await bgMetaRes.json();
  const bg = await createImageBitmap(bgBlob);
  const nodeIndex = new Map(map.nodes.map((n, i) => [n.id, i]));
  return { data: { map, bg, bgRect, nodeIndex }, mapJson };
}

/** Arc-length-interpolated point of a tile's midpoint along an edge polyline. */
export function tilePos(e: MapEdge, tile: number): [number, number] {
  const cum: number[] = [0];
  for (let i = 1; i < e.via.length; i++) {
    const [x0, y0] = e.via[i - 1];
    const [x1, y1] = e.via[i];
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = cum[cum.length - 1];
  const d = (total * (tile + 0.5)) / e.tiles.length;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const t = cum[i] > cum[i - 1] ? (d - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
  const [x0, y0] = e.via[i - 1];
  const [x1, y1] = e.via[i];
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
}

/** Nearest road location (node or edge tile) to a world point, within maxKm. */
export function nearestLoc(
  map: CampaignMap,
  wx: number,
  wy: number,
  maxKm: number,
): { kind: 0; a: number; b: 0 } | { kind: 1; a: number; b: number } | null {
  type Loc = { kind: 0; a: number; b: 0 } | { kind: 1; a: number; b: number };
  let best: { d: number; loc: Loc } | null = null;
  map.nodes.forEach((n, i) => {
    const d = Math.hypot(n.pos[0] - wx, n.pos[1] - wy);
    if (d < maxKm && (!best || d < best.d)) best = { d, loc: { kind: 0, a: i, b: 0 } };
  });
  map.edges.forEach((e, ei) => {
    // Project onto each segment, then snap the arc distance to a tile.
    const cum: number[] = [0];
    for (let i = 1; i < e.via.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(e.via[i][0] - e.via[i - 1][0], e.via[i][1] - e.via[i - 1][1]));
    }
    const total = cum[cum.length - 1];
    for (let i = 1; i < e.via.length; i++) {
      const [ax, ay] = e.via[i - 1];
      const [bx, by] = e.via[i];
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
      if (len2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((wx - ax) * (bx - ax) + (wy - ay) * (by - ay)) / len2));
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      const d = Math.hypot(px - wx, py - wy);
      if (d < maxKm && (!best || d < best.d)) {
        const arc = cum[i - 1] + Math.sqrt(len2) * t;
        const tile = Math.max(0, Math.min(e.tiles.length - 1, Math.floor((arc / total) * e.tiles.length)));
        best = { d, loc: { kind: 1, a: ei, b: tile } };
      }
    }
  });
  return best === null ? null : (best as { d: number; loc: Loc }).loc;
}
