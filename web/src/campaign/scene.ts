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
import { Allegiance } from './status';
import { installCampaignDebugApi, markCampaignReady } from './debugApi';
import {
  armyPanelHtml,
  campaignDomHtml,
  classBuilderHtml,
  cityPanelHtml,
  diplomacyHtml,
  type ArmyRosterRow,
  type ClassDoctrineRow,
  type CityDetail,
  type DiplomacyAction,
  type DiplomacyRow,
} from './panels';
import { readCampaignViews, type ArmyView, type CityView } from './views';

/** Campaign ticks per real second at base speed. A tick covers
 * MINUTES_PER_TICK game-minutes (campaign tunables), so at 10 min/tick the base
 * already runs ~10 game-hours per real second — the old top speed. The world is
 * tick-driven (movement, economy, AI), so fast-forward stays in lockstep while
 * the AI cost per real-second tracks the multiplier, not the tick scale. */
const TICKS_PER_SEC = 60;
const SPEEDS = [1, 2, 4];
const SAVE_KEY = 'campaign-save';
/** Ticks between a snapshot and applying the decisions it yields — must match
 *  campaign tunables AI_LATENCY. */
const AI_LATENCY = 60;

export interface CampaignConfig {
  wasm: InitOutput;
  campaign: Campaign;
  data: CampaignData;
  /** The map JSON the campaign was built from — handed to the AI worker so it
   *  can load posted state snapshots. */
  mapJson: string;
  onExit: () => void;
  /** Hand a battle Game to the battle scene; call done() when it ends. */
  onBattle: (game: Game, done: () => void) => void;
}

interface EncounterSide {
  id: number;
  faction: number;
  soldiers: number;
  garrison: boolean;
}

interface EncounterInfo {
  player_faction: number;
  attacker: EncounterSide;
  defender: EncounterSide;
  no_retreat: [boolean, boolean];
  reinforcements: number;
  ambush: boolean;
}

/** One of the player's cities currently standing a siege (live, not paused). */
interface SiegeView {
  node: number;
  x: number;
  y: number;
  attacker: number;
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
  /** The off-thread AI worker — the sole driver of the campaign AI. */
  private aiWorker: Worker | null = null;
  private selected = -1;
  private hover = -1;
  /** Node index of the city whose panel is open — the one settlement that wears
   *  the green selection ring. -1 when no city is selected. */
  private selectedCity = -1;
  /** Allegiance (Friend/Neutral/Foe) per faction id, refreshed when ownership
   *  or relations change; drives the map flag and label-icon colours. */
  private factionStatus = new Int8Array(0);
  /** Faction (political) view: territories flooded with owner colours + names.
   *  Off = the natural map (terrain only, neutral city dots). */
  private factionView = true;
  /** Fog of war: the player sees only their own cities/armies and the ground
   *  around them; everything else is dark under drifting cloud. Defaults off so
   *  the campaign opens on the full parchment atlas; toggle (F) for gameplay. */
  private fogOfWar = false;
  private diploOpen = false;
  private diploJson = '';
  private classBuilderOpen = false;
  private classBuilderJson = '';
  private classDraft = new Map<number, { unit: number; size: number }>();
  private armies: ArmyView[] = [];
  private cities = new Map<number, CityView>();
  private roadLevels: Uint8Array = new Uint8Array(0);
  private stackUnitCap = 1;
  private recruitClasses: string[] = [];
  private spotPos: [number, number][] = [];
  private modal: HTMLDivElement | null = null;
  private autoResolving = false;
  /** Signature of the currently-shown siege notifications, to avoid rebuilding
   *  the DOM (and its click handlers) every tick. */
  private siegeSig = '';

  constructor(private cfg: CampaignConfig) {
    this.cam = { x: 0, y: 0, scale: 0.18 };
  }

