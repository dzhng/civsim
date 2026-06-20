// The campaign scene: EU4-style pausable real time over the ancient world.
// Owns its canvas + DOM (created on first enter, so the battle UI stays
// untouched), reads zero-copy army/city arrays from wasm each frame, and
// hands Pending battles to the battle scene (or auto-resolves them).

import { Campaign, Game, start_campaign_battle, report_battle, type InitOutput } from '../wasm/game_wasm.js';
import type { Scene } from '../scene';
import { loadCampaignData, nearestLoc, tilePos, type CampaignData } from './data';
import { CampaignRenderer, type CamView } from './renderer';
import { TerrainField } from './terrain';
import { Territory } from './territory';
import { Terrain3D } from './terrain3d';

export const ARMY_STRIDE = 21; // 12 base + 9 per-class soldier counts
const CITY_STRIDE = 4;
/** Campaign ticks per real second at 1x (one tick = one campaign minute).
 * 60 = one game-hour per real second: at the old 10 an army crawled a few
 * px/minute on screen. Everything is tick-driven (movement, economy, AI), so
 * raising this fast-forwards the whole world in lockstep — balance ratios and
 * the 1x/3x/10x labels stay honest. */
const TICKS_PER_SEC = 60;
const SPEEDS = [1, 3, 10];
const SAVE_KEY = 'campaign-save';

export interface ArmyView {
  id: number;
  x: number;
  y: number;
  faction: number;
  soldiers: number;
  stance: number;
  pieKind: number;
  pieFrac: number;
  marching: boolean;
  encounter: number;
  moraleCap: number;
  mine: boolean;
  /** soldiers per class (index = UnitClassId), for the 3D army marker */
  roster: number[];
}

export interface CityView {
  owner: number;
  garrison: number;
  queue: number;
}

export interface CampaignConfig {
  wasm: InitOutput;
  campaign: Campaign;
  data: CampaignData;
  onExit: () => void;
  /** Hand a battle Game to the battle scene; call done() when it ends. */
  onBattle: (game: Game, done: () => void) => void;
}

export class CampaignScene implements Scene {
  private canvas!: HTMLCanvasElement;
  private glCanvas!: HTMLCanvasElement;
  private ui!: HTMLDivElement;
  private renderer!: CampaignRenderer;
  // Terrain/territory live across battle round-trips (enter/exit cycles).
  private field: TerrainField | null = null;
  private territory: Territory | null = null;
  private t3d: Terrain3D | null = null;
  private ownerHash = 0;
  private ac: AbortController | null = null;
  private cam: CamView;
  private speed = 0; // index into SPEEDS, -1 = paused
  private paused = true;
  private acc = 0;
  private last = 0;
  private selected = -1;
  private hover = -1;
  private armies: ArmyView[] = [];
  private cities = new Map<number, CityView>();
  private roadLevels: Uint8Array = new Uint8Array(0);
  private outposts: { node: number; owner: number; built: boolean }[] = [];
  private spotPos: [number, number][] = [];
  private modal: HTMLDivElement | null = null;
  private autoResolving = false;

  constructor(private cfg: CampaignConfig) {
    this.cam = { x: 0, y: 0, scale: 0.18 };
  }

