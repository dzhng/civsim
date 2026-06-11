// Campaign map renderer: plain Canvas2D. At this scale (hundreds of polylines,
// dozens of markers) 2D wins on simplicity over the battle's instanced WebGL.
// World units are km, +y north; canvas y flips.

import type { CampaignData } from './data';
import { ARMY_STRIDE, type ArmyView, type CityView } from './scene';

export interface CamView {
  x: number;
  y: number;
  scale: number; // px per km
}

const FACTION_FALLBACK: [number, number, number] = [150, 150, 150];

export class CampaignRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement, private data: CampaignData) {
    this.ctx = canvas.getContext('2d')!;
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

  toScreen(cam: CamView, wx: number, wy: number): [number, number] {
    return [
      (wx - cam.x) * cam.scale + this.canvas.width / 2,
      (cam.y - wy) * cam.scale + this.canvas.height / 2,
    ];
  }

  toWorld(cam: CamView, sx: number, sy: number): [number, number] {
    return [
      (sx - this.canvas.width / 2) / cam.scale + cam.x,
      cam.y - (sy - this.canvas.height / 2) / cam.scale,
    ];
  }

  factionColor(idx: number): string {
    const c = this.data.map.factions[idx]?.color ?? FACTION_FALLBACK;
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  draw(cam: CamView, armies: ArmyView[], cities: Map<number, CityView>, selected: number, hoverPath: [number, number][] | null) {
    const { ctx, canvas, data } = this;
    const z = cam.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a2330';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Background raster, draped by its world rectangle.
    const r = data.bgRect;
    const [x0, y0] = this.toScreen(cam, r.min[0], r.max[1]);
    const [x1, y1] = this.toScreen(cam, r.max[0], r.min[1]);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(data.bg, x0, y0, x1 - x0, y1 - y0);

    // Edges. Roads solid, sea lanes faint dashes; features tint short dashes.
    for (const e of data.map.edges) {
      const sea = e.kind === 'sea';
      if (sea && z < 0.12) continue;
      ctx.beginPath();
      for (let i = 0; i < e.via.length; i++) {
        const [sx, sy] = this.toScreen(cam, e.via[i][0], e.via[i][1]);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.lineWidth = sea ? 1 : Math.max(1, z * 1.6);
      ctx.strokeStyle = sea ? 'rgba(140,180,220,0.25)' : 'rgba(80,60,40,0.8)';
      ctx.setLineDash(sea ? [6, 6] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Order preview path.
    if (hoverPath && hoverPath.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < hoverPath.length; i++) {
        const [sx, sy] = this.toScreen(cam, hoverPath[i][0], hoverPath[i][1]);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.setLineDash([8, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Cities: squares colored by owner, sized by tier; junction dots at zoom.
    data.map.nodes.forEach((n, i) => {
      const [sx, sy] = this.toScreen(cam, n.pos[0], n.pos[1]);
      if (sx < -40 || sy < -40 || sx > canvas.width + 40 || sy > canvas.height + 40) return;
      if (n.kind === 'city') {
        const c = cities.get(i);
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
      const [sx, sy] = this.toScreen(cam, a.x, a.y);
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