  enter() {
    // Warm the map font (Cinzel) so the canvas labels engrave from the first
    // frames rather than flashing the serif fallback.
    void document.fonts.load('700 40px Cinzel');
    void document.fonts.load('600 14px Cinzel');
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
    if (!this.aiWorker) this.startAiWorker();
    this.last = performance.now();
    this.refreshViews();
    if (this.recruitClasses.length === 0) {
      this.recruitClasses = JSON.parse(this.cfg.campaign.unit_class_names_json()) as string[];
    }
    // Debug/verify hook (mirrors the battle scene's window.__game).
    installCampaignDebugApi({
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
      openCity: (node: number) => this.openCityPanel(node),
      treasury: () => this.cfg.campaign.treasury(),
      save: () => this.cfg.campaign.save(),
      select: (id: number) => (this.selected = id),
      selected: () => this.selected,
      paused: () => this.paused,
      /** Test/verify hook: flip the political (faction) overlay on or off. */
      factionView: (on?: boolean) => {
        this.factionView = on ?? !this.factionView;
        this.syncFactionBtn();
        return this.factionView;
      },
      /** Test/verify hook: flip gameplay fog of war on or off (off = reveal). */
      fogOfWar: (on?: boolean) => {
        this.fogOfWar = on ?? !this.fogOfWar;
        this.syncFactionBtn();
        return this.fogOfWar;
      },
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
      /** Fog-of-war probe: player visibility (0..1) at a world point. */
      visAt: (x: number, y: number) => this.t3d!.visibleAt(x, y),
      cellInfo: (x: number, y: number) => this.territory!.infoAt(x, y, this.cities),
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
    });
  }

  /** Spin up the off-thread AI: a worker computes commander decisions on posted
   *  snapshots, which the host applies on a fixed delay. The AI never runs in
   *  the tick loop, so this is the sole driver. */
  private startAiWorker() {
    const worker = new Worker(new URL('./ai-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ applyAt: number; json: string }>) => {
      this.cfg.campaign.submit_decisions_json(e.data.applyAt, e.data.json);
    };
    worker.postMessage({ type: 'init', mapJson: this.cfg.mapJson });
    this.aiWorker = worker;
  }

  exit() {
    markCampaignReady(false);
    this.aiWorker?.terminate();
    this.aiWorker = null;
    this.ac?.abort();
    this.ac = null;
    this.canvas.style.display = 'none';
    this.glCanvas.style.display = 'none';
    this.ui.style.display = 'none';
    this.closeModal();
  }

  /** Advance the campaign `n` ticks under the host AI protocol: run to each
   *  boundary, snapshot on a dispatch tick and hand it to the worker, stop on a
   *  stall until its decisions arrive. The fixed apply-delay makes this
   *  independent of how `n` is chunked per frame. */
  private advance(n: number) {
    const c = this.cfg.campaign;
    let remaining = n;
    while (remaining > 0) {
      const step = c.advance_external(remaining);
      remaining -= step.advanced;
      if (step.reason === 1) {
        this.aiWorker?.postMessage({ type: 'snapshot', applyAt: step.tick + AI_LATENCY, snap: c.save() });
        c.ack_dispatch();
        continue;
      }
      break; // reason 0 (budget spent / battle) or 2 (stall — wait for the worker)
    }
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
        this.advance(n);
        this.refreshViews();
        if (c.battle_ready() >= 0 && !this.modal) {
          this.paused = true; // auto-pause: a battle wants a decision
          this.showBattleModal(c.battle_ready());
        }
      }
    }