  enter() {
    if (!document.getElementById('campaign-canvas')) this.buildDom();
    this.canvas = document.getElementById('campaign-canvas') as HTMLCanvasElement;
    this.glCanvas = document.getElementById('campaign-gl') as HTMLCanvasElement;
    this.ui = document.getElementById('campaign-ui') as HTMLDivElement;
    this.canvas.style.display = 'block';
    this.glCanvas.style.display = 'block';
    this.ui.style.display = 'block';
    if (this.spotPos.length === 0) {
      this.spotPos = this.cfg.data.map.ambush_spots.map((sp) =>
        tilePos(this.cfg.data.map.edges[sp.edge], sp.tile));
    }
    if (!this.field) {
      this.field = new TerrainField(this.cfg.data);
      this.territory = new Territory(this.cfg.data, this.field);
      this.t3d = new Terrain3D(this.glCanvas, this.field, this.cfg.data);
    }
    this.renderer = new CampaignRenderer(this.canvas, this.cfg.data, this.t3d!, this.field);
    this.ownerHash = 0; // force a territory recolor on (re)entry
    this.ac = new AbortController();
    this.wireInput(this.ac.signal);
    this.last = performance.now();
    this.refreshViews();
    // Debug/verify hook (mirrors the battle scene's window.__game).
    (window as any).__campaign = {
      tick: (n: number) => {
        this.cfg.campaign.tick(n);
        this.refreshViews();
      },
      orderMove: (army: number, kind: number, a: number, b: number) =>
        this.cfg.campaign.order_move(army, kind, a, b),
      /** Test-only: teleport an army onto a loc (kind 0 node, 1 edge tile). */
      place: (army: number, kind: number, a: number, b: number) => {
        this.cfg.campaign.debug_place(army, kind, a, b);
        this.refreshViews();
      },
      orderSplit: (army: number, mask: number) => {
        const ok = this.cfg.campaign.order_split(army, mask);
        this.refreshViews();
        return ok;
      },
      orderMerge: (src: number, dst: number) => {
        const ok = this.cfg.campaign.order_merge(src, dst);
        this.refreshViews();
        return ok;
      },
      battleReady: () => this.cfg.campaign.battle_ready(),
      currentTick: () => this.cfg.campaign.current_tick(),
      encounterJson: (id: number) => this.cfg.campaign.encounter_json(id),
      armies: () => this.armies,
      cities: () => Object.fromEntries(this.cities),
      treasury: () => this.cfg.campaign.treasury(),
      save: () => this.cfg.campaign.save(),
      select: (id: number) => (this.selected = id),
      selected: () => this.selected,
      paused: () => this.paused,
      /** world km -> CSS px (for synthetic mouse events) */
      project: (wx: number, wy: number) => {
        const p = this.renderer.toScreen(wx, wy);
        return [p[0] / devicePixelRatio, p[1] / devicePixelRatio];
      },
      cam: (x: number, y: number, scale: number) => {
        this.cam = { x, y, scale };
        this.t3d!.clampCam(this.cam);
      },
      camGet: () => ({ ...this.cam, pitchDeg: (this.t3d!.pitch * 180) / Math.PI }),
      territoryAlpha: () => this.t3d!.territoryAlpha(this.cam.scale),
      /** Snapshot mode: pin the water clock (campaign is already paused). */
      freeze: (on = true) => {
        this.t3d!.fixedTime = on ? 0 : null;
      },
      terrStats: () => {
        const t = this.territory!;
        let filled = 0;
        for (let i = 3; i < t.rgba.length; i += 4) if (t.rgba[i] > 0) filled++;
        return { filled, total: t.rgba.length / 4, labels: t.labels };
      },
    };
    (window as any).__campaignReady = true;
  }

  exit() {
    (window as any).__campaignReady = false;
    this.ac?.abort();
    this.ac = null;
    this.canvas.style.display = 'none';
    this.glCanvas.style.display = 'none';
    this.ui.style.display = 'none';
    this.closeModal();
  }

  frame(now: number) {
    const dt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    const c = this.cfg.campaign;

    if (!this.paused && !this.autoResolving) {
      this.acc += dt * TICKS_PER_SEC * SPEEDS[this.speed];
      const n = Math.floor(this.acc);
      if (n > 0) {
        this.acc -= n;
        c.tick(n);
        this.refreshViews();
        if (c.battle_ready() >= 0 && !this.modal) {
          this.paused = true; // auto-pause: a battle wants a decision
          this.showBattleModal(c.battle_ready());
        }
      }
    }

    // Auto-resolve hogs the frame budget on purpose: the modal covers the
    // screen, so don't spend milliseconds drawing the world behind it.
    if (!this.autoResolving) {
      this.renderer.resize();
      this.t3d!.resize();
      this.t3d!.clampCam(this.cam); // zoom floor = aspect-fill, pan inside the map
      this.t3d!.setArmies(this.armies, this.cam.scale, this.selected, this.hover); // 3D models under the floating banners
      this.t3d!.draw(this.cam);
      const sel = this.armies.find((a) => a.id === this.selected && a.mine);
      const hints: [number, number][] = sel
        ? this.spotPos.filter(([x, y]) => Math.hypot(x - sel.x, y - sel.y) < 12)
        : [];
      this.renderer.draw(this.cam, this.armies, this.cities, this.selected, null, this.territory!.labels, this.roadLevels, this.outposts, hints);
    }
    this.updateHud();
  }

