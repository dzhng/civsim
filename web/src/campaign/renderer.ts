// Campaign overlay renderer: Canvas2D markers (roads, banners, labels) drawn
// on a transparent canvas above the WebGL terrain. Everything is positioned
// through the terrain camera's projection, so banners sit on the 3D ground at
// any tilt. World units are km, +y north.

import type { CampaignData } from './data';
import { ARMY_STRIDE, type ArmyView, type CityView } from './scene';
import type { TerrainField } from './terrain';
import type { Terrain3D } from './terrain3d';
import type { FactionLabel } from './territory';

export interface CamView {
  x: number;
  y: number;
  scale: number; // px per km at the look-at point
}

const FACTION_FALLBACK: [number, number, number] = [150, 150, 150];

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
  ) {
    const { ctx, canvas, data } = this;
    const z = cam.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Edges. Roads fade out at political-map zoom; sea lanes faint dashes.
    const roadAlpha = Math.min(1, Math.max(0, (z - 0.1) / 0.15));
    for (let ei = 0; ei < data.map.edges.length; ei++) {
      const e = data.map.edges[ei];
      const sea = e.kind === 'sea';
      if (sea && z < 0.22) continue;
      if (!sea && roadAlpha <= 0.02) continue;
      const hs = this.viaHeights(ei);
      ctx.beginPath();
      let on = false;
      for (let i = 0; i < e.via.length; i++) {
        const p = this.t3d.project(e.via[i][0], e.via[i][1], sea ? 0 : hs[i]);
        if (!p) {
          on = false;
          continue;
        }
        on ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        on = true;
      }
      ctx.lineWidth = sea ? 1 : Math.max(1, z * 1.6);
      ctx.strokeStyle = sea ? 'rgba(140,180,220,0.25)' : `rgba(80,60,40,${0.8 * roadAlpha})`;
      ctx.setLineDash(sea ? [6, 6] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Order preview path.
    if (hoverPath && hoverPath.length > 1) {
      ctx.beginPath();
      let on = false;
      for (let i = 0; i < hoverPath.length; i++) {
        const p = this.toScreen(hoverPath[i][0], hoverPath[i][1]);
        if (p[0] < -9000) {
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

    // Faction names over their territory at political-map zoom.
    const labelAlpha = 1 - Math.min(1, Math.max(0, (z - 0.2) / 0.12));
    if (labelAlpha > 0.02) {
      for (const l of factionLabels) {
        const p = this.toScreen(l.x, l.y);
        if (p[0] < -9000) continue;
        const size = Math.min(52, Math.max(17, l.radiusKm * z * 0.6));
        ctx.font = `600 ${size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = labelAlpha;
        ctx.lineWidth = Math.max(2, size / 9);
        ctx.strokeStyle = 'rgba(10,12,16,0.65)';
        ctx.fillStyle = `rgb(${Math.min(255, l.color[0] + 90)},${Math.min(255, l.color[1] + 90)},${Math.min(255, l.color[2] + 90)})`;
        ctx.strokeText(l.name, p[0], p[1]);
        ctx.fillText(l.name, p[0], p[1]);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
      }
    }

    // Cities: squares colored by owner, sized by tier; junction dots at zoom.
    data.map.nodes.forEach((n, i) => {
      const [sx, sy] = this.toScreen(n.pos[0], n.pos[1]);
      if (sx < -40 || sy < -40 || sx > canvas.width + 40 || sy > canvas.height + 40) return;
      if (n.kind === 'city') {
        const c = cities.get(i);
        // Political zoom: minor cities collapse to flat dots so the
        // territory mosaic stays readable.
        if (z < 0.3 && n.tier < 3) {
          ctx.fillStyle = c ? this.factionColor(c.owner) : '#888';
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.5 + n.tier * 0.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          return;
        }
        const s = 4 + n.tier * 2 + z * 1.2;
        ctx.fillStyle = c ? this.factionColor(c.owner) : '#888';
        ctx.strokeStyle = '#1a1208';
        ctx.lineWidth = 1.5;
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
        ctx.strokeRect(sx - s / 2, sy - s / 2, s, s);
        if (n.port) {
          ctx.fillStyle = '#bdf';
          ctx.fillRect(sx - 2, sy + s / 2, 4, 3);
        }
        if (z > 0.25 || n.tier >= 3) {
          ctx.font = `${Math.min(15, 10 + z)}px system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(245,238,220,0.92)';
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = 3;
          ctx.strokeText(n.name, sx + s / 2 + 3, sy + 4);
          ctx.fillText(n.name, sx + s / 2 + 3, sy + 4);
        }
      } else if (z > 0.5) {
        ctx.fillStyle = 'rgba(60,45,30,0.7)';
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Armies: banners (pennant triangles) colored by faction.
    for (const a of armies) {
      const [sx, sy] = this.toScreen(a.x, a.y);
      if (sx < -40 || sy < -40 || sx > canvas.width + 40 || sy > canvas.height + 40) continue;
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
      if (z > 0.2) {
        ctx.font = '9px system-ui';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 2;
        const label = `${Math.round(a.soldiers / 100) / 10}k`;
        ctx.strokeText(label, sx + 4, sy + 9);
        ctx.fillText(label, sx + 4, sy + 9);
      }
    }
  }
}

export { ARMY_STRIDE };
