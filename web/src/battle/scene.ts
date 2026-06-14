import { Game, type InitOutput } from '../wasm/game_wasm.js';
import type { Scene } from '../scene';
import { Camera } from '../shared/camera';
import { pushGhost, pushPie, pushRing } from '../shared/overlays';
import { CLASS_NAMES, Renderer, WILDS_MARGIN } from './renderer';
import { BattleRenderer3D, type BannerSlot } from './renderer3d';
import { UnitBanner, type BannerChip } from './unitBanner';
import { Input } from './input';
import { MANUAL_HTML } from './manual';
import { groupMoveDests, UnitSnap } from './orders';

const TICK_DT = 1 / 30;
const MAX_TICKS_PER_FRAME = 4;

// Class table mirrors — must match class.rs. Indices: 0 heavy, 1 light, 2 long
// sword, 3 phalanx, 4 archers, 5 skirmishers, 6 shock cav, 7 horse archers,
// 8 artillery, 9 peasant, 10 light sword, 11 heavy spear.
const CLASS_DEPTH = [8, 6, 4, 10, 4, 4, 5, 5, 4, 6, 6, 8];
const CLASS_SPACING = [0.9, 1.0, 1.5, 0.8, 1.2, 1.6, 1.8, 2.2, 2.0, 1.1, 1.0, 0.9];
// Primary weapon (reach, arc) for the attack-arc display.
export type BattleKind = 'duel' | '5v5' | 'surround' | 'flank' | 'mapA' | 'mapB';

export interface BattleConfig {
  wasm: InitOutput;
  game: Game;
  kind: BattleKind;
  /** Back to the menu (Exit button). */
  onExit: () => void;
  /** Fresh battle of `kind` (Restart and the map/sandbox buttons). */
  onLaunch: (kind: BattleKind) => void;
  /** Campaign battles: no restart, "Main Menu" reads "Continue". */
  inCampaign?: boolean;
}

// One renderer for the page: engine/atlas state is battle-independent;
// per-battle data arrives through setStatic/setTerrain. The battlefield
// runs on Babylon; `?gfx=2d` falls back to the legacy GL sprite renderer.
type BattleGfx = Renderer | BattleRenderer3D;
let sharedRenderer: BattleGfx | null = null;
const USE_3D = new URLSearchParams(location.search).get('gfx') !== '2d';

export class BattleScene implements Scene {
  private cleanups: (() => void)[] = [];
  private frameFn: (now: number) => void = () => {};

  constructor(private cfg: BattleConfig) {}

  frame(now: number) {
    this.frameFn(now);
  }

  exit() {
    for (const fn of this.cleanups.reverse()) fn();
    this.cleanups = [];
    this.frameFn = () => {};
    window.__ready = false;
    this.cfg.game.free();
  }

  enter() {
    const { wasm, game } = this.cfg;
    const ui = document.getElementById('battle-ui')!;
    ui.style.display = 'block';
    this.cleanups.push(() => { ui.style.display = 'none'; });
    const ac = new AbortController();
    const signal = ac.signal;
    this.cleanups.push(() => ac.abort());

    const positions = () =>
      new Float32Array(wasm.memory.buffer, game.positions_ptr(), game.soldier_count() * 2);
    const facings = () => new Float32Array(wasm.memory.buffer, game.facings_ptr(), game.soldier_count());
    const unitInfo = () =>
      new Float32Array(wasm.memory.buffer, game.unit_info_ptr(), game.unit_count() * game.unit_info_stride());

    const canvas = document.getElementById('battlefield') as HTMLCanvasElement;
    const camera = new Camera(canvas);
    const renderer = (sharedRenderer ??= USE_3D ? new BattleRenderer3D(canvas) : new Renderer(canvas));
    if (renderer instanceof BattleRenderer3D) camera.pitch = renderer.pitch;
    renderer.resize(); // the canvas may have been display:none through a window resize
    const STRIDE = game.unit_info_stride();
    const atEaseRange = game.at_ease_range(); // one shared range: morale, pose, fidget

    // Open framed to the ARMIES (bbox + margin), not the map: a two-unit
    // duel opens snug on the action; full deployments span the field and
    // fall back to the map framing.
    {
      const mapW = game.terrain_w() * game.terrain_cell();
      const mapH = game.terrain_h() * game.terrain_cell();
      const ox = game.terrain_origin_x();
      const oy = game.terrain_origin_y();
      camera.bounds = [ox - WILDS_MARGIN, oy - WILDS_MARGIN, ox + mapW + WILDS_MARGIN, oy + mapH + WILDS_MARGIN];
      const info = unitInfo();
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let u = 0; u < game.unit_count(); u++) {
        const o = u * STRIDE;
        x0 = Math.min(x0, info[o]); x1 = Math.max(x1, info[o]);
        y0 = Math.min(y0, info[o + 1]); y1 = Math.max(y1, info[o + 1]);
      }
      const dpr = window.devicePixelRatio || 1;
      const mapZoom = (canvas.clientHeight * dpr) / Math.min(mapH * 0.62, 1000);
      const fit = Number.isFinite(x0)
        ? Math.min(
            (canvas.clientWidth * dpr) / (x1 - x0 + 130),
            (canvas.clientHeight * dpr) / (y1 - y0 + 130),
          )
        : 0;
      if (fit > mapZoom) {
        // Small field (duels, sandboxes): open snug on the action.
        camera.x = (x0 + x1) / 2;
        camera.y = (y0 + y1) / 2;
        camera.zoom = Math.min(fit, 6);
      } else {
        // Full deployment: open behind your own line, framed to the map.
        camera.y = -0.27 * mapH;
        camera.zoom = mapZoom;
      }
      camera.clampView();
    }