  // ---- state out of wasm ----------------------------------------------------

  private refreshViews() {
    const c = this.cfg.campaign;
    const mem = this.cfg.wasm.memory.buffer;
    const an = c.army_count();
    const af = new Float32Array(mem, c.army_info_ptr(), an * ARMY_STRIDE);
    this.armies = [];
    for (let i = 0; i < an; i++) {
      const o = i * ARMY_STRIDE;
      this.armies.push({
        id: af[o],
        x: af[o + 1],
        y: af[o + 2],
        faction: af[o + 3],
        soldiers: af[o + 4],
        stance: af[o + 5],
        pieKind: af[o + 6],
        pieFrac: af[o + 7],
        marching: af[o + 8] > 0,
        encounter: af[o + 9],
        moraleCap: af[o + 10],
        mine: af[o + 11] > 0,
        roster: Array.from(af.subarray(o + 12, o + 21)),
      });
    }
    this.roadLevels = new Uint8Array(mem, c.road_levels_ptr(), this.cfg.data.map.edges.length);
    this.outposts = JSON.parse(c.outposts_json());
    const cn = c.city_count();
    const cf = new Float32Array(mem, c.city_info_ptr(), cn * CITY_STRIDE);
    this.cities.clear();
    let hash = 0;
    for (let i = 0; i < cn; i++) {
      const o = i * CITY_STRIDE;
      this.cities.set(cf[o], { owner: cf[o + 1], garrison: cf[o + 2], queue: cf[o + 3] });
      hash = (Math.imul(hash, 31) + cf[o] * 7 + cf[o + 1]) | 0;
    }
    // Recolor territory only when some city changed hands.
    if (hash !== this.ownerHash && this.territory && this.t3d) {
      this.ownerHash = hash;
      this.territory.rebuild(this.cities);
      this.t3d.updateTerritory(this.territory.rgba);
      this.t3d.setCityOwners(this.cities, this.playerFaction());
    }
  }

  // ---- input ------------------------------------------------------------------

