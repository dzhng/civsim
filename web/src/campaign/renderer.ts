// Campaign overlay renderer: Canvas2D markers (roads, banners, labels) drawn
// on a transparent canvas above the WebGL terrain. Everything is positioned
// through the terrain camera's projection, so banners sit on the 3D ground at
// any tilt. World units are km, +y north.

import type { CampaignData } from './data';
import { ARMY_STRIDE, type ArmyView, type CityView } from './scene';
import type { TerrainField } from './terrain';
import { type Terrain3D, CITY_MODEL_MIN_SCALE, ARMY_MIN_SCALE } from './terrain3d';
import type { FactionLabel } from './territory';

export interface CamView {
  x: number;
  y: number;
  scale: number; // px per km at the look-at point
}

const FACTION_FALLBACK: [number, number, number] = [150, 150, 150];

/** Classical engraved-caps serif for every map label (Cinzel, bundled), with a
 *  serif fallback so a slow font load still reads as an old atlas. */
const MAP_FONT = `Cinzel, Georgia, 'Times New Roman', serif`;
/** Flowing serif italic for the open water — the lettering on an antique chart. */
const SEA_FONT = `italic Georgia, 'Times New Roman', serif`;

/** Curated sea names for the real Mediterranean map (world km coords, +y north).
 *  Drawn in both views at overview zoom — the open water of an old atlas. */
const SEAS: { name: string; x: number; y: number; size: number; angle?: number }[] = [
  { name: 'Mediterranean Sea', x: 340, y: -560, size: 30, angle: -0.05 },
  { name: 'Tyrrhenian Sea', x: -360, y: 120, size: 20, angle: -0.5 },
  { name: 'Ionian Sea', x: 30, y: -170, size: 18, angle: -0.9 },
  { name: 'Adriatic Sea', x: 70, y: 690, size: 18, angle: -0.65 },
  { name: 'Aegean Sea', x: 600, y: 150, size: 17, angle: -0.7 },
  { name: 'Black Sea', x: 1080, y: 1180, size: 24, angle: 0 },
  { name: 'Iberian Sea', x: -1640, y: -40, size: 22, angle: 0 },
  { name: 'Atlantic Ocean', x: -2120, y: 560, size: 22, angle: -1.2 },
];

/** Split a world polyline into drawable sub-polylines: trimmed by an arc-length
 *  margin at each end (km, for town walls) and gapped where it passes within
 *  `r` of an army center (so the road doesn't paint over the army model). */
function roadPolylines(
  via: [number, number][],
  trimA: number,
  trimB: number,
  gaps: { x: number; y: number; r: number }[],
): [number, number][][] {
  const n = via.length;
  if (n < 2) return [via];
  const cum = [0];
  for (let i = 1; i < n; i++) {
    cum.push(cum[i - 1] + Math.hypot(via[i][0] - via[i - 1][0], via[i][1] - via[i - 1][1]));
  }
  const L = cum[n - 1];
  const a0 = trimA;
  const a1 = L - trimB;
  if (a1 <= a0 + 0.5) return [];
  const at = (arc: number): [number, number] => {
    let i = 1;
    while (i < n - 1 && cum[i] < arc) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (arc - cum[i - 1]) / seg;
    return [via[i - 1][0] + (via[i][0] - via[i - 1][0]) * t, via[i - 1][1] + (via[i][1] - via[i - 1][1]) * t];
  };
  // Arc intervals to remove: where the road passes within r of an army.
  const cuts: [number, number][] = [];
  for (const g of gaps) {
    let best = Infinity;
    let bestArc = 0;
    for (let i = 1; i < n; i++) {
      const ax = via[i - 1][0];
      const ay = via[i - 1][1];
      const dx = via[i][0] - ax;
      const dy = via[i][1] - ay;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((g.x - ax) * dx + (g.y - ay) * dy) / len2));
      const d = Math.hypot(ax + dx * t - g.x, ay + dy * t - g.y);
      if (d < best) {
        best = d;
        bestArc = cum[i - 1] + Math.sqrt(len2) * t;
      }
    }
    if (best < g.r) cuts.push([bestArc - g.r, bestArc + g.r]);
  }
  // Kept = [a0, a1] minus the union of cuts.
  cuts.sort((p, q) => p[0] - q[0]);
  const kept: [number, number][] = [];
  let cur = a0;
  for (const [cs, ce] of cuts) {
    const s = Math.max(cs, a0);
    const e = Math.min(ce, a1);
    if (e <= cur) continue;
    if (s > cur) kept.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (cur < a1) kept.push([cur, a1]);
  // Materialize each kept interval into a sub-polyline.
  return kept
    .filter(([s, e]) => e - s > 0.5)
    .map(([s, e]) => {
      const seg: [number, number][] = [at(s)];
      for (let i = 0; i < n; i++) if (cum[i] > s && cum[i] < e) seg.push(via[i]);
      seg.push(at(e));
      return seg;
    });
}