    // Static-per-soldier arrays. Campaign battles can spawn reinforcement
    // units mid-fight, so this re-runs whenever the counts grow (pointers are
    // re-fetched every time — wasm memory may have moved).
    const applyStatic = () => {
      const soldierUnit = new Uint32Array(wasm.memory.buffer, game.soldier_unit_ptr(), game.soldier_count());
      const info = unitInfo();
      const teams = Array.from({ length: game.unit_count() }, (_, u) => info[u * STRIDE + 6]);
      const classes = Array.from({ length: game.unit_count() }, (_, u) => info[u * STRIDE + 13]);
      const radii = new Float32Array(wasm.memory.buffer, game.radius_ptr(), game.soldier_count());
      renderer.setStatic(soldierUnit, teams, classes, radii);
    };
    applyStatic();
    {
      const tw = game.terrain_w();
      const th = game.terrain_h();
      renderer.setTerrain(
        tw, th, game.terrain_cell(), game.terrain_origin_x(), game.terrain_origin_y(),
        new Float32Array(wasm.memory.buffer, game.terrain_speed_ptr(), tw * th),
        new Float32Array(wasm.memory.buffer, game.terrain_rough_ptr(), tw * th),
        new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), tw * th),
      );
    }

    // --- Minimap ---------------------------------------------------------------
    const minimap = document.getElementById('minimap') as HTMLCanvasElement;
    const miniBack = document.createElement('canvas');
    {
      const tw = game.terrain_w();
      const th = game.terrain_h();
      miniBack.width = minimap.width;
      miniBack.height = minimap.height;
      const g = miniBack.getContext('2d')!;
      const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), tw * th);
      const PAL = ['#5a6a40', '#2c455c', '#6f6c66', '#7a6c5b', '#37512c', '#56503c', '#6e6651'];
      const img = g.createImageData(minimap.width, minimap.height);
      for (let py = 0; py < minimap.height; py++) {
        for (let px = 0; px < minimap.width; px++) {
          const cx = Math.floor((px / minimap.width) * tw);
          const cy = Math.floor(((minimap.height - 1 - py) / minimap.height) * th);
          const c = PAL[tint[cy * tw + cx]] ?? PAL[0];
          const n = parseInt(c.slice(1), 16);
          const o = (py * minimap.width + px) * 4;
          img.data[o] = n >> 16;
          img.data[o + 1] = (n >> 8) & 0xff;
          img.data[o + 2] = n & 0xff;
          img.data[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    }
    const worldToMini = (x: number, y: number): [number, number] => {
      const [ox, oy] = [game.terrain_origin_x(), game.terrain_origin_y()];
      const w = game.terrain_w() * game.terrain_cell();
      const h = game.terrain_h() * game.terrain_cell();
      return [((x - ox) / w) * minimap.width, (1 - (y - oy) / h) * minimap.height];
    };
    minimap.addEventListener('mousedown', (e) => {
      const r = minimap.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      camera.x = game.terrain_origin_x() + fx * game.terrain_w() * game.terrain_cell();
      camera.y = game.terrain_origin_y() + (1 - fy) * game.terrain_h() * game.terrain_cell();
    }, { signal });
    function drawMinimap() {
      const g = minimap.getContext('2d')!;
      g.drawImage(miniBack, 0, 0);
      const info = unitInfo();
      for (let u = 0; u < game.unit_count(); u++) {
        const o = u * STRIDE;
        if (info[o + 15] === 0) continue;
        const [mx, my] = worldToMini(info[o], info[o + 1]);
        g.fillStyle = info[o + 21] > 0.5 ? '#888' : info[o + 6] === 0 ? '#6f9ae8' : '#e0604f';
        g.fillRect(mx - 1.5, my - 1.5, 3, 3);
      }
      const [ax, ay] = camera.screenToWorld(0, 0);
      const [bx, by] = camera.screenToWorld(canvas.width, canvas.height);
      const [m0x, m0y] = worldToMini(ax, ay);
      const [m1x, m1y] = worldToMini(bx, by);
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1;
      g.strokeRect(Math.min(m0x, m1x), Math.min(m0y, m1y), Math.abs(m1x - m0x), Math.abs(m1y - m0y));
    }

    // --- Per-unit banners: standard + HP/cohesion bars + status chips ------------
    // In-game banners are world-space BILLBOARDS in the Babylon scene (see
    // renderer3d.ts UnitBannerLayer): a quad above each unit, always facing the
    // camera, so the standard tracks the block in 3D and depth-sorts instead of
    // being projected onto the screen. The legacy `?gfx=2d` GL renderer has no
    // billboard layer, so it falls back to the DOM component placed by an exact
    // (pitch-free) screen projection.
    const is3D = renderer instanceof BattleRenderer3D;
    const labelsRoot = document.getElementById('unitlabels')!;
    const domBanners: UnitBanner[] = [];
    // Northmost (top-on-screen) world-y per unit, refreshed each frame from the
    // soldiers — where the standard plants so it rises clear above the block,
    // not buried in a deep formation. Centred on the centroid in x.
    let unitTopY = new Float32Array(0);
    const addDomBanner = () => {
      const b = new UnitBanner();
      b.setVisible(false);
      labelsRoot.appendChild(b.el);
      domBanners.push(b);
    };
    if (!is3D) for (let u = 0; u < game.unit_count(); u++) addDomBanner();
    let knownUnits = game.unit_count(); // last-seen count (campaign reinforcements grow it)
    this.cleanups.push(() => { labelsRoot.innerHTML = ''; });

    // Translate a unit's sim row into status chips: explicit states first, then
    // the physical facts the press makes true.
    function unitChips(info: Float32Array, o: number): BannerChip[] {
      const chips: BannerChip[] = [];
      const cls2 = info[o + 13];
      const mode = info[o + 24];
      if (info[o + 21] > 0.5) chips.push({ text: 'ROUT', kind: 'bad' });
      else if (mode === 2) chips.push({ text: 'DIS', title: 'disengaging' });
      else if (mode === 1) chips.push({ text: 'ATK', title: 'attacking' });
      if (info[o + 18] === 2) chips.push({ text: 'CHG!', kind: 'hot', title: 'charging' });
      chips.push(info[o + 17] > 0.5
        ? { text: 'FEN', title: 'fence: fight at reach' }
        : { text: 'OTH', title: 'othismos: press with weight' });
      if (info[o + 25] > 0.5) chips.push({ text: 'PUR', title: 'pursue: latch onto contact' });
      if (info[o + 26] > 0.5) chips.push({ text: 'KITE', title: 'kiting reflex on' });
      if (info[o + 29] > 0.5) chips.push({ text: '2nd', kind: 'hot', title: 'secondary weapon drawn' });
      if (info[o + 3] < 0.3 && info[o + 16] > 0) chips.push({ text: 'BRC', title: 'braced: planted mass' });
      if (info[o + 8] < 0.35) chips.push({ text: 'TIRED', kind: 'bad', title: 'winded' });
      if (info[o + 28] > 0.5) chips.push({ text: 'SQZ', title: 'squeezed into a corridor' });
      if (info[o + 27] > 0.5) chips.push({ text: 'WAIT', title: 'queued behind friends' });
      if (info[o + 31] > 0.55) chips.push({ text: 'CRUSH', kind: 'bad', title: 'crushed in the press: no room, evade dying' });
      if ([4, 5, 7, 8].includes(cls2) && info[o + 19] === 0) chips.push({ text: 'AMMO!', kind: 'bad', title: 'quivers empty' });
      if (info[o + 16] > 0) chips.push({ text: `⚔${info[o + 16]}`, kind: 'hot', title: 'men trading blows' });
      return chips;
    }

    function updateUnitBanners() {
      const info = unitInfo();
      const sel = input.selected.length > 0 ? input.selected[0] : -1;
      const n = game.unit_count();
      if (is3D) {
        // World-space billboards: hand the renderer one slot per unit at the
        // unit's CENTROID and let it place + face the quads. The pole foot is
        // bottom-anchored there, so the standard reads as planted in the middle
        // of the block and rising from it. The layer owns the show-when-zoomed
        // gate and the per-unit redraw cache.
        const slots: (BannerSlot | null)[] = new Array(n);
        for (let u = 0; u < n; u++) {
          const o = u * STRIDE;
          const alive = info[o + 15];
          if (alive === 0) { slots[u] = null; continue; }
          slots[u] = {
            x: info[o + 32],
            y: info[o + 33],
            team: info[o + 6] === 0 ? 0 : 1,
            hp: alive / info[o + 7],
            cohesion: info[o + 4],
            chips: unitChips(info, o),
            selected: u === sel,
          };
        }
        (renderer as BattleRenderer3D).updateBanners(slots, camera.zoom);
        return;
      }
      // Legacy 2D GL renderer: DOM banners on an exact (pitch-free) projection.
      const showAll = camera.zoom > 1.1;
      for (let u = 0; u < n; u++) {
        const b = domBanners[u];
        const o = u * STRIDE;
        const alive = info[o + 15];
        if (alive === 0 || !showAll) {
          b.setVisible(false);
          continue;
        }
        const topY = unitTopY[u] > -Infinity ? unitTopY[u] : info[o + 33];
        const [sx, sy] = camera.worldToScreen(info[o + 32], topY);
        if (sx < -60 || sy < -40 || sx > window.innerWidth + 60 || sy > window.innerHeight + 40) {
          b.setVisible(false);
          continue;
        }
        b.setVisible(true);
        b.place(sx, sy);
        b.update({
          team: info[o + 6] === 0 ? 0 : 1,
          hp: alive / info[o + 7],
          cohesion: info[o + 4],
          chips: unitChips(info, o),
          selected: u === sel,
        });
      }
    }

    // --- Toolbar ------------------------------------------------------------------
    const toolButtons = new Map<string, HTMLButtonElement>();
    document.querySelectorAll<HTMLButtonElement>('#toolbar button').forEach((b) => {
      toolButtons.set(b.dataset.cmd!, b);
    });
    const KITE_CLASSES = [5, 7];
    const WEAPON_CLASSES = [3, 4, 5, 6, 7, 8]; // sidearm or slingable missile
    const MISSILE_CLASSES = [4, 5, 7, 8];
    function updateToolbar() {
      const sel = myUnits(input.selected);
      const info = unitInfo();
      const o = sel.length ? sel[0] * STRIDE : -1;
      const classes = sel.map((u) => info[u * STRIDE + 13]);
      const supports = (allowed: number[]) => classes.some((c) => allowed.includes(c));
      const set = (cmd: string, on: boolean, label?: string) => {
        const b = toolButtons.get(cmd)!;
        b.classList.toggle('on', on);
        if (label) b.textContent = label;
        if (!['pause', 'x1', 'x3', 'paths'].includes(cmd)) {
          let applies = sel.length > 0;
          if (cmd === 'kite') applies &&= supports(KITE_CLASSES);
          if (cmd === 'weapon') applies &&= supports(WEAPON_CLASSES);
          if (cmd === 'fire') applies &&= supports(MISSILE_CLASSES);
          b.disabled = !applies;
        }
      };
      set('pace', o >= 0 && info[o + 9] > 0.5, o >= 0 && info[o + 9] > 0.5 ? 'Running' : 'Run');
      set('stance', false, o >= 0 ? (info[o + 17] > 0.5 ? 'Fence' : 'Othismos') : 'Othismos');
      set('reform', false);
      set('pursue', o >= 0 && info[o + 25] > 0.5);
      set('fire', o >= 0 && sel.length > 0 && fireOn);
      set('weapon', o >= 0 && info[o + 29] > 0.5);
      set('kite', o >= 0 && info[o + 26] > 0.5);
      toolButtons.get('pause')!.classList.toggle('on', paused);
      toolButtons.get('x1')!.classList.toggle('on', !paused && timeScale === 1);
      toolButtons.get('x3')!.classList.toggle('on', !paused && timeScale === 3);
      toolButtons.get('paths')!.classList.toggle('on', showPaths);
    }
    document.getElementById('toolbar')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      const sel = input.selected;
      switch (b.dataset.cmd) {
        case 'pace': sink.togglePace(sel); break;
        case 'stance': sink.toggleStance(sel); break;
        case 'reform': sink.reform(sel); break;
        case 'pursue': sink.togglePursue(sel); break;
        case 'fire': sink.toggleFire(sel); break;
        case 'weapon': sink.toggleWeapon(sel); break;
        case 'kite': sink.toggleKite(sel); break;
        case 'pause': paused = !paused; break;
        case 'x1': paused = false; timeScale = 1; break;
        case 'x3': paused = false; timeScale = 3; break;
        case 'paths': showPaths = !showPaths; break;
      }
      updateToolbar();
    }, { signal });

    // --- Time control ------------------------------------------------------------
    let paused = false;
    let pausedBeforeFreeze = false;
    let frozen = false; // snapshot mode: no wall-clock pixels (HUD perf line, shader clock)
    // Absolute sim ticks driven so far (real-time loop + scripted advance). The
    // verify harness reads this to pin a snapshot to a fixed tick: idle men carry
    // a fidget sway that re-rolls every few ticks, so a stable pixel snapshot must
    // freeze at a known tick, not "whenever ~1s of wall-clock happened to land".
    let simTick = 0;
    let ended = false;
    const gameover = document.getElementById('gameover')!;
    gameover.style.display = 'none';
    const restartBtn = document.getElementById('gameover-restart')!;
    restartBtn.style.display = this.cfg.inCampaign ? 'none' : 'block';
    restartBtn.addEventListener('click', () => this.cfg.onLaunch(this.cfg.kind), { signal });
    const menuBtn = document.getElementById('gameover-menu')!;
    menuBtn.textContent = this.cfg.inCampaign ? 'Continue' : 'Main Menu';
    menuBtn.addEventListener('click', () => this.cfg.onExit(), { signal });
    document.getElementById('gameover-watch')!.addEventListener('click', () => {
      gameover.style.display = 'none';
    }, { signal });
    let timeScale = 1;
    let showPaths = false;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'p') paused = !paused;
      if (e.key === '1') timeScale = 1;
      if (e.key === '3') timeScale = 3;
      if (e.key === ' ') {
        showPaths = true;
        e.preventDefault();
      }
    }, { signal });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') showPaths = false;
    }, { signal });

    // --- Orders ------------------------------------------------------------------
    const unitCenter = (u: number): [number, number] => {
      const info = unitInfo();
      const o = u * STRIDE;
      // anchor is front-center; offset half-depth back along facing
      const alive = info[o + 15];
      const cls = info[o + 13];
      const depth = (Math.ceil(alive / Math.ceil(alive / CLASS_DEPTH[cls] || 1)) || 1) * 1.1;
      return [info[o] - Math.cos(info[o + 2]) * depth * 0.5, info[o + 1] - Math.sin(info[o + 2]) * depth * 0.5];
    };

    const myUnits = (units: number[]) => {
      const info = unitInfo();
      return units.filter((u) => info[u * STRIDE + 6] === 0 && info[u * STRIDE + 15] > 0);
    };

    const unitSnap = (u: number): UnitSnap => {
      const info = unitInfo();
      const [cx, cy] = unitCenter(u);
      const cls = info[u * STRIDE + 13];
      const alive = info[u * STRIDE + 15];
      const files = Math.max(1, Math.ceil(alive / CLASS_DEPTH[cls]));
      return { u, x: cx, y: cy, r: 0.5 * files * CLASS_SPACING[cls] };
    };

    // Order ghosts flash for a moment on every command (and persist on Space).
    const orderFlash = new Map<number, number>();
    const markFlash = (units: number[]) => {
      const t = performance.now();
      units.forEach((u) => orderFlash.set(u, t));
    };

    // Group move: clusters keep formation; far clusters combine at the target
    // as a compressed star. Facing = direction of travel.
    function groupMove(units: number[], x: number, y: number, kind: 'move' | 'disengage', facing?: number) {
      const sel = myUnits(units);
      if (sel.length === 0) return;
      const snaps = sel.map(unitSnap);
      let cx = 0, cy = 0;
      for (const s of snaps) {
        cx += s.x;
        cy += s.y;
      }
      cx /= snaps.length;
      cy /= snaps.length;
      const face = facing ?? Math.atan2(y - cy, x - cx);
      for (const d of groupMoveDests(snaps, x, y)) {
        if (kind === 'disengage') game.set_disengage_order(d.u, d.x, d.y);
        else game.set_move_order_facing(d.u, d.x, d.y, face);
      }
      markFlash(sel);
    }

    // Group attack: hold formation until ~150m out, then break and let every
    // unit pathfind to the target itself.
    interface GroupAttack {
      units: number[];
      target: number;
      lastTx: number;
      lastTy: number;
    }
    let groupAttacks: GroupAttack[] = [];
    function tickGroupAttacks() {
      const info = unitInfo();
      groupAttacks = groupAttacks.filter((ga) => {
        const sel = myUnits(ga.units);
        if (sel.length === 0) return false;
        const to = ga.target * STRIDE;
        if (info[to + 15] === 0) return false; // target destroyed
        const [tx, ty] = unitCenter(ga.target);
        let cx = 0, cy = 0;
        for (const u of sel) {
          const [x, y] = unitCenter(u);
          cx += x;
          cy += y;
        }
        cx /= sel.length;
        cy /= sel.length;
        const dist = Math.hypot(tx - cx, ty - cy);
        if (dist < 160) {
          sel.forEach((u) => game.set_attack_order(u, ga.target));
          markFlash(sel);
          return false; // formation released: every unit hunts on its own
        }
        if (Math.hypot(tx - ga.lastTx, ty - ga.lastTy) > 35) {
          // The target moved: re-aim the formation approach.
          const stop = dist - 150;
          const nx = cx + ((tx - cx) / dist) * stop;
          const ny = cy + ((ty - cy) / dist) * stop;
          groupMove(sel, nx, ny, 'move');
          ga.lastTx = tx;
          ga.lastTy = ty;
        }
        return true;
      });
    }

    const sink = {
      unitsInRect: (x0: number, y0: number, x1: number, y1: number) => {
        const info = unitInfo();
        const out: number[] = [];
        for (let u = 0; u < game.unit_count(); u++) {
          if (info[u * STRIDE + 6] !== 0 || info[u * STRIDE + 15] === 0) continue;
          const [cx, cy] = unitCenter(u);
          if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) out.push(u);
        }
        return out;
      },
      // Selection picks PLAYER units only (enemies are targets, not selections).
      pickUnit: (x: number, y: number) => {
        const u = game.pick_unit(x, y, 30);
        return u >= 0 && unitInfo()[u * STRIDE + 6] === 0 ? u : -1;
      },
      allUnits: () => {
        const info = unitInfo();
        const out: number[] = [];
        for (let u = 0; u < game.unit_count(); u++) {
          if (info[u * STRIDE + 6] === 0 && info[u * STRIDE + 15] > 0) out.push(u);
        }
        return out;
      },
      dragMove: (units: number[], dx: number, dy: number) => {
        // Translate the selection exactly, preserving each unit's facing.
        const sel = myUnits(units);
        const info = unitInfo();
        for (const u of sel) {
          const [cx, cy] = unitCenter(u);
          game.set_move_order_facing(u, cx + dx, cy + dy, info[u * STRIDE + 2]);
        }
        markFlash(sel);
      },
      orderPoint: (units: number[], x: number, y: number, shift: boolean, double: boolean, alt: boolean) => {
        // SHIFT = queue the order after what's underway; ALT = disengage.
        const sel = myUnits(units);
        if (sel.length === 0) return;
        const info = unitInfo();
        const targetUnit = game.pick_unit(x, y, 25);
        const isEnemy = targetUnit >= 0 && info[targetUnit * STRIDE + 6] !== 0 && info[targetUnit * STRIDE + 15] > 0;
        if (!shift) sel.forEach((u) => game.set_pace(u, double ? 1 : 0));
        if (isEnemy) {
          if (shift) {
            sel.forEach((u) => game.enqueue(u, 1, targetUnit, 0, 0, 0));
            markFlash(sel);
          } else if (sel.length === 1) {
            game.set_attack_order(sel[0], targetUnit);
            markFlash(sel);
          } else {
            // Formation approach, then break and charge at ~150m.
            groupAttacks = groupAttacks.filter((ga) => !ga.units.some((u) => sel.includes(u)));
            groupAttacks.push({ units: [...sel], target: targetUnit, lastTx: 1e9, lastTy: 1e9 });
            tickGroupAttacks();
          }
        } else if (shift) {
          const snaps = sel.map(unitSnap);
          let cx = 0, cy = 0;
          for (const s of snaps) { cx += s.x; cy += s.y; }
          cx /= snaps.length; cy /= snaps.length;
          const face = Math.atan2(y - cy, x - cx);
          for (const d of groupMoveDests(snaps, x, y)) {
            game.enqueue(d.u, alt ? 2 : 0, d.x, d.y, face, alt ? 0 : 1);
          }
          markFlash(sel);
        } else {
          groupMove(sel, x, y, alt ? 'disengage' : 'move');
        }
      },
      orderFacing: (units: number[], x: number, y: number, facing: number, queued: boolean) => {
        if (queued) {
          const sel = myUnits(units);
          const snaps = sel.map(unitSnap);
          for (const d of groupMoveDests(snaps, x, y)) {
            game.enqueue(d.u, 0, d.x, d.y, facing, 1);
          }
          markFlash(sel);
        } else {
          groupMove(units, x, y, 'move', facing);
        }
      },
      togglePace: (units: number[]) => {
        const sel = myUnits(units);
        const info = unitInfo();
        const anyWalk = sel.some((u) => info[u * STRIDE + 9] < 0.5);
        sel.forEach((u) => game.set_pace(u, anyWalk ? 1 : 0));
      },
      toggleStance: (units: number[]) => {
        const sel = myUnits(units);
        const info = unitInfo();
        const anyOth = sel.some((u) => info[u * STRIDE + 17] < 0.5);
        sel.forEach((u) => game.set_stance(u, anyOth ? 1 : 0));
      },
      reform: (units: number[]) => myUnits(units).forEach((u) => game.set_reform(u)),
      toggleWeapon: (units: number[]) => {
        const sel = myUnits(units);
        const info = unitInfo();
        const anyPrimary = sel.some((u) => info[u * STRIDE + 29] < 0.5);
        sel.forEach((u) => game.set_weapon_pref(u, anyPrimary ? 1 : 0));
      },
      toggleKite: (units: number[]) => {
        const sel = myUnits(units);
        const info = unitInfo();
        const anyOff = sel.some((u) => info[u * STRIDE + 26] < 0.5);
        sel.forEach((u) => game.set_evade_auto(u, anyOff ? 1 : 0));
      },
      togglePursue: (units: number[]) => {
        pursueOn = !pursueOn;
        myUnits(units).forEach((u) => game.set_pursue(u, pursueOn ? 1 : 0));
      },
      toggleFire: (units: number[]) => {
        fireOn = !fireOn;
        myUnits(units).forEach((u) => game.set_fire_at_will(u, fireOn ? 1 : 0));
      },
    };
    const input = new Input(canvas, camera, sink, signal);
    let pursueOn = false;
    let fireOn = true;

    // --- Overlay (paths, pies, projectiles, selection rings) ----------------------
    function overlayVerts(withPaths: boolean): Float32Array {
      const info = unitInfo();
      const n = game.unit_count();
      const verts: number[] = [];
      for (let u = 0; u < n; u++) {
        const o = u * STRIDE;
        const [ax, ay, facing, team] = [info[o], info[o + 1], info[o + 2], info[o + 6]];
        const [r, g, b] = team === 0 ? [0.55, 0.7, 1.0] : [1.0, 0.55, 0.45];
        if (withPaths) {
          const fx = Math.cos(facing);
          const fy = Math.sin(facing);
          verts.push(ax, ay, r, g, b, ax + fx * 4, ay + fy * 4, r, g, b);
          verts.push(ax - fy * 2, ay + fx * 2, r, g, b, ax + fy * 2, ay - fx * 2, r, g, b);
          if (info[o + 12] > 0.5) {
            verts.push(ax, ay, r, g, b, info[o + 10], info[o + 11], r, g, b);
          }
        }
        // Destination ghost: the formation frame at the end of the path
        // (flashes on every order; hold Space to keep them all visible).
        const age = performance.now() - (orderFlash.get(u) ?? -1e9);
        if (info[o + 12] > 0.5 && (withPaths || age < 2500)) {
          // Recent orders fade out; Space shows them at full strength.
          const k = withPaths ? 1 : Math.max(0, 1 - age / 2500);
          const cls = info[o + 13];
          const alive = info[o + 15];
          const files = Math.max(1, Math.ceil(alive / CLASS_DEPTH[cls]));
          const w = files * CLASS_SPACING[cls];
          const d = CLASS_DEPTH[cls] * 1.1;
          const gf = info[o + 23] > 0.5 ? info[o + 22] : Math.atan2(info[o + 11] - ay, info[o + 10] - ax);
          pushGhost(verts, info[o + 10], info[o + 11], gf, w, d, r * k, g * k, b * k);
          verts.push(ax, ay, r * 0.8 * k, g * 0.8 * k, b * 0.8 * k, info[o + 10], info[o + 11], r * 0.8 * k, g * 0.8 * k, b * 0.8 * k);
        }
        // Progress pies, one visual pattern: WHITE = order transmitting,
        // ORANGE = weapon order traveling down the line.
        if (info[o + 14] > 0) pushPie(verts, ax, ay, info[o + 14], 7, 1, 1, 1);
        if (info[o + 30] > 0) pushPie(verts, ax, ay, info[o + 30], 9, 1, 0.65, 0.2);
      }
      // Right-drag preview: where everyone will stand, facing the cursor.
      if (input.rightDrag) {
        const sel = myUnits(input.selected);
        if (sel.length > 0) {
          const snaps = sel.map(unitSnap);
          for (const dst of groupMoveDests(snaps, input.rightDrag.x, input.rightDrag.y)) {
            const o = dst.u * STRIDE;
            const cls = info[o + 13];
            const alive = info[o + 15];
            const files = Math.max(1, Math.ceil(alive / CLASS_DEPTH[cls]));
            pushGhost(verts, dst.x, dst.y, input.rightDrag.facing, files * CLASS_SPACING[cls], CLASS_DEPTH[cls] * 1.1, 1, 1, 0.7);
          }
          // The arrow itself.
          const a = input.rightDrag;
          verts.push(a.x, a.y, 1, 1, 0.7, a.x + Math.cos(a.facing) * 14, a.y + Math.sin(a.facing) * 14, 1, 1, 0.7);
        }
      }
      // Drag-move preview: ghosts of every selected unit at the dragged spot.
      if (input.dragDelta) {
        const [dx, dy] = input.dragDelta;
        for (const u of input.selected) {
          const o = u * STRIDE;
          const cls = info[o + 13];
          const alive = info[o + 15];
          if (alive === 0) continue;
          const files = Math.max(1, Math.ceil(alive / CLASS_DEPTH[cls]));
          const [cx, cy] = unitCenter(u);
          pushGhost(verts, cx + dx, cy + dy, info[o + 2], files * CLASS_SPACING[cls], CLASS_DEPTH[cls] * 1.1, 1, 1, 1);
        }
      }
      // Selection rings.
      for (const u of input.selected) {
        const [cx, cy] = unitCenter(u);
        pushRing(verts, cx, cy, 6, 12, 1, 1, 1);
      }
      // Projectiles.
      const pCount = game.projectile_count();
      if (pCount > 0) {
        const px = new Float32Array(wasm.memory.buffer, game.projectile_x_ptr(), pCount);
        const py = new Float32Array(wasm.memory.buffer, game.projectile_y_ptr(), pCount);
        const pk = new Uint8Array(wasm.memory.buffer, game.projectile_kind_ptr(), pCount);
        for (let i = 0; i < pCount; i++) {
          const stone = pk[i] === 2;
          const len = stone ? 1.4 : 0.7;
          const c = stone ? 0.25 : 0.92;
          verts.push(px[i] - len, py[i], c, c, c * 0.9, px[i] + len, py[i], c, c, c * 0.9);
        }
      }
      return new Float32Array(verts);
    }

    // --- The one Menu button: restart or exit --------------------------------------
    document.getElementById('manual')!.innerHTML = MANUAL_HTML;
    document.getElementById('manual')!.style.display = 'none';
    const pausemenu = document.getElementById('pausemenu')!;
    pausemenu.style.display = 'none';
    document.getElementById('btn-menu')!.addEventListener('click', () => {
      pausemenu.style.display = pausemenu.style.display === 'flex' ? 'none' : 'flex';
    }, { signal });
    const pauseRestart = document.getElementById('pause-restart')!;
    pauseRestart.style.display = this.cfg.inCampaign ? 'none' : 'block';
    pauseRestart.addEventListener('click', () => this.cfg.onLaunch(this.cfg.kind), { signal });
    document.getElementById('pause-exit')!.textContent =
      this.cfg.inCampaign ? 'Exit to Campaign' : 'Exit to Main Menu';
    document.getElementById('pause-manual')!.addEventListener('click', () => {
      const el = document.getElementById('manual')!;
      el.style.display = el.style.display === 'block' ? 'none' : 'block';
      pausemenu.style.display = 'none';
    }, { signal });
    document.getElementById('pause-exit')!.addEventListener('click', () => this.cfg.onExit(), { signal });
    document.getElementById('pause-close')!.addEventListener('click', () => {
      pausemenu.style.display = 'none';
    }, { signal });
    pausemenu.addEventListener('click', (e) => {
      if (e.target === pausemenu) pausemenu.style.display = 'none';
    }, { signal });

    // --- Main loop -----------------------------------------------------------------
    type WeaponSpec = { name: string; reach: number; minRange: number; arc: number; interval: number; damage: number; braced: boolean };
    type ClassSpec = {
      cost: number;
      mass: number; radius: number; brace: number; block: number; evade: number;
      training: number; speedMult: number; drainMult: number; health: number; mountHealth: number;
      mounted: boolean; charges: boolean; weapons: WeaponSpec[];
      missile: { name: string; range: number; interval: number; ammo: number; damage: number; mobileFire: boolean } | null;
    };
    const CLASS_SPECS: ClassSpec[] = JSON.parse(game.class_specs());
    const hud = document.getElementById('hud')!;
    const banner = document.getElementById('banner')!;
    const selbox = document.getElementById('selbox')!;
    banner.style.display = 'none';
    let aliveF32 = new Float32Array(0);
    let frames = new Float32Array(0);
    let prevPos = new Float32Array(0);
    let accumulator = 0;
    let lastFrame = performance.now();
    let tickMsAvg = 0;
    let fpsAvg = 60;
    let hudTimer = 0;

    const frame = (now: number) => {
      const frameDt = Math.min((now - lastFrame) / 1000, 0.25);
      lastFrame = now;
      fpsAvg += (1 / Math.max(frameDt, 1e-4) - fpsAvg) * 0.05;

      camera.x += input.panX * frameDt;
      camera.y += input.panY * frameDt;
      camera.clampView();

      accumulator += paused ? 0 : frameDt * timeScale;
      let ticks = 0;
      const maxTicks = MAX_TICKS_PER_FRAME * timeScale;
      while (accumulator >= TICK_DT && ticks < maxTicks) {
        const t0 = performance.now();
        game.tick();
        simTick++;
        tickMsAvg += (performance.now() - t0 - tickMsAvg) * 0.1;
        accumulator -= TICK_DT;
        ticks++;
      }
      if (ticks === maxTicks) accumulator = 0;

      // Reinforcements: campaign battles grow units mid-fight. The 3D billboard
      // layer grows itself from the slot count; only the DOM fallback needs
      // banners minted here.
      if (game.unit_count() > knownUnits) {
        knownUnits = game.unit_count();
        applyStatic();
        if (!is3D) while (domBanners.length < game.unit_count()) addDomBanner();
      }

      {
        const n = game.soldier_count();
        const a = new Uint8Array(wasm.memory.buffer, game.alive_ptr(), n);
        const fighting = new Uint8Array(wasm.memory.buffer, game.fighting_ptr(), n);
        const switchCd = new Float32Array(wasm.memory.buffer, game.switch_cd_ptr(), n);
        const sUnit = new Uint32Array(wasm.memory.buffer, game.soldier_unit_ptr(), n);
        const pos = positions();
        if (aliveF32.length !== n) {
          aliveF32 = new Float32Array(n);
          frames = new Float32Array(n);
          prevPos = new Float32Array(pos);
        }
        // Which units are at ease: halted, nobody fighting, not routing, and no
        // enemy within the sim's at_ease_range — the same notion that governs
        // morale recovery and the idle fidget, read from the sim so they agree.
        // Their standing men hold the at-ease pose (pikes up). One per-unit pass,
        // then a cheap lookup per soldier.
        const info = unitInfo();
        const uc = game.unit_count();
        const atEase = new Uint8Array(uc);
        const range2 = atEaseRange * atEaseRange; // the one shared at-ease range, from the sim
        for (let u = 0; u < uc; u++) {
          const o = u * STRIDE;
          if (info[o + 15] <= 0) continue;
          if (!(info[o + 3] < 0.1 && info[o + 16] === 0 && info[o + 21] < 0.5)) continue;
          const ux = info[o + 32], uy = info[o + 33], team = info[o + 6];
          let near2 = Infinity;
          for (let e = 0; e < uc; e++) {
            const eo = e * STRIDE;
            // nearest LIVING, NON-routing enemy (a fleeing enemy is no threat) —
            // the same test morale recovery uses.
            if (info[eo + 6] === team || info[eo + 15] <= 0 || info[eo + 21] > 0.5) continue;
            const dx = info[eo + 32] - ux, dy = info[eo + 33] - uy;
            near2 = Math.min(near2, dx * dx + dy * dy);
          }
          atEase[u] = near2 > range2 ? 1 : 0;
        }
        if (unitTopY.length < uc) unitTopY = new Float32Array(uc);
        unitTopY.fill(-Infinity, 0, uc);
        const t = now / 1000;
        for (let i = 0; i < n; i++) {
          aliveF32[i] = a[i];
          if (a[i]) {
            const wy = pos[2 * i + 1]; // top-on-screen is northmost (max world-y)
            if (wy > unitTopY[sUnit[i]]) unitTopY[sUnit[i]] = wy;
          }
          if (!a[i]) {
            frames[i] = 4; // fallen
          } else if (switchCd[i] > 0) {
            frames[i] = 5; // fumbling the weapon swap
          } else if (fighting[i]) {
            frames[i] = ((t * 2.5 + i * 0.7) | 0) % 2 ? 3 : 0; // trading blows
          } else {
            const dx = pos[2 * i] - prevPos[2 * i];
            const dy = pos[2 * i + 1] - prevPos[2 * i + 1];
            if (dx * dx + dy * dy > 0.0004) frames[i] = 1 + (((t * 4 + i) | 0) % 2); // marching
            else frames[i] = atEase[sUnit[i]] ? 6 : 0; // at ease (pikes up) or alert stand
          }
        }
        prevPos.set(pos);
      }
      const primary = input.selected.length > 0 ? input.selected[0] : -1;
      // Unit standards + state are a DOM component now (see UnitBanner), so the
      // renderers draw no banners — the empty list keeps the shared draw() shape.
      renderer.draw(positions(), facings(), frames, aliveF32, game.soldier_count(), camera, primary, [], 0);
      // Attack arcs: every soldier mid-swing flashes his weapon's true envelope
      // (reach x arc) — readable combat, straight from the class table. The arc
      // tracks the weapon ACTUALLY in hand (pike vs side-sword) and, for a braced
      // pike, the UNIT's frontage — never the man's own facing — so a flanked
      // phalanx shows side-swords, not a porcupine of sideways pikes.
      if (camera.zoom > 2.5) {
        const tris: number[] = [];
        const pos = positions();
        const face = facings();
        const curWeapon = new Uint8Array(wasm.memory.buffer, game.cur_weapon_ptr(), game.soldier_count());
        const soldierUnit = new Uint32Array(wasm.memory.buffer, game.soldier_unit_ptr(), game.soldier_count());
        const info = unitInfo();
        const [wx0, wy1] = camera.screenToWorld(0, 0);
        const [wx1, wy0] = camera.screenToWorld(canvas.width, canvas.height);
        let budget = 900;
        for (let i = 0; i < game.soldier_count() && budget > 0; i++) {
          if (frames[i] !== 3) continue;
          const x = pos[2 * i];
          const y = pos[2 * i + 1];
          if (x < wx0 || x > wx1 || y < wy0 || y > wy1) continue;
          const u = soldierUnit[i];
          const cls = info[u * STRIDE + 13];
          const w = CLASS_SPECS[cls]?.weapons[curWeapon[i]];
          if (!w) continue;
          const { reach, arc } = w;
          const team = info[u * STRIDE + 6];
          const [r, g, b] = team === 0 ? [0.55, 0.85, 1.0] : [1.0, 0.72, 0.35];
          const a = 0.26;
          const half = Math.max(arc, 0.18) / 2;
          const segs = arc > 1.2 ? 5 : 3;
          // A braced pike can't be slewed in the ranks — it bears along the unit's
          // facing, not the man's; everything else tracks the man as he squares up.
          const f0 = w?.braced ? info[u * STRIDE + 2] : face[i];
          const R = reach + 0.45; // surface-to-surface reach + a body radius
          for (let s = 0; s < segs; s++) {
            const a0 = f0 - half + (s / segs) * arc;
            const a1 = f0 - half + ((s + 1) / segs) * arc;
            tris.push(
              x, y, r, g, b, a,
              x + Math.cos(a0) * R, y + Math.sin(a0) * R, r, g, b, 0.04,
              x + Math.cos(a1) * R, y + Math.sin(a1) * R, r, g, b, 0.04,
            );
          }
          budget--;
        }
        if (tris.length) renderer.drawTris(new Float32Array(tris), camera);
      }
      renderer.drawOverlay(overlayVerts(showPaths), camera);

      // DOM selection rectangle.
      if (input.box) {
        selbox.style.display = 'block';
        selbox.style.left = Math.min(input.box.x0, input.box.x1) + 'px';
        selbox.style.top = Math.min(input.box.y0, input.box.y1) + 'px';
        selbox.style.width = Math.abs(input.box.x1 - input.box.x0) + 'px';
        selbox.style.height = Math.abs(input.box.y1 - input.box.y0) + 'px';
      } else {
        selbox.style.display = 'none';
      }

      updateUnitBanners();
      hudTimer += frameDt;
      if (hudTimer > 0.2) {
        hudTimer = 0;
        tickGroupAttacks();
        updateHud();
        updateToolbar();
        drawMinimap();
      }
    };

    function updateHud() {
      const lines = [
        `soldiers ${game.soldier_count().toLocaleString()}   units ${game.unit_count()}`,
        frozen
          ? 'fps —   tick — ms   PAUSED'
          : `fps ${fpsAvg.toFixed(0)}   tick ${tickMsAvg.toFixed(2)} ms` +
            (paused ? '   PAUSED' : timeScale !== 1 ? `   x${timeScale}` : ''),
      ];
      let bars = '';
      let cardUnit = -1;
      if (input.selected.length > 1) {
        lines.push(`${input.selected.length} units selected`);
      } else if (input.selected.length === 1) {
        cardUnit = input.selected[0];
      } else if (input.mouseCss[0] >= 0) {
        const dpr = window.devicePixelRatio || 1;
        const [wx, wy] = camera.screenToWorld(input.mouseCss[0] * dpr, input.mouseCss[1] * dpr);
        cardUnit = game.pick_unit(wx, wy, 25); // hover: either side
      }
      if (cardUnit >= 0) {
        const info = unitInfo();
        const o = cardUnit * STRIDE;
        const cohesion = info[o + 4];
        const fatigue = info[o + 8];
        const pace = info[o + 9] > 0.5 ? 'run' : 'walk';
        const cls = CLASS_NAMES[info[o + 13]] ?? '?';
        const stance = info[o + 17] > 0.5 ? 'fence' : 'othismos';
        const charge = info[o + 18] === 2 ? '  CHARGING' : '';
        const ammo = info[o + 19] > 0 ? `  ammo ${info[o + 19]}` : '';
        const routing = info[o + 21] > 0.5 ? '  ROUTING' : '';
        const engaged = info[o + 16];
        lines.push(
          `${info[o + 6] === 0 ? 'YOUR' : 'ENEMY'} ${cls}  ${pace} ${info[o + 3].toFixed(1)} m/s  ${stance}${charge}`,
          `men ${info[o + 15]}/${info[o + 7]}${engaged > 0 ? `  engaged ${engaged}` : ''}${ammo}${routing}`,
          `cohesion ${(cohesion * 100).toFixed(0)}%  disorder ${(info[o + 5] * 100).toFixed(0)}%  stamina ${(fatigue * 100).toFixed(0)}%  morale ${(info[o + 20] * 100).toFixed(0)}%`,
        );
        const spec = CLASS_SPECS[info[o + 13]];
        if (spec) {
          const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
          lines.push(
            `cost ${spec.cost} gold  ` +
              `mass ${spec.mass.toFixed(1)}${spec.brace > 1 ? ` (brace x${spec.brace.toFixed(1)})` : ''}  ` +
              `block ${pct(spec.block)}  evade ${pct(spec.evade)}  train ${pct(spec.training)}`,
            `speed x${spec.speedMult.toFixed(2)}  stamina drain x${spec.drainMult.toFixed(2)}  hp ${spec.health.toFixed(1)}` +
              (spec.mounted ? ` + mount ${spec.mountHealth.toFixed(1)}` : '') +
              (spec.charges ? '  charges' : ''),
          );
          for (const w of spec.weapons) {
            const deg = ((w.arc * 180) / Math.PI / 2).toFixed(0);
            lines.push(
              `&nbsp;${w.name}: ${w.reach.toFixed(1)}m ±${deg}°  ` +
                `dmg ${w.damage.toFixed(2)} / ${w.interval.toFixed(1)}s` +
                (w.minRange > 0 ? `  (dead <${w.minRange.toFixed(1)}m)` : ''),
            );
          }
          if (spec.missile) {
            const m = spec.missile;
            lines.push(
              `&nbsp;${m.name}: ${m.range.toFixed(0)}m  dmg ${m.damage.toFixed(2)} / ${m.interval.toFixed(0)}s  ` +
                `ammo ${m.ammo}${m.mobileFire ? '  fires mounted' : ''}`,
            );
          }
        }
        bars =
          `<div class="bar"><div style="width:${(cohesion * 100).toFixed(0)}%"></div></div>` +
          `<div class="bar"><div style="width:${(fatigue * 100).toFixed(0)}%;background:#d9a13b"></div></div>` +
          `<div class="bar"><div style="width:${(info[o + 20] * 100).toFixed(0)}%;background:#c2554e"></div></div>`;
      }
      hud.innerHTML = lines.join('<br>') + bars;

      // Game over: one side is dead or wholly routing. The sim keeps
      // RUNNING — routs are locked sim-side, so the pursuit plays out
      // visibly behind the panel instead of an abrupt freeze.
      const v = game.victor();
      if (v >= 0 && !ended) {
        ended = true;
        const win = v === 0;
        document.getElementById('gameover-title')!.textContent = win ? 'VICTORY' : 'DEFEAT';
        (document.getElementById('gameover-title') as HTMLElement).style.color = win ? '#6f9ae8' : '#e0604f';
        document.getElementById('gameover-sub')!.textContent = win
          ? 'The enemy army is broken. Your army holds the field.'
          : 'Your army is broken. The enemy holds the field.';
        gameover.style.display = 'flex';
      }
    }

    this.frameFn = frame;

    // --- Debug/verify API ------------------------------------------------------------
    // Snapshot mode: stop the sim and pin every wall-clock-driven pixel so
    // screenshots are reproducible (see snapshot.mjs). It must not OWN the pause
    // state (an unfreeze after a user pause should stay paused).
    const doFreeze = (on = true) => {
      if (on && !frozen) pausedBeforeFreeze = paused;
      paused = on ? true : pausedBeforeFreeze;
      frozen = on;
      renderer.fixedTime = on ? 0 : null;
    };
    window.__game = {
      stats: () => ({
        soldiers: game.soldier_count(),
        units: game.unit_count(),
        tickMs: tickMsAvg,
        fps: fpsAvg,
        victor: game.victor(),
      }),
      setOrder: (u: number, x: number, y: number) => game.set_move_order(u, x, y),
      select: (u: number) => {
        input.selected = u >= 0 ? [u] : [];
      },
      // The live selection (read-only snapshot) — lets the verify harness assert
      // what a real click or drag-box actually selected, exercising the input
      // path end to end rather than the `select` shortcut.
      selected: () => input.selected.slice(),
      setPace: (u: number, pace: number) => game.set_pace(u, pace),
      setStance: (u: number, s: number) => game.set_stance(u, s),
      attackOrder: (u: number, enemy: number) => game.set_attack_order(u, enemy),
      attackMove: (u: number, x: number, y: number) => game.set_attack_move_order(u, x, y),
      disengage: (u: number, x: number, y: number) => game.set_disengage_order(u, x, y),
      advance: (n: number) => {
        for (let i = 0; i < n; i++) { game.tick(); simTick++; }
        tickGroupAttacks();
      },
      // Absolute ticks driven so far — the harness pins a snapshot to a fixed
      // tick so the idle fidget sway can't jitter the pixels run-to-run.
      tickCount: () => simTick,
      // Freeze, then drive the sim to an exact absolute tick (advancing only
      // forward). Gives a byte-stable deployment snapshot regardless of how many
      // real-time ticks happened to elapse before the call.
      freezeAtTick: (target: number) => {
        doFreeze(true);
        const n = target - simTick;
        for (let i = 0; i < n; i++) { game.tick(); simTick++; }
        tickGroupAttacks();
      },
      freeze: (on = true) => doFreeze(on),
      groupMove: (units: number[], x: number, y: number) => groupMove(units, x, y, 'move'),
      setFiles: (u: number, files: number) => game.set_files(u, files),
      // Spawn an arbitrary unit (vibe scenarios: multi-column penetration, etc.).
      // Raw spawn — light-infantry stats; enough to exercise FORMATION behaviour.
      spawnUnit: (x: number, y: number, facing: number, count: number, files: number, team: number) =>
        game.spawn_unit(x, y, facing, count, files, 1.0, 1.2, team, 0.7),
      groupAttack: (units: number[], target: number) => {
        groupAttacks.push({ units, target, lastTx: 1e9, lastTy: 1e9 });
        tickGroupAttacks();
      },
      unitInfo: (u: number) => Array.from(unitInfo().slice(u * STRIDE, u * STRIDE + STRIDE)),
      soldierStartOf: (u: number) => {
        const info = unitInfo();
        let start = 0;
        for (let k = 0; k < u; k++) start += info[k * STRIDE + 7];
        return start;
      },
      soldierPos: (i: number) => {
        const p = positions();
        return [p[2 * i], p[2 * i + 1]];
      },
    };
    window.__cam = camera;
    window.__ready = true;
  }
}

declare global {
  interface Window {
    __game: unknown;
    __cam: unknown;
    __ready: boolean;
  }
}