  private wireInput(signal: AbortSignal) {
    const cv = this.canvas;
    let dragging = false;
    let moved = false;
    cv.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        dragging = true;
        moved = false;
      }
    }, { signal });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && dragging) {
        dragging = false;
        if (!moved) this.click(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);
      }
    }, { signal });
    cv.addEventListener('mousemove', (e) => {
      if (dragging && (e.movementX || e.movementY)) {
        moved = true;
        this.cam.x -= e.movementX / this.cam.scale;
        this.cam.y += e.movementY / this.cam.scale;
        return;
      }
      // Hover: the nearest of my armies under the cursor (mirrors click).
      const [wx, wy] = this.renderer.toWorld(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);
      const rKm = 14 / this.cam.scale;
      let best = -1;
      let bestD = rKm;
      for (const a of this.armies) {
        const d = Math.hypot(a.x - wx, a.y - wy);
        if (a.mine && d < bestD) {
          bestD = d;
          best = a.id;
        }
      }
      this.hover = best;
    }, { signal });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      const [wx, wy] = this.renderer.toWorld(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);
      this.cam.scale = Math.min(8, this.cam.scale * f);
      this.t3d!.clampCam(this.cam); // zoom floor + new basis for zoom-to-cursor
      const [nx, ny] = this.renderer.toWorld(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);
      this.cam.x += wx - nx;
      this.cam.y += wy - ny;
      this.t3d!.clampCam(this.cam);
    }, { signal, passive: false });
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.rightClick(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);
    }, { signal });
    window.addEventListener('keydown', (e) => {
      if (this.modal) return;
      if (e.key === ' ') {
        e.preventDefault();
        this.paused = !this.paused;
      } else if (e.key === '1') this.setSpeed(0);
      else if (e.key === '2') this.setSpeed(1);
      else if (e.key === '3') this.setSpeed(2);
      else if (e.key === 'h' && this.selected >= 0) {
        this.cfg.campaign.order_halt(this.selected);
        this.refreshViews();
      }
    }, { signal });
  }

  private click(px: number, py: number) {
    // Select the nearest of my armies; second preference: open a city panel.
    const [wx, wy] = this.renderer.toWorld(px, py);
    const rKm = 14 / this.cam.scale;
    let best = -1;
    let bestD = rKm;
    for (const a of this.armies) {
      const d = Math.hypot(a.x - wx, a.y - wy);
      if (a.mine && d < bestD) {
        bestD = d;
        best = a.id;
      }
    }
    this.selected = best;
    const loc = best < 0 ? nearestLoc(this.cfg.data.map, wx, wy, rKm) : null;
    if (loc && loc.kind === 0 && this.cfg.data.map.nodes[loc.a].kind === 'city') {
      this.openCityPanel(loc.a);
    } else if (loc && loc.kind === 0 && this.cfg.data.map.nodes[loc.a].kind === 'junction') {
      this.openJunctionPanel(loc.a);
    } else if (loc && loc.kind === 1 && this.cfg.data.map.edges[loc.a].kind === 'road') {
      this.openRoadPanel(loc.a);
    } else {
      this.closeCityPanel();
    }
    this.updateArmyPanel();
  }

  private rightClick(px: number, py: number) {
    if (this.selected < 0) return;
    const [wx, wy] = this.renderer.toWorld(px, py);
    const loc = nearestLoc(this.cfg.data.map, wx, wy, 60 / this.cam.scale);
    if (!loc) return;
    this.cfg.campaign.order_move(this.selected, loc.kind, loc.a, loc.b);
    this.refreshViews();
  }

  private setSpeed(i: number) {
    this.speed = i;
    this.paused = false;
  }

  // ---- battle handoff ---------------------------------------------------------

  private showBattleModal(eid: number) {
    const c = this.cfg.campaign;
    const info = JSON.parse(c.encounter_json(eid));
    if (!info) return;
    const my = info.player_faction;
    const facName = (f: number) => this.cfg.data.map.factions[f]?.name ?? `faction ${f}`;
    const side = (s: any, label: string, noRetreat: boolean) => `
      <div class="cmp-side">
        <h3>${label}${s.garrison ? ' (garrison)' : ''}</h3>
        <div>${facName(s.faction)}</div>
        <div>${s.soldiers} soldiers</div>
        ${noRetreat ? '<div class="cmp-warn">NO RETREAT — destroyed if defeated</div>' : ''}
      </div>`;
    const mineInvolved = info.attacker.faction === my || info.defender.faction === my;
    this.modal = document.createElement('div');
    this.modal.className = 'cmp-modal';
    this.modal.innerHTML = `
      <div class="cmp-box">
        <h2>${info.ambush ? 'AMBUSH!' : 'Battle'}</h2>
        <div class="cmp-sides">
          ${side(info.attacker, 'Attacker', info.no_retreat[0])}
          ${side(info.defender, 'Defender', info.no_retreat[1])}
        </div>
        ${info.reinforcements > 0 ? `<div>${info.reinforcements} nearby armies will join with delay</div>` : ''}
        <div class="cmp-actions">
          ${mineInvolved ? '<button id="cmp-fight">Fight</button>' : ''}
          <button id="cmp-auto">Auto-resolve</button>
        </div>
      </div>`;
    this.ui.appendChild(this.modal);
    this.modal.querySelector('#cmp-fight')?.addEventListener('click', () => this.fight(eid));
    this.modal.querySelector('#cmp-auto')?.addEventListener('click', () => this.autoResolve(eid));
  }

  private closeModal() {
    this.modal?.remove();
    this.modal = null;
  }

  private fight(eid: number) {
    this.closeModal();
    const c = this.cfg.campaign;
    try {
      localStorage.setItem(SAVE_KEY + '-auto', c.save());
    } catch {}
    const game = start_campaign_battle(c, eid);
    if (!game) return;
    this.cfg.onBattle(game, () => {
      report_battle(c, game);
      game.free();
      this.refreshViews();
      this.paused = true;
    });
  }

  private autoResolve(eid: number) {
    this.closeModal();
    const c = this.cfg.campaign;
    const game = start_campaign_battle(c, eid);
    if (!game) return;
    this.autoResolving = true;
    const overlay = document.createElement('div');
    overlay.className = 'cmp-modal';
    overlay.innerHTML = `<div class="cmp-box"><h2>Resolving battle…</h2><div id="cmp-prog">0:00</div></div>`;
    this.ui.appendChild(overlay);
    // Match the native headless auto-resolve cap: long grinds are decided by
    // remaining strength instead of making the UI burn minutes of wasm time.
    const cap = 30 * 60 * 12; // 12 battle-minutes
    let ticks = 0;
    const pump = () => {
      const v = game.auto_step(30 * 10); // 10 battle-seconds per frame
      ticks += 30 * 10;
      const secs = Math.floor(ticks / 30);
      overlay.querySelector('#cmp-prog')!.textContent =
        `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} battle time`;
      if (v >= 0 || ticks >= cap) {
        report_battle(c, game);
        game.free();
        overlay.remove();
        this.autoResolving = false;
        this.refreshViews();
      } else {
        requestAnimationFrame(pump);
      }
    };
    requestAnimationFrame(pump);
  }

  // ---- DOM --------------------------------------------------------------------

  private buildDom() {
    // WebGL terrain underneath, transparent marker canvas on top.
    const gl = document.createElement('canvas');
    gl.id = 'campaign-gl';
    gl.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:none;';
    document.body.appendChild(gl);
    const cv = document.createElement('canvas');
    cv.id = 'campaign-canvas';
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:none;';
    document.body.appendChild(cv);
    const ui = document.createElement('div');
    ui.id = 'campaign-ui';
    ui.style.display = 'none';
    ui.innerHTML = `
      <style>
        #campaign-ui .cmp-top { position:fixed;top:0;left:0;right:0;display:flex;gap:14px;align-items:center;
          padding:6px 12px;background:rgba(12,16,22,0.85);color:#e8e0cc;font:13px system-ui;z-index:10; }
        #campaign-ui button { background:#2a3242;color:#e8e0cc;border:1px solid #4a5468;border-radius:3px;
          padding:3px 10px;cursor:pointer;font:12px system-ui; }
        #campaign-ui button.on { background:#5a6a8a; }
        #campaign-ui .cmp-panel { position:fixed;right:10px;top:44px;width:230px;background:rgba(12,16,22,0.9);
          color:#e8e0cc;font:12px system-ui;padding:10px;border-radius:4px;z-index:10; }
        #campaign-ui .cmp-modal { position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;
          align-items:center;justify-content:center;z-index:20; }
        #campaign-ui .cmp-box { background:#161c26;color:#e8e0cc;padding:22px 30px;border-radius:6px;
          font:14px system-ui;text-align:center;min-width:380px; }
        #campaign-ui .cmp-sides { display:flex;gap:30px;justify-content:center;margin:12px 0; }
        #campaign-ui .cmp-warn { color:#ff7a6a;font-weight:bold;margin-top:6px; }
        #campaign-ui .cmp-actions { display:flex;gap:12px;justify-content:center;margin-top:10px; }
        #campaign-ui .cmp-actions button { font-size:15px;padding:8px 22px; }
      </style>
      <div class="cmp-top">
        <span id="cmp-date">Day 1</span>
        <span id="cmp-gold">0 gold</span>
        <button id="cmp-pause">⏸</button>
        <button data-speed="0">1×</button>
        <button data-speed="1">3×</button>
        <button data-speed="2">10×</button>
        <span style="flex:1"></span>
        <button id="cmp-save">Save</button>
        <button id="cmp-exit">Menu</button>
      </div>
      <div class="cmp-panel" id="cmp-army" style="display:none"></div>
      <div class="cmp-panel" id="cmp-city" style="display:none;top:auto;bottom:10px;"></div>`;
    document.body.appendChild(ui);
    ui.querySelector('#cmp-pause')!.addEventListener('click', () => (this.paused = !this.paused));
    ui.querySelectorAll<HTMLButtonElement>('button[data-speed]').forEach((b) =>
      b.addEventListener('click', () => this.setSpeed(Number(b.dataset.speed))),
    );
    ui.querySelector('#cmp-save')!.addEventListener('click', () => {
      const c = this.cfg.campaign;
      if (c.can_save()) {
        try {
          localStorage.setItem(SAVE_KEY, c.save());
        } catch {}
      }
    });
    ui.querySelector('#cmp-exit')!.addEventListener('click', () => this.cfg.onExit());
  }

  private updateHud() {
    const t = this.cfg.campaign.current_tick();
    const day = Math.floor(t / 1440) + 1;
    const mins = t % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(Math.floor(mins % 60)).padStart(2, '0');
    const date = this.ui.querySelector('#cmp-date')!;
    date.textContent = `Day ${day}, ${hh}:${mm}${this.paused ? '  ⏸ PAUSED' : `  ${SPEEDS[this.speed]}×`}`;
    this.ui.querySelector('#cmp-gold')!.textContent = `${this.cfg.campaign.treasury()} gold`;
    this.ui.querySelectorAll<HTMLButtonElement>('button[data-speed]').forEach((b) =>
      b.classList.toggle('on', !this.paused && Number(b.dataset.speed) === this.speed),
    );
  }

  private updateArmyPanel() {
    const panel = this.ui.querySelector('#cmp-army') as HTMLDivElement;
    if (this.selected < 0) {
      panel.style.display = 'none';
      return;
    }
    const roster = JSON.parse(this.cfg.campaign.army_roster_json(this.selected));
    if (!roster) {
      panel.style.display = 'none';
      return;
    }
    // checkbox index = roster index (split takes a bitmask over them)
    const rows = roster
      .map((r: any, i: number) =>
        r.count > 0
          ? `<div><label><input type="checkbox" data-entry="${i}"> ${r.class}: ${r.count}/${r.max} (morale ${Math.round(r.morale_cap * 100)}%)</label></div>`
          : '')
      .join('');
    const me = this.armies.find((a) => a.id === this.selected);
    // merge candidate: another of my halted armies on the same/adjacent tile
    const buddy = me
      ? this.armies.find((a) => a.mine && a.id !== me.id && Math.hypot(a.x - me.x, a.y - me.y) < 6)
      : undefined;
    // On a trigger tile? (wasm re-validates; this only drives button state)
    const spotIdx = me
      ? this.spotPos.findIndex(([x, y]) => Math.hypot(x - me.x, y - me.y) < 2.6)
      : -1;
    const ambushLabel = me?.stance === 3 ? 'Hidden' : me?.stance === 2 ? 'Settling…' : 'Ambush';
    panel.innerHTML = `<b>Army ${this.selected}</b>${rows}<div style="margin-top:6px">
      <button id="cmp-halt">Halt</button>
      <button id="cmp-camp">${me?.stance === 1 ? 'Camped' : 'Camp'}</button>
      ${spotIdx >= 0 || (me && me.stance >= 2 && me.stance <= 3) ? `<button id="cmp-ambush" ${me!.stance >= 2 ? 'disabled' : ''}>${ambushLabel}</button>` : ''}
      <button id="cmp-split">Split</button>
      ${buddy ? `<button id="cmp-merge">Merge ${buddy.id}</button>` : ''}</div>`;
    panel.style.display = 'block';
    panel.querySelector('#cmp-halt')?.addEventListener('click', () => {
      this.cfg.campaign.order_halt(this.selected);
      this.refreshViews();
    });
    panel.querySelector('#cmp-ambush')?.addEventListener('click', () => {
      if (spotIdx >= 0 && this.cfg.campaign.order_ambush(this.selected, spotIdx)) {
        this.refreshViews();
        this.updateArmyPanel();
      }
    });
    panel.querySelector('#cmp-camp')?.addEventListener('click', () => {
      if (this.cfg.campaign.order_camp(this.selected)) {
        this.refreshViews();
        this.updateArmyPanel();
      }
    });
    panel.querySelector('#cmp-split')?.addEventListener('click', () => {
      let mask = 0;
      panel.querySelectorAll<HTMLInputElement>('input[data-entry]:checked').forEach((b) => {
        mask |= 1 << Number(b.dataset.entry);
      });
      if (mask && this.cfg.campaign.order_split(this.selected, mask)) {
        this.refreshViews();
        this.updateArmyPanel();
      }
    });
    panel.querySelector('#cmp-merge')?.addEventListener('click', () => {
      if (buddy && this.cfg.campaign.order_merge(buddy.id, this.selected)) {
        this.refreshViews();
        this.updateArmyPanel();
      }
    });
  }

  private openCityPanel(node: number) {
    const panel = this.ui.querySelector('#cmp-city') as HTMLDivElement;
    const n = this.cfg.data.map.nodes[node];
    const c = this.cities.get(node);
    if (!c) return;
    const mineCity = this.cfg.data.map.factions[c.owner]?.playable !== undefined && c.owner === this.playerFaction();
    const classes = ['HeavySword', 'LightSpear', 'LongSwords', 'Phalanx', 'Archers', 'Skirmishers', 'ShockCavalry', 'HorseArchers', 'ArtilleryCrew', 'Peasant', 'LightSword', 'HeavySpear'];
    const recruits = mineCity
      ? `<div style="margin-top:6px">${classes
          .map((cl, i) => `<button data-recruit="${i}" title="${cl}">${cl.replace(/[a-z]/g, '')}</button>`)
          .join(' ')}</div>`
      : '';
    const detail = JSON.parse(this.cfg.campaign.city_json(node));
    const buildRow = (kind: number, name: string, lvl: number, costs: number[]) => {
      if (detail.building) {
        return detail.building === name.toLowerCase()
          ? `<div>${name} L${lvl} — building, ${Math.ceil(detail.build_ticks_left / 1440)}d left</div>`
          : `<div>${name} L${lvl}</div>`;
      }
      return lvl < 2 && mineCity
        ? `<div>${name} L${lvl} <button data-build="${kind}">+ (${costs[lvl]}g)</button></div>`
        : `<div>${name} L${lvl}</div>`;
    };
    const buildings = detail
      ? buildRow(0, 'Market', detail.market_lvl, [200, 300]) + buildRow(1, 'Barracks', detail.barracks_lvl, [250, 400])
      : '';
    panel.innerHTML = `<b>${n.name}</b> (tier ${n.tier}) — ${this.cfg.data.map.factions[c.owner]?.name ?? '?'}
      <div>garrison ${c.garrison}${c.queue ? ` | recruiting ${c.queue}` : ''}</div>${buildings}${recruits}`;
    panel.style.display = 'block';
    panel.querySelectorAll<HTMLButtonElement>('button[data-build]').forEach((b) =>
      b.addEventListener('click', () => {
        if (this.cfg.campaign.order_build(node, Number(b.dataset.build))) {
          this.refreshViews();
          this.openCityPanel(node);
        }
      }),
    );
    panel.querySelectorAll<HTMLButtonElement>('button[data-recruit]').forEach((b) =>
      b.addEventListener('click', () => {
        this.cfg.campaign.order_recruit(node, Number(b.dataset.recruit), 240);
        this.refreshViews();
        this.openCityPanel(node);
      }),
    );
  }

  private openRoadPanel(edge: number) {
    const panel = this.ui.querySelector('#cmp-city') as HTMLDivElement;
    const c = this.cfg.campaign;
    const e = this.cfg.data.map.edges[edge];
    const lvl = c.road_level(edge);
    const job = c.road_job_ticks(edge);
    const cost = 15 * e.tiles.length;
    const status =
      job >= 0
        ? `paving… ${Math.ceil(job / 60)}h left`
        : lvl >= 3
          ? 'fully paved'
          : `<button id="cmp-road-up">Upgrade (${cost} gold)</button>`;
    panel.innerHTML = `<b>Road</b> (${e.tiles.length} tiles) — level ${lvl}<div style="margin-top:6px">${status}</div>`;
    panel.style.display = 'block';
    panel.querySelector('#cmp-road-up')?.addEventListener('click', () => {
      if (c.order_upgrade_road(edge)) {
        this.refreshViews();
        this.openRoadPanel(edge);
      }
    });
  }

  private openJunctionPanel(node: number) {
    const panel = this.ui.querySelector('#cmp-city') as HTMLDivElement;
    const c = this.cfg.campaign;
    const o = this.outposts.find((x) => x.node === node);
    const body = o
      ? `${this.cfg.data.map.factions[o.owner]?.name ?? '?'} outpost ${o.built ? '' : '(building…)'}`
      : `<button id="cmp-outpost">Build outpost (150 gold)</button>`;
    panel.innerHTML = `<b>${this.cfg.data.map.nodes[node].name}</b> (junction)<div style="margin-top:6px">${body}</div>`;
    panel.style.display = 'block';
    panel.querySelector('#cmp-outpost')?.addEventListener('click', () => {
      if (c.order_build_outpost(node)) {
        this.refreshViews();
        this.openJunctionPanel(node);
      }
    });
  }

  private closeCityPanel() {
    (this.ui.querySelector('#cmp-city') as HTMLDivElement).style.display = 'none';
  }

  private playerFaction(): number {
    return this.cfg.campaign.player_faction();
  }
}

export { loadCampaignData };