    // A battle modal (or auto-resolve) covers the screen with a dimmed
    // backdrop: stop redrawing the world behind it. The 3D map render is the
    // frame's whole cost, so skipping it keeps the decision UI responsive
    // instead of grinding a heavy frame the player can't even see.
    if (!this.autoResolving && !this.modal) this.drawWorld();
    this.updateHud();
  }

  /** One full world render at the current camera. The frame's whole cost. */
  private drawWorld() {
    this.renderer.resize();
    this.t3d!.resize();
    this.t3d!.clampCam(this.cam); // zoom floor = aspect-fill, pan inside the map
    if (this.fogOfWar) this.t3d!.setVision(this.visionSources());
    // 3D models under the floating banners; fogged enemies are dropped.
    this.t3d!.setArmies(this.armies, this.cam.scale, this.stackUnitCap, this.selected, this.hover, this.fogOfWar);
    this.t3d!.setSelectedCity(this.selectedCity);
    this.t3d!.draw(this.cam, this.factionView, this.fogOfWar);
    const sel = this.armies.find((a) => a.id === this.selected && a.mine);
    const hints: [number, number][] = sel
      ? this.spotPos.filter(([x, y]) => Math.hypot(x - sel.x, y - sel.y) < 12)
      : [];
    this.renderer.draw(this.cam, this.armies, this.cities, this.selected, null, this.territory!.labels, this.roadLevels, hints, this.factionView, this.fogOfWar, this.territory!.borders, this.factionStatus);
  }

  /** Pan the camera to a world point (clamped inside the map). */
  private centerCam(x: number, y: number) {
    this.cam.x = x;
    this.cam.y = y;
    this.t3d!.clampCam(this.cam);
  }

  // ---- state out of wasm ----------------------------------------------------

  private refreshViews() {
    const views = readCampaignViews(this.cfg.campaign, this.cfg.wasm, this.cfg.data.map.edges.length);
    this.armies = views.armies;
    this.cities = views.cities;
    this.roadLevels = views.roadLevels;
    this.stackUnitCap = views.stackUnitCap;
    // Keep allegiance fresh for the 2D label icons (cheap; the renderer reads
    // it every frame). City/army FLAGS are faction-coloured, so they only need
    // a recolour when a town actually changes hands.
    this.refreshFactionStatus();
    this.refreshSieges();
    if (views.ownerHash !== this.ownerHash && this.territory && this.t3d) {
      this.ownerHash = views.ownerHash;
      this.territory.rebuild(this.cities);
      this.t3d.updateTerritory(this.territory.rgba);
      this.t3d.setCityOwners(this.cities);
    }
  }

  /** Live notifications for the player's besieged cities. The world keeps
   *  running (no auto-pause); clicking a notice pans the camera to the city so
   *  the player can rush relief before the garrison battle commits. */
  private refreshSieges() {
    const sieges = JSON.parse(this.cfg.campaign.sieges_json()) as SiegeView[];
    const facName = (f: number) => this.cfg.data.map.factions[f]?.name ?? `faction ${f}`;
    // Rebuild only when the set of besieged cities changes, not every tick.
    const sig = sieges.map((s) => s.node).join(',');
    const box = this.ui.querySelector('#cmp-sieges') as HTMLDivElement | null;
    if (!box) return;
    if (sig !== this.siegeSig) {
      this.siegeSig = sig;
      box.innerHTML = sieges
        .map(
          (s) => `<div class="cmp-siege" data-node="${s.node}" data-x="${s.x}" data-y="${s.y}">
            <b>⚔ ${this.cfg.data.map.nodes[s.node].name} under siege</b>
            <div class="cmp-siege-sub">${facName(s.attacker)} at the walls — click to view</div>
          </div>`,
        )
        .join('');
      box.querySelectorAll<HTMLDivElement>('.cmp-siege').forEach((el) =>
        el.addEventListener('click', () => {
          this.centerCam(Number(el.dataset.x), Number(el.dataset.y));
          this.openCityPanel(Number(el.dataset.node));
        }),
      );
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
      } else if (e.key === 'v') {
        this.factionView = !this.factionView;
        this.syncFactionBtn();
      } else if (e.key === 'f') {
        this.fogOfWar = !this.fogOfWar;
        this.syncFactionBtn();
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
    if (best >= 0) this.selectedCity = -1; // an army takes the selection from a city
    const loc = best < 0 ? nearestLoc(this.cfg.data.map, wx, wy, rKm) : null;
    if (loc && loc.kind === 0 && this.cfg.data.map.nodes[loc.a].kind === 'city') {
      this.openCityPanel(loc.a);
    } else if (loc && loc.kind === 0 && this.cfg.data.map.nodes[loc.a].kind === 'junction') {
      this.openJunctionPanel(loc.a);
    } else {
      this.closeCityPanel();
    }
    this.updateArmyPanel();
  }

  private rightClick(px: number, py: number) {
    if (this.selected < 0) return;
    const [wx, wy] = this.renderer.toWorld(px, py);
    // Right-clicking an enemy army latches onto it — chase it across the map.
    const rKm = 14 / this.cam.scale;
    let foe = -1;
    let foeD = rKm;
    for (const a of this.armies) {
      if (a.mine) continue;
      const d = Math.hypot(a.x - wx, a.y - wy);
      if (d < foeD) {
        foeD = d;
        foe = a.id;
      }
    }
    if (foe >= 0) {
      this.cfg.campaign.order_pursue(this.selected, foe);
      this.refreshViews();
      return;
    }
    // Otherwise, march to the clicked location.
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
    const info = JSON.parse(c.encounter_json(eid)) as EncounterInfo | null;
    if (!info) return;
    const my = info.player_faction;
    const facName = (f: number) => this.cfg.data.map.factions[f]?.name ?? `faction ${f}`;
    const side = (s: EncounterSide, label: string, noRetreat: boolean) => `
      <div class="cmp-side">
        <h3>${label}${s.garrison ? ' (garrison)' : ''}</h3>
        <div>${facName(s.faction)}</div>
        <div>${s.soldiers} soldiers</div>
        ${noRetreat ? '<div class="cmp-warn">NO RETREAT — destroyed if defeated</div>' : ''}
      </div>`;
    const mineInvolved = info.attacker.faction === my || info.defender.faction === my;
    // Jump the camera to where the fight is so the player sees the threat
    // behind the (semi-transparent) modal. Prefer the defender — that is the
    // place under attack — and fall back to the attacker if it is off-map or
    // fogged (e.g. a city garrison not drawn as a field army).
    const at =
      this.armies.find((a) => a.id === info.defender.id) ??
      this.armies.find((a) => a.id === info.attacker.id);
    if (at) {
      this.centerCam(at.x, at.y);
      this.drawWorld(); // one render at the new camera before the modal covers it
    }
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
    ui.innerHTML = campaignDomHtml();
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
    ui.querySelector('#cmp-diplo-btn')!.addEventListener('click', () => this.toggleDiplomacy());
    ui.querySelector('#cmp-classes-btn')!.addEventListener('click', () => this.toggleClassBuilder());
    ui.querySelector('#cmp-factions')!.addEventListener('click', () => {
      this.factionView = !this.factionView;
      this.syncFactionBtn();
    });
    ui.querySelector('#cmp-fog')!.addEventListener('click', () => {
      this.fogOfWar = !this.fogOfWar;
      this.syncFactionBtn();
    });
    this.syncFactionBtn();
  }

  /** Reflect the view-toggle flags on their HUD buttons (lit when active). */
  private syncFactionBtn() {
    this.ui?.querySelector('#cmp-factions')?.classList.toggle('on', this.factionView);
    this.ui?.querySelector('#cmp-fog')?.classList.toggle('on', this.fogOfWar);
  }

  private toggleDiplomacy() {
    this.diploOpen = !this.diploOpen;
    const panel = this.ui.querySelector('#cmp-diplomacy') as HTMLDivElement;
    panel.style.display = this.diploOpen ? 'block' : 'none';
    this.ui.querySelector('#cmp-diplo-btn')!.classList.toggle('on', this.diploOpen);
    if (this.diploOpen) this.updateDiplomacyPanel();
  }

  private toggleClassBuilder() {
    this.classBuilderOpen = !this.classBuilderOpen;
    const panel = this.ui.querySelector('#cmp-classes') as HTMLDivElement;
    panel.style.display = this.classBuilderOpen ? 'block' : 'none';
    this.ui.querySelector('#cmp-classes-btn')!.classList.toggle('on', this.classBuilderOpen);
    if (this.classBuilderOpen) this.updateClassBuilderPanel(true);
  }

  private updateDiplomacyPanel() {
    if (!this.diploOpen) return;
    const json = this.cfg.campaign.diplomacy_json();
    if (json === this.diploJson) return; // unchanged — keep the live DOM/listeners
    this.diploJson = json;
    const panel = this.ui.querySelector('#cmp-diplomacy') as HTMLDivElement;
    const list = JSON.parse(json) as DiplomacyRow[];
    panel.innerHTML = diplomacyHtml(list);
    const actions: Record<DiplomacyAction, (other: number) => boolean> = {
      declare_war: (other) => this.cfg.campaign.declare_war(other),
      make_peace: (other) => this.cfg.campaign.make_peace(other),
      propose_alliance: (other) => this.cfg.campaign.propose_alliance(other),
      break_alliance: (other) => this.cfg.campaign.break_alliance(other),
      gift_gold: (other) => this.cfg.campaign.gift_gold(other, 200),
    };
    panel.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        const other = Number(b.dataset.f);
        const act = b.dataset.act as DiplomacyAction | undefined;
        if (act) actions[act](other);
        this.refreshViews();
        this.updateDiplomacyPanel();
      }),
    );

  }

  private updateHud() {
    const t = this.cfg.campaign.current_tick();
    const day = Math.floor(t / 1440) + 1;
    const mins = t % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(Math.floor(mins % 60)).padStart(2, '0');
    const date = this.ui.querySelector('#cmp-date')!;
    date.textContent = `Day ${day}, ${hh}:${mm}${this.paused ? '  ⏸ PAUSED' : `  ${SPEEDS[this.speed]}×`}`;
    // Gold plus the monthly books (income − heavy upkeep = net), the "set policy,
    // watch the books" payoff. The realm settles once a game-month.
    const eco = JSON.parse(this.cfg.campaign.economy_json()) as {
      treasury: number;
      monthly_income: number;
      monthly_upkeep: number;
      monthly_net: number;
    };
    const sign = eco.monthly_net >= 0 ? '+' : '';
    this.ui.querySelector('#cmp-gold')!.textContent =
      `${eco.treasury} gold  (${sign}${eco.monthly_net}/mo: +${eco.monthly_income} −${eco.monthly_upkeep})`;
    this.ui.querySelectorAll<HTMLButtonElement>('button[data-speed]').forEach((b) =>
      b.classList.toggle('on', !this.paused && Number(b.dataset.speed) === this.speed),
    );
    this.updateDiplomacyPanel(); // cheap no-op unless open and changed
    this.updateClassBuilderPanel(); // cheap no-op unless open and changed
  }

  private updateClassBuilderPanel(force = false) {
    if (!this.classBuilderOpen) return;
    const json = this.cfg.campaign.class_doctrine_json();
    if (!force && json === this.classBuilderJson) return;
    this.classBuilderJson = json;
    const rows = (JSON.parse(json) as ClassDoctrineRow[]).map((r) => {
      const d = this.classDraft.get(r.classIndex);
      if (!d) return r;
      return { ...r, selected: d.unit, sizeMult: d.size, dirty: d.unit !== r.selected || d.size !== r.sizeMult };
    });
    const panel = this.ui.querySelector('#cmp-classes') as HTMLDivElement;
    panel.innerHTML = classBuilderHtml(rows);
    panel.querySelectorAll<HTMLButtonElement>('button[data-unit]').forEach((b) =>
      b.addEventListener('click', () => {
        const cls = Number(b.dataset.class);
        const unit = Number(b.dataset.unit);
        const row = rows.find((r) => r.classIndex === cls);
        if (!row) return;
        this.classDraft.set(cls, { unit, size: row.sizeMult });
        this.updateClassBuilderPanel(true);
      }),
    );
    panel.querySelectorAll<HTMLButtonElement>('button[data-size]').forEach((b) =>
      b.addEventListener('click', () => {
        const cls = Number(b.dataset.class);
        const size = Number(b.dataset.size);
        const row = rows.find((r) => r.classIndex === cls);
        if (!row) return;
        this.classDraft.set(cls, { unit: row.selected, size });
        this.updateClassBuilderPanel(true);
      }),
    );
    panel.querySelectorAll<HTMLButtonElement>('button[data-apply]').forEach((b) =>
      b.addEventListener('click', () => {
        const cls = Number(b.dataset.apply);
        const draft = this.classDraft.get(cls);
        if (draft && this.cfg.campaign.order_set_class_doctrine(cls, draft.unit, draft.size)) {
          this.classDraft.delete(cls);
          this.refreshViews();
          this.updateClassBuilderPanel(true);
        }
      }),
    );
  }

  private updateArmyPanel() {
    const panel = this.ui.querySelector('#cmp-army') as HTMLDivElement;
    if (this.selected < 0) {
      panel.style.display = 'none';
      return;
    }
    const roster = JSON.parse(this.cfg.campaign.army_roster_json(this.selected)) as ArmyRosterRow[] | null;
    if (!roster) {
      panel.style.display = 'none';
      return;
    }
    const me = this.armies.find((a) => a.id === this.selected);
    // merge candidate: another of my halted armies on the same/adjacent tile
    const buddy = me
      ? this.armies.find((a) => a.mine && a.id !== me.id && Math.hypot(a.x - me.x, a.y - me.y) < 6)
      : undefined;
    // On a trigger tile? (wasm re-validates; this only drives button state)
    const spotIdx = me
      ? this.spotPos.findIndex(([x, y]) => Math.hypot(x - me.x, y - me.y) < 2.6)
      : -1;
    const autoReplenish = this.cfg.campaign.army_auto_replenish(this.selected);
    panel.innerHTML = armyPanelHtml(this.selected, roster, me, buddy, spotIdx, autoReplenish);
    panel.style.display = 'block';
    panel.querySelector('#cmp-auto-replenish')?.addEventListener('change', (e) => {
      const on = (e.currentTarget as HTMLInputElement).checked;
      this.cfg.campaign.order_auto_replenish(this.selected, on);
      this.refreshViews();
      this.updateArmyPanel();
    });
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
    this.selectedCity = node;
    const panel = this.ui.querySelector('#cmp-city') as HTMLDivElement;
    const c = this.cities.get(node);
    if (!c) return;
    const mineCity = this.cfg.data.map.factions[c.owner]?.playable !== undefined && c.owner === this.playerFaction();
    const detail = JSON.parse(this.cfg.campaign.city_json(node)) as CityDetail | null;
    if (!detail) return;
    panel.innerHTML = cityPanelHtml(this.cfg.data, node, c, mineCity, detail, this.recruitClasses);
    panel.style.display = 'block';
    // Policy dials: drag a slider to set the city's focus/throttle. Read both so
    // changing one keeps the other; the city auto-develops from here.
    const policyInputs = panel.querySelectorAll<HTMLInputElement>('input[data-policy]');
    const applyPolicy = () => {
      const get = (k: string) =>
        Number(panel.querySelector<HTMLInputElement>(`input[data-policy="${k}"]`)?.value ?? 0);
      this.cfg.campaign.order_set_city_policy(node, get('focus'), get('throttle'));
      this.refreshViews();
    };
    policyInputs.forEach((b) => b.addEventListener('change', applyPolicy));
    panel.querySelectorAll<HTMLButtonElement>('button[data-recruit]').forEach((b) =>
      b.addEventListener('click', () => {
        this.cfg.campaign.order_recruit(node, Number(b.dataset.recruit), 240);
        this.refreshViews();
        this.openCityPanel(node);
      }),
    );
  }

  private openJunctionPanel(node: number) {
    this.selectedCity = -1;
    const panel = this.ui.querySelector('#cmp-city') as HTMLDivElement;
    panel.innerHTML = `<b>${this.cfg.data.map.nodes[node].name}</b> (junction)`;
    panel.style.display = 'block';
  }

  private closeCityPanel() {
    this.selectedCity = -1;
    (this.ui.querySelector('#cmp-city') as HTMLDivElement).style.display = 'none';
  }

  private playerFaction(): number {
    return this.cfg.campaign.player_faction();
  }

  /** Rebuild factionStatus from the player's diplomatic relations. Only the
   *  playable powers carry a relation; every neutral league (and anyone at
   *  peace) reads as Neutral, allies and the player's own faction as Friend,
   *  belligerents as Foe. Cheap; called when ownership/relations may have moved. */
  private refreshFactionStatus() {
    const facs = this.cfg.data.map.factions;
    if (this.factionStatus.length !== facs.length) this.factionStatus = new Int8Array(facs.length);
    this.factionStatus.fill(Allegiance.Neutral);
    const pf = this.playerFaction();
    if (pf >= 0 && pf < facs.length) this.factionStatus[pf] = Allegiance.Friend;
    for (const f of JSON.parse(this.cfg.campaign.diplomacy_json()) as { id: number; relation: string }[]) {
      this.factionStatus[f.id] =
        f.relation === 'war' ? Allegiance.Foe :
        f.relation === 'alliance' || f.relation === 'self' ? Allegiance.Friend :
        Allegiance.Neutral;
    }
  }

  /** The player's fog-of-war sight: a disc around each of their cities (wider
   *  for bigger towns) and each of their armies on the march. */
  private visionSources(): { x: number; y: number; r: number }[] {
    const pf = this.playerFaction();
    const src: { x: number; y: number; r: number }[] = [];
    for (const [node, cv] of this.cities) {
      if (cv.owner !== pf) continue;
      const n = this.cfg.data.map.nodes[node];
      src.push({ x: n.pos[0], y: n.pos[1], r: 150 + n.tier * 45 });
    }
    for (const a of this.armies) {
      if (a.mine) src.push({ x: a.x, y: a.y, r: 130 });
    }
    return src;
  }
}

export { loadCampaignData };