export class CampaignRenderer {
  private ctx: CanvasRenderingContext2D;
  /** terrain height at each edge's via points, sampled once (terrain is static) */
  private edgeHeights: (Float32Array | null)[];

  constructor(
    private canvas: HTMLCanvasElement,
    private data: CampaignData,
    private t3d: Terrain3D,
    private field: TerrainField,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.edgeHeights = data.map.edges.map(() => null);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** World ground point -> canvas px (on the terrain surface). */
  toScreen(wx: number, wy: number): [number, number] {
    return this.t3d.project(wx, wy, this.field.heightAt(wx, wy)) ?? [-9999, -9999];
  }

  toWorld(sx: number, sy: number): [number, number] {
    return this.t3d.unproject(sx, sy);
  }

  factionColor(idx: number): string {
    const c = this.data.map.factions[idx]?.color ?? FACTION_FALLBACK;
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  /** Road trim radius (km) at a node: a city's wall footprint once its model
   *  shows, else 0. Matches the tier scales in terrain3d's buildCityModel. */
  private cityTrim(data: CampaignData, nodeId: number, z: number): number {
    if (z < CITY_MODEL_MIN_SCALE) return 0;
    const idx = data.nodeIndex.get(nodeId); // edges carry node ids, not indices
    if (idx === undefined) return 0;
    const n = data.map.nodes[idx];
    if (n.kind !== 'city') return 0;
    const s = n.tier >= 3 ? 1.9 : n.tier === 2 ? 1.35 : 0.95;
    return 4.3 * s; // ~the rampart ring (diameter 9.5 * s) in world km
  }

  private viaHeights(ei: number): Float32Array {
    let hs = this.edgeHeights[ei];
    if (!hs) {
      const via = this.data.map.edges[ei].via;
      hs = new Float32Array(via.length);
      for (let i = 0; i < via.length; i++) hs[i] = this.field.heightAt(via[i][0], via[i][1]);
      this.edgeHeights[ei] = hs;
    }
    return hs;
  }

  draw(
    cam: CamView,
    armies: ArmyView[],
    cities: Map<number, CityView>,
    selected: number,
    hoverPath: [number, number][] | null,
    factionLabels: FactionLabel[],
    roadLevels?: Uint8Array,
    outposts?: { node: number; owner: number; built: boolean }[],
    ambushHints?: [number, number][],
    factionView = true,
    fogOfWar = false,
    borders?: { pts: [number, number][]; bb: [number, number, number, number] }[],
  ) {
    const { ctx, canvas, data } = this;
    const z = cam.scale;
    // Under fog of war the overlay hides anything the player can't currently
    // see (their own cities/armies sit inside their own sight, so stay shown).
    const hidden = (wx: number, wy: number) => fogOfWar && this.t3d.visibleAt(wx, wy) < 0.35;
    // Draw in CSS px on a device-px backing store: constants below are
    // resolution-independent and stay crisp on high-dpi screens.
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const pt = (wx: number, wy: number, wh?: number): [number, number] | null => {
      const p = this.t3d.project(wx, wy, wh ?? this.field.heightAt(wx, wy));
      return p ? [p[0] / dpr, p[1] / dpr] : null;
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // The overlay paints over the 3D army/city models, so once they show the
    // road is gapped where it would streak across one: trimmed at town walls
    // and broken around each army's footprint.
    const armyR = z >= ARMY_MIN_SCALE ? 1.9 * Math.min(13, Math.max(5, 80 / (3.2 * z))) : 0;
    const armyPts = armyR > 0 ? armies.map((a) => ({ x: a.x, y: a.y, r: armyR })) : [];

    // Edges. Roads fade out at political-map zoom; sea lanes faint dashes.
    const roadAlpha = Math.min(1, Math.max(0, (z - 0.3) / 0.2));
    for (let ei = 0; ei < data.map.edges.length; ei++) {
      const e = data.map.edges[ei];
      const sea = e.kind === 'sea';
      if (sea && z < 0.35) continue;
      if (!sea && roadAlpha <= 0.02) continue;
      const hs = this.viaHeights(ei);
      let segments: [number, number, number][][];
      if (sea) {
        segments = [e.via.map((v, i) => [v[0], v[1], 0])];
      } else {
        // Junctions have no model: only cities trim. Gap around nearby armies
        // — test against the edge's bbox (a road tile's via endpoints are far
        // from a mid-road army; roadPolylines does the exact per-segment test).
        const trimA = this.cityTrim(data, e.a, z);
        const trimB = this.cityTrim(data, e.b, z);
        let exmin = Infinity, exmax = -Infinity, eymin = Infinity, eymax = -Infinity;
        for (const v of e.via) {
          exmin = Math.min(exmin, v[0]); exmax = Math.max(exmax, v[0]);
          eymin = Math.min(eymin, v[1]); eymax = Math.max(eymax, v[1]);
        }
        const near = armyPts.filter((g) =>
          g.x > exmin - armyR && g.x < exmax + armyR && g.y > eymin - armyR && g.y < eymax + armyR);
        segments = roadPolylines(e.via, trimA, trimB, near).map((seg) =>
          seg.map(([x, y]) => [x, y, this.field.heightAt(x, y)]));
      }
      const lvl = sea ? 1 : (roadLevels?.[ei] ?? 1);
      ctx.lineWidth = (sea ? 1 : Math.max(1, z * 1.6)) * (0.7 + 0.3 * lvl);
      // Paved roads read as granite: a cool neutral stone that lightens as the
      // road is upgraded (a fresh-cut flagstone look), not the old earth brown.
      ctx.strokeStyle = sea
        ? 'rgba(140,180,220,0.25)'
        : `rgba(${120 + lvl * 12},${118 + lvl * 12},${114 + lvl * 11},${0.85 * roadAlpha})`;
      ctx.setLineDash(sea ? [6, 6] : []);
      for (const poly of segments) {
        ctx.beginPath();
        let on = false;
        for (const [x, y, h] of poly) {
          const p = pt(x, y, h);
          if (!p) {
            on = false;
            continue;
          }
          on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
          on = true;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Faction borders: smooth vector polylines draped on the terrain, stroked
    // at a constant screen width so they read as crisp curved lines at every
    // zoom (no cell-grid staircase). Under the markers; political view only.
    const borderAlpha = factionView ? 1 - Math.min(1, Math.max(0, (z - 1.2) / 0.6)) : 0;
    if (borderAlpha > 0.02 && borders && borders.length) {
      // Visible world AABB (un-project the screen corners) for cheap culling.
      const cs = [this.toWorld(0, 0), this.toWorld(canvas.width, 0),
        this.toWorld(0, canvas.height), this.toWorld(canvas.width, canvas.height)];
      const vmnx = Math.min(cs[0][0], cs[1][0], cs[2][0], cs[3][0]);
      const vmxx = Math.max(cs[0][0], cs[1][0], cs[2][0], cs[3][0]);
      const vmny = Math.min(cs[0][1], cs[1][1], cs[2][1], cs[3][1]);
      const vmxy = Math.max(cs[0][1], cs[1][1], cs[2][1], cs[3][1]);
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(26,20,14,${0.8 * borderAlpha})`;
      for (const b of borders) {
        if (b.bb[2] < vmnx || b.bb[0] > vmxx || b.bb[3] < vmny || b.bb[1] > vmxy) continue;
        ctx.beginPath();
        let on = false;
        for (const [x, y] of b.pts) {
          const p = pt(x, y);
          if (!p) { on = false; continue; }
          on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
          on = true;
        }
        ctx.stroke();
      }
    }

    // Order preview path.
    if (hoverPath && hoverPath.length > 1) {
      ctx.beginPath();
      let on = false;
      for (let i = 0; i < hoverPath.length; i++) {
        const p = pt(hoverPath[i][0], hoverPath[i][1]);
        if (!p) {
          on = false;
          continue;
        }
        on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        on = true;
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.setLineDash([8, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Sea names on the open water (both views) — antique-chart italics that
    // fade as the camera dives toward 3D. Only on the real Mediterranean map.
    const seaAlpha = 1 - Math.min(1, Math.max(0, (z - 0.26) / 0.16));
    if (seaAlpha > 0.02 && data.map.nodes.length > 20) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const sea of SEAS) {
        if (hidden(sea.x, sea.y)) continue;
        const p = pt(sea.x, sea.y);
        if (!p) continue;
        ctx.save();
        ctx.translate(p[0], p[1]);
        ctx.rotate(sea.angle ?? 0);
        ctx.font = `${sea.size}px ${SEA_FONT}`;
        ctx.letterSpacing = `${sea.size * 0.22}px`;
        ctx.globalAlpha = seaAlpha * 0.8;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(20,34,52,0.55)';
        ctx.fillStyle = 'rgba(196,214,232,0.78)';
        const nm = sea.name.toUpperCase();
        ctx.strokeText(nm, 0, 0);
        ctx.fillText(nm, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }


    // Cities: squares colored by owner, sized by tier; junction dots at zoom.
    data.map.nodes.forEach((n, i) => {
      if (hidden(n.pos[0], n.pos[1])) return;
      const p = pt(n.pos[0], n.pos[1]);
      if (!p) return;
      const [sx, sy] = p;
      if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) return;
      if (n.kind === 'city') {
        const c = cities.get(i);
        // Level-of-detail: only the major cities (capitals, tier 3) at the
        // political/regional zoom; mid then minor towns appear as you zoom in.
        // A quiet dot stands in for the hidden ones at the far overview so the
        // map keeps some settlement texture.
        const minTier = z < 0.6 ? 3 : z < 0.85 ? 2 : 1;
        if (n.tier < minTier) {
          if (z < 0.32) {
            ctx.fillStyle = factionView ? (c ? this.factionColor(c.owner) : '#888') : '#241a10';
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.arc(sx, sy, 1.4 + n.tier * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          return;
        }
        const s = 4 + n.tier * 2 + z * 1.2;
        // Above the model zoom the 3D settlement carries the city; the flat
        // square would only z-fight with it. Keep the name label either way.
        if (z < CITY_MODEL_MIN_SCALE) {
          ctx.fillStyle = factionView ? (c ? this.factionColor(c.owner) : '#888') : '#2a2014';
          ctx.strokeStyle = '#1a1208';
          ctx.lineWidth = 1.5;
          ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
          ctx.strokeRect(sx - s / 2, sy - s / 2, s, s);
          if (n.port) {
            ctx.fillStyle = '#bdf';
            ctx.fillRect(sx - 2, sy + s / 2, 4, 3);
          }
        }
        if (z > 0.45 || n.tier >= 3) {
          const fs = Math.min(15, 9.5 + z) * (n.tier >= 3 ? 1.15 : 1);
          ctx.font = `600 ${fs}px ${MAP_FONT}`;
          ctx.letterSpacing = '0.5px';
          // Cities: same white caps as the faction names but a thinner, softer
          // black border so towns stay subordinate to the country labels.
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(20,15,10,0.6)';
          ctx.fillStyle = 'rgba(248,244,237,0.97)';
          const nm = n.name.toUpperCase();
          ctx.strokeText(nm, sx + s / 2 + 3, sy + 4);
          ctx.fillText(nm, sx + s / 2 + 3, sy + 4);
          ctx.letterSpacing = '0px';
        }
      } else if (z > 0.5) {
        ctx.fillStyle = 'rgba(60,45,30,0.7)';
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Ambush spots near the selected army: a faint thicket to slip into.
    for (const [hx, hy] of ambushHints ?? []) {
      const p = pt(hx, hy);
      if (!p) continue;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#1d3a14';
      ctx.beginPath();
      ctx.arc(p[0] - 2.5, p[1], 3, 0, Math.PI * 2);
      ctx.arc(p[0] + 2.5, p[1] - 1, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Outposts: a watchtower glyph in the owner's color.
    for (const o of outposts ?? []) {
      const n = data.map.nodes[o.node];
      if (hidden(n.pos[0], n.pos[1])) continue;
      const p = pt(n.pos[0], n.pos[1]);
      if (!p || p[0] < -20 || p[1] < -20 || p[0] > W + 20 || p[1] > H + 20) continue;
      const [sx, sy] = p;
      ctx.globalAlpha = o.built ? 1 : 0.5;
      ctx.fillStyle = this.factionColor(o.owner);
      ctx.strokeStyle = '#1a1208';
      ctx.lineWidth = 1;
      ctx.fillRect(sx - 2.5, sy - 9, 5, 9); // tower
      ctx.strokeRect(sx - 2.5, sy - 9, 5, 9);
      ctx.beginPath(); // roof
      ctx.moveTo(sx - 4.5, sy - 9);
      ctx.lineTo(sx + 4.5, sy - 9);
      ctx.lineTo(sx, sy - 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Armies: banners (pennant triangles) colored by faction.
    for (const a of armies) {
      if (!a.mine && hidden(a.x, a.y)) continue; // enemies vanish into the fog
      const p = pt(a.x, a.y);
      if (!p) continue;
      const [sx, sy] = p;
      if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) continue;
      const sel = a.id === selected;
      const size = sel ? 13 : 11;
      // Pole + pennant.
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - size * 1.6);
      ctx.stroke();
      ctx.fillStyle = this.factionColor(a.faction);
      ctx.globalAlpha = a.stance === 3 ? 0.55 : 1.0; // hidden ambusher (own)
      ctx.beginPath();
      ctx.moveTo(sx, sy - size * 1.6);
      ctx.lineTo(sx + size, sy - size * 1.15);
      ctx.lineTo(sx, sy - size * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = sel ? '#fff' : '#1a1208';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      // Routed marker.
      if (a.stance === 4) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui';
        ctx.fillText('!', sx - 2, sy - size * 1.8);
      }
      // At sea: a hull under the banner.
      if (a.stance === 6) {
        ctx.fillStyle = '#6b4a2a';
        ctx.strokeStyle = '#1a1208';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - 7, sy + 2);
        ctx.quadraticCurveTo(sx, sy + 8, sx + 7, sy + 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Camp: a tent pitched beside the banner.
      if (a.stance === 1) {
        ctx.fillStyle = '#e8dcc0';
        ctx.strokeStyle = '#1a1208';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx - size - 6, sy);
        ctx.lineTo(sx - size, sy);
        ctx.lineTo(sx - size - 3, sy - 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Progress pie (prep, occupation, embark, ambush settle).
      if (a.pieKind > 0 && a.pieFrac > 0) {
        const colors = ['', '#ffffff', '#ffd24a', '#7ec8ff', '#9be37e'];
        ctx.beginPath();
        ctx.moveTo(sx, sy - size * 2.6);
        ctx.arc(sx, sy - size * 2.6, 8, -Math.PI / 2, -Math.PI / 2 + a.pieFrac * Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = colors[a.pieKind] ?? '#fff';
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.arc(sx, sy - size * 2.6, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // Strength tag when zoomed.
      if (z > 0.35) {
        ctx.font = '9px system-ui';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 2;
        const label = `${Math.round(a.soldiers / 100) / 10}k`;
        ctx.strokeText(label, sx + 4, sy + 9);
        ctx.fillText(label, sx + 4, sy + 9);
      }
    }

    // Faction names: drawn LAST so the engraved country text sits above the
    // city dots and everything else (faction view only). The six powers read at
    // the political overview; the dozens of minor leagues would smother it, so
    // they fade IN only as you zoom into a region (fewer in view => legible),
    // and fade out again once the cities take over.
    const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
    // Powers persist from the overview through the regional zoom; leagues are
    // level-of-detail gated below, so they appear only when their realm is large
    // enough on screen — far out you see the powers, zooming in reveals leagues.
    const powerAlpha = 1 - clamp01((z - 0.72) / 0.16);
    const leagueHiFade = 1 - clamp01((z - 0.85) / 0.18); // out at city level
    if (factionView && (powerAlpha > 0.02 || leagueHiFade > 0.02)) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(10,8,5,0.9)';
      ctx.fillStyle = 'rgba(250,248,243,0.98)';
      // Leagues first, then powers on top (biggest last) so a power's name is
      // never buried under a minor league's.
      const ordered = [...factionLabels].sort((a, b) => Number(b.minor) - Number(a.minor) || a.radiusKm - b.radiusKm);
      for (const l of ordered) {
        // screenR = the realm's on-screen radius (px): the LOD currency.
        const screenR = l.radiusKm * z;
        const a = l.minor
          ? clamp01((screenR - 95) / 45) * leagueHiFade * 0.9 // appears once big enough
          : powerAlpha;
        if (a <= 0.02 || hidden(l.x, l.y)) continue;
        const p = pt(l.x, l.y);
        if (!p) continue;
        // Size tracks the realm's screen footprint but is capped so a big power
        // never balloons when you zoom in.
        const size = l.minor
          ? Math.min(22, Math.max(9, screenR * 0.4))
          : Math.min(34, Math.max(17, screenR * 0.5));
        ctx.font = `${l.minor ? 600 : 700} ${size}px ${MAP_FONT}`;
        ctx.letterSpacing = `${Math.max(0.5, size * 0.07)}px`;
        ctx.globalAlpha = a;
        ctx.lineWidth = Math.max(2.5, size / 6);
        const name = l.name.toUpperCase();
        // White caps with a firm black border (same family as the city names,
        // just bolder) so the country names read clearly over any territory.
        ctx.strokeText(name, p[0], p[1]);
        ctx.fillText(name, p[0], p[1]);
      }
      ctx.globalAlpha = 1;
      ctx.letterSpacing = '0px';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }
}

export { ARMY_STRIDE };
