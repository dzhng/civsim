import { Game, type InitOutput } from "../wasm/game_wasm.js";
import type { Scene } from "../scene";
import { Camera } from "../shared/camera";
import { pushDestRings, pushPie, SELECTION_GREEN, SOLDIER_RING_RADIUS } from "../shared/overlays";
import { fatalSurfaceFor, showFatalErrorSurface } from "../shared/fatalError";
import {
  CLASS_SPACING,
  UNIT_INFO,
  unitFiles,
} from "../../../packages/game-renderer/src/battle/unitInfoLayout";
import {
  modelLookForClass,
  modelLookForUnit,
} from "../../../packages/game-renderer/src/models/shared/soldierModel";
import {
  HEAVY_PHALANX_REST_CLASS,
  HEAVY_PHALANX_SIDEARM_CLASS,
  MEDIUM_PHALANX_REST_CLASS,
  MEDIUM_PHALANX_SIDEARM_CLASS,
  SHOCK_CAV_SIDEARM_CLASS,
} from "../../../packages/soldier-assets/src/soldierMesh";
import { BattleRenderer, type BattleTacticalLineFrame } from "./renderer";
import { type CameraRigRange } from "./cameraRig";
import {
  CLASS_NAMES,
  UNIT_CLASS_BY_KEY,
  UNIT_CLASS_KEY_BY_ID,
  UnitClass,
  cardThumbUrl,
  validateClassSpecCatalog,
  type UnitClassKey,
} from "./classData";
import { UnitBanner, type BannerChip } from "./unitBanner";
import { armySummary } from "./armySummary";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { mountBattleHud, type BattleHudHandle } from "../ui/hud/BattleHud";
import { type ToolButtonState } from "../ui/hud/Toolbar";
import { type HudData, type HudUnit } from "../ui/hud/HudPanel";
import { GameOver, PauseMenu } from "../ui/hud/BattleModals";
import { installViewportGate } from "./viewportGate";
import { Input } from "./input";
import { MANUAL_HTML } from "./manual";
import { groupMoveDests, UnitSnap } from "./orders";
import { fightingFrameForTick } from "../../../packages/crowd-runtime/src/animationState";
import {
  BATTLE_RELIEF_EXAGGERATION,
  type BattleGroundCover,
  type BattleSlopeBands,
} from "../../../packages/game-renderer/src/battle/terrainFeatures";
import type { BattleVistaGrid } from "../../../packages/photoreal-renderer/src/battle/battleWorld";

const TICK_DT = 1 / 30;
const MAX_TICKS_PER_FRAME = 4;
const FRAME_SHOOT = 12;

type MissileExportGame = Game & {
  loosing_ptr(): number;
  projectile_z_ptr(): number;
  projectile_vx_ptr(): number;
  projectile_vy_ptr(): number;
  projectile_vz_ptr(): number;
};

const KITE_CLASS_IDS = [
  UNIT_CLASS_BY_KEY[UnitClass.Skirmishers],
  UNIT_CLASS_BY_KEY[UnitClass.HorseArchers],
] as number[];

const MISSILE_CLASS_IDS = [
  UNIT_CLASS_BY_KEY[UnitClass.Archers],
  UNIT_CLASS_BY_KEY[UnitClass.Skirmishers],
  UNIT_CLASS_BY_KEY[UnitClass.HorseArchers],
  UNIT_CLASS_BY_KEY[UnitClass.ArtilleryCrew],
] as number[];

const PHALANX_REST_RENDER_CLASS: Partial<Record<UnitClassKey, number>> = {
  [UnitClass.HeavyPhalanx]: HEAVY_PHALANX_REST_CLASS,
  [UnitClass.MediumPhalanx]: MEDIUM_PHALANX_REST_CLASS,
};

const PHALANX_SIDEARM_RENDER_CLASS: Partial<Record<UnitClassKey, number>> = {
  [UnitClass.HeavyPhalanx]: HEAVY_PHALANX_SIDEARM_CLASS,
  [UnitClass.MediumPhalanx]: MEDIUM_PHALANX_SIDEARM_CLASS,
};

function unitClassKey(classId: number): UnitClassKey | undefined {
  return UNIT_CLASS_KEY_BY_ID[classId | 0];
}

function renderClassFor(
  map: Partial<Record<UnitClassKey, number>>,
  classId: number,
): number | undefined {
  const key = unitClassKey(classId);
  return key === undefined ? undefined : map[key];
}

export type BattleKind = "duel" | "5v5" | "surround" | "flank" | "mapA" | "mapB" | "gen";

export interface GeneratedBattleMapDescriptor {
  seed: number | string;
  groundCover: BattleGroundCover;
  reliefScale: number;
  slopeBands: BattleSlopeBands;
  terrainHash: string;
  lakeSurfaces?: Array<{
    id: number;
    level: number;
    minCellX: number;
    minCellY: number;
    maxCellX: number;
    maxCellY: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cells: number;
  }>;
  vista?: {
    shape: string;
    bands: Array<{
      name: string;
      width: number;
      height: number;
      cell: number;
      originX: number;
      originY: number;
      innerHalfW: number;
      innerHalfH: number;
      outerHalfW: number;
      outerHalfH: number;
    }>;
  } | null;
}

type VistaExportGame = Game & {
  generated_vista_band_count(): number;
  generated_vista_band_width(band: number): number;
  generated_vista_band_height(band: number): number;
  generated_vista_band_cell(band: number): number;
  generated_vista_band_origin_x(band: number): number;
  generated_vista_band_origin_y(band: number): number;
  generated_vista_band_height_ptr(band: number): number;
};

function bannerScale(zoom: number, selected: boolean): number {
  const t = Math.max(0, Math.min(1, (zoom - 1.4) / 3.0));
  return (0.58 + t * 0.34) * (selected ? 1.08 : 1);
}

export interface BattleConfig {
  wasm: InitOutput;
  game: Game;
  kind: BattleKind;
  /** Back to the menu (Exit button). */
  onExit: () => void;
  /** Fresh battle of `kind` (Restart and the map/sandbox buttons). */
  onLaunch: (kind: BattleKind) => void;
  /** The catalog map index, when this battle is on a quick-battle map — drives
   *  the renderer's full-field ground cover. */
  wasmMapId?: number;
  generatedMap?: GeneratedBattleMapDescriptor;
  /** Re-run the exact setup on Restart (a custom battle re-launches its config
   *  instead of a default `kind`). */
  restart?: () => void;
  /** Campaign battles: no restart, "Main Menu" reads "Continue". */
  inCampaign?: boolean;
}

// One renderer for the page: GPU/device/atlas state is battle-independent;
// per-battle data arrives through setStatic/setTerrain.
let sharedRenderer: BattleRenderer | null = null;

export class BattleScene implements Scene {
  private cleanups: (() => void)[] = [];
  private frameFn: (now: number) => void = () => {};

  constructor(private cfg: BattleConfig) {}

  /** Restart: a custom battle re-launches its exact config; a default battle
   *  re-launches its map kind. */
  private restartBattle() {
    (this.cfg.restart ?? (() => this.cfg.onLaunch(this.cfg.kind)))();
  }

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
    const ui = document.getElementById("battle-ui")!;
    ui.style.display = "block";
    this.cleanups.push(() => {
      ui.style.display = "none";
    });
    // Gate the battle behind a minimum window size — the fixed-size card bar,
    // minimap, and toolbar need the room (see viewportGate.ts).
    this.cleanups.push(installViewportGate(document.getElementById("viewport-too-small")!));
    const ac = new AbortController();
    const signal = ac.signal;
    this.cleanups.push(() => ac.abort());

    // The whole HUD is one React tree (src/ui/hud/BattleHud.tsx). It is mounted
    // here — before the minimap/toolbar/card wiring below reads its handle — with
    // late-bound command thunks, since onToolbarCmd/onCardSelect are defined
    // further down (a user can't click before enter() finishes).
    let handleToolbarCmd: (cmd: string) => void = () => {};
    let handleCardSelect: (unit: number, additive: boolean) => void = () => {};
    const battleHud: BattleHudHandle = mountBattleHud(document.getElementById("battle-hud")!, {
      onToolbarCmd: (cmd) => handleToolbarCmd(cmd),
      onCardSelect: (unit, additive) => handleCardSelect(unit, additive),
    });
    this.cleanups.push(() => battleHud.destroy());

    const positions = () =>
      new Float32Array(wasm.memory.buffer, game.positions_ptr(), game.soldier_count() * 2);
    const facings = () =>
      new Float32Array(wasm.memory.buffer, game.facings_ptr(), game.soldier_count());
    const unitInfo = () =>
      new Float32Array(
        wasm.memory.buffer,
        game.unit_info_ptr(),
        game.unit_count() * game.unit_info_stride(),
      );

    const canvas = document.getElementById("battlefield") as HTMLCanvasElement;
    const camera = new Camera(canvas);
    const renderer = (sharedRenderer ??= new BattleRenderer(canvas));
    // The camera rides the terrain: look target + eye clearance sample the
    // same height field the renderer draws, so the soldier-eye zoom floor
    // stays above hills and WASD panning auto-raises.
    camera.groundHeight = (x, y) => renderer.heightAt(x, y);
    renderer.resize(); // the canvas may have been display:none through a window resize
    const STRIDE = game.unit_info_stride();
    let cameraRigBounds = { width: 1, height: 1 };
    let cameraRigRange: CameraRigRange = { min: 0.4, max: 8 };
    let mapCameraRigBounds = { width: 1, height: 1 };
    let mapCameraRigRange: CameraRigRange = { min: 0.4, max: 8 };
    let reviewFrameRestore: {
      rigBounds: { width: number; height: number };
      rigRange: CameraRigRange;
      zoom: number;
      pitchBias: number;
      yaw: number;
      center: [number, number];
    } | null = null;
    // Feed the real-camera zoom rig its live range + field bounds; the Camera
    // resolves distance/pitch/fovY (and applies the user's pitchBias) from zoom
    // itself, so this just keeps those inputs current as setup refines them.
    const applyBattleCameraRig = () => {
      camera.setRig(cameraRigRange, cameraRigBounds);
    };

    // Open framed to the ARMIES (bbox + margin), not the map: a two-unit
    // duel opens snug on the action; full deployments span the field and
    // fall back to the map framing.
    {
      const mapW = game.terrain_w() * game.terrain_cell();
      const mapH = game.terrain_h() * game.terrain_cell();
      const ox = game.terrain_origin_x();
      const oy = game.terrain_origin_y();
      camera.bounds = [ox, oy, ox + mapW, oy + mapH];
      cameraRigBounds = { width: mapW, height: mapH };
      const info = unitInfo();
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let u = 0; u < game.unit_count(); u++) {
        const o = u * STRIDE;
        x0 = Math.min(x0, info[o]);
        x1 = Math.max(x1, info[o]);
        y0 = Math.min(y0, info[o + 1]);
        y1 = Math.max(y1, info[o + 1]);
      }
      const dpr = window.devicePixelRatio || 1;
      const mapZoom = (canvas.clientHeight * dpr) / Math.min(mapH * 0.62, 1000);
      // Near-top-down (zoomed out) has almost no vertical foreshortening.
      const topDownCos = 0.95;
      const tacticalZoom = Math.min(
        (canvas.clientWidth * dpr) / mapW,
        (canvas.clientHeight * dpr) / topDownCos / mapH,
      );
      cameraRigRange = { min: Math.max(0.4, tacticalZoom), max: Math.max(8, tacticalZoom * 6) };
      mapCameraRigBounds = { ...cameraRigBounds };
      mapCameraRigRange = { ...cameraRigRange };
      const fit = Number.isFinite(x0)
        ? Math.min(
            (canvas.clientWidth * dpr) / (x1 - x0 + 130),
            (canvas.clientHeight * dpr) / (y1 - y0 + 130),
          )
        : 0;
      const initialCenter: [number, number] =
        fit > mapZoom ? [(x0 + x1) / 2, (y0 + y1) / 2] : [camera.x, -0.27 * mapH];
      if (fit > mapZoom) {
        // Small field (duels, sandboxes): open snug on the action.
        camera.zoom = Math.min(fit, 6);
      } else {
        // Full deployment: open behind your own line, framed to the map.
        camera.zoom = mapZoom;
      }
      camera.yaw = -Math.PI / 2;
      applyBattleCameraRig();
      camera.setViewCenter(initialCenter[0], initialCenter[1]);
      camera.clampView();
    }

    // Static-per-soldier arrays. Campaign battles can spawn reinforcement
    // units mid-fight, so this re-runs whenever the counts grow (pointers are
    // re-fetched every time — wasm memory may have moved).
    const applyStatic = () => {
      const soldierUnit = new Uint32Array(
        wasm.memory.buffer,
        game.soldier_unit_ptr(),
        game.soldier_count(),
      );
      const info = unitInfo();
      const teams = Array.from({ length: game.unit_count() }, (_, u) => info[u * STRIDE + 6]);
      const classes = Array.from({ length: game.unit_count() }, (_, u) => info[u * STRIDE + 13]);
      renderer.setStatic(soldierUnit, teams, classes);
    };
    applyStatic();
    let generatedVistaForDebug: BattleVistaGrid | null = null;
    {
      // Vista assembly FIRST: its one-time generation grows wasm memory and
      // detaches every existing view (the game-wasm pointer rule) - reading
      // it before the tint/height views keeps them valid.
      const vista = this.cfg.generatedMap
        ? readGeneratedVistaGrid(wasm, game, this.cfg.generatedMap)
        : null;
      const tw = game.terrain_w();
      const th = game.terrain_h();
      const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), tw * th);
      const height = new Float32Array(wasm.memory.buffer, game.terrain_height_ptr(), tw * th);
      const reliefScale = this.cfg.generatedMap?.reliefScale ?? BATTLE_RELIEF_EXAGGERATION;
      const heightForRenderer =
        reliefScale === BATTLE_RELIEF_EXAGGERATION
          ? new Float32Array(height)
          : scaleHeightForRenderer(height, reliefScale);
      const lakeSurfaces =
        this.cfg.generatedMap?.lakeSurfaces?.map((lake) => ({
          ...lake,
          level: lake.level * reliefScale,
        })) ?? null;
      generatedVistaForDebug = vista;
      renderer.setTerrain(
        tw,
        th,
        game.terrain_cell(),
        game.terrain_origin_x(),
        game.terrain_origin_y(),
        new Uint8Array(tint),
        heightForRenderer,
        this.cfg.wasmMapId,
        this.cfg.generatedMap?.slopeBands ?? null,
        vista,
        lakeSurfaces,
      );
    }

    // --- Minimap ---------------------------------------------------------------
    // React only DECLARES this <canvas> (inside <BattleHud>); scene.ts owns its
    // pixels. Same 240×160 element, drawn imperatively below.
    const minimap = battleHud.minimapCanvas;
    const miniBack = document.createElement("canvas");
    {
      const tw = game.terrain_w();
      const th = game.terrain_h();
      miniBack.width = minimap.width;
      miniBack.height = minimap.height;
      const g = miniBack.getContext("2d")!;
      const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), tw * th);
      const PAL = ["#5a6a40", "#2c455c", "#6f6c66", "#7a6c5b", "#37512c", "#56503c", "#6e6651"];
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
    const terrainTint = { water: 1, rock: 2, forest: 4, mud: 5, scree: 6 } as const;
    const terrainDebug = () => {
      const w = game.terrain_w();
      const h = game.terrain_h();
      const cell = game.terrain_cell();
      const ox = game.terrain_origin_x();
      const oy = game.terrain_origin_y();
      const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), w * h);
      const counts = Array.from({ length: 7 }, () => 0);
      const sums = Array.from({ length: 7 }, () => ({ x: 0, y: 0, n: 0 }));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const kind = tint[y * w + x] ?? 0;
          counts[kind] = (counts[kind] ?? 0) + 1;
          const sum = sums[kind];
          if (sum) {
            sum.x += x;
            sum.y += y;
            sum.n++;
          }
        }
      }
      const feature = (kind: number) => {
        const sum = sums[kind];
        if (!sum || sum.n === 0) return null;
        const x = ox + (sum.x / sum.n + 0.5) * cell;
        const y = oy + (sum.y / sum.n + 0.5) * cell;
        const [miniX, miniY] = worldToMini(x, y);
        return { kind, cells: sum.n, x, y, miniX, miniY };
      };
      return {
        w,
        h,
        cell,
        ox,
        oy,
        worldWidth: w * cell,
        worldHeight: h * cell,
        generatedMap: this.cfg.generatedMap ?? null,
        // Verdicts come from the ONE certificate owner (sim genmap::certify via
        // wasm) - the frontend never re-derives them from the speed field.
        certificates: this.cfg.generatedMap
          ? (JSON.parse(this.cfg.game.generated_map_certificates()) as Record<
              string,
              number | boolean
            >)
          : null,
        counts,
        features: {
          water: feature(terrainTint.water),
          rock: feature(terrainTint.rock),
          forest: feature(terrainTint.forest),
          mud: feature(terrainTint.mud),
          scree: feature(terrainTint.scree),
        },
      };
    };
    minimap.addEventListener(
      "mousedown",
      (e) => {
        const r = minimap.getBoundingClientRect();
        const fx = (e.clientX - r.left) / r.width;
        const fy = (e.clientY - r.top) / r.height;
        camera.setViewCenter(
          game.terrain_origin_x() + fx * game.terrain_w() * game.terrain_cell(),
          game.terrain_origin_y() + (1 - fy) * game.terrain_h() * game.terrain_cell(),
        );
        camera.clampView();
      },
      { signal },
    );
    function drawMinimap() {
      const g = minimap.getContext("2d")!;
      g.drawImage(miniBack, 0, 0);
      const info = unitInfo();
      for (let u = 0; u < game.unit_count(); u++) {
        const o = u * STRIDE;
        if (info[o + 15] === 0) continue;
        const [mx, my] = worldToMini(info[o], info[o + 1]);
        g.fillStyle = info[o + 21] > 0.5 ? "#888" : info[o + 6] === 0 ? "#6f9ae8" : "#e0604f";
        g.fillRect(mx - 1.5, my - 1.5, 3, 3);
      }
      const [ax, ay] = camera.screenToWorld(0, 0);
      const [bx, by] = camera.screenToWorld(canvas.width, canvas.height);
      const [m0x, m0y] = worldToMini(ax, ay);
      const [m1x, m1y] = worldToMini(bx, by);
      g.strokeStyle = "rgba(255,255,255,0.8)";
      g.lineWidth = 1;
      g.strokeRect(
        Math.min(m0x, m1x),
        Math.min(m0y, m1y),
        Math.abs(m1x - m0x),
        Math.abs(m1y - m0y),
      );
    }

    // --- Per-unit banners: standard + HP/cohesion bars + status chips ------------
    // Banners stay DOM-composited while the raw WebGPU path owns battlefield
    // pixels. The battle UI/compositor slice owns any future canvas standard.
    const labelsRoot = document.getElementById("unitlabels")!;
    const domBanners: UnitBanner[] = [];
    // Per-unit banner anchors are refreshed from the rendered soldiers each
    // frame. Unit-info center fields can lag during packed fights, so banners
    // follow the visible block instead of collapsing to the map center. The
    // block extremes are taken in the camera's ground-projected screen frame
    // (right/up axes), not world axes — world extremes only mean "top of the
    // block on screen" at the default north-up yaw, and drift under Q/E.
    let unitAnchorX = new Float32Array(0);
    let unitAnchorY = new Float32Array(0);
    let unitMinR = new Float32Array(0);
    let unitMaxR = new Float32Array(0);
    let unitTopU = new Float32Array(0);
    const addDomBanner = () => {
      const b = new UnitBanner();
      b.setVisible(false);
      labelsRoot.appendChild(b.el);
      domBanners.push(b);
    };
    for (let u = 0; u < game.unit_count(); u++) addDomBanner();
    let knownUnits = game.unit_count(); // last-seen count (campaign reinforcements grow it)
    this.cleanups.push(() => {
      labelsRoot.innerHTML = "";
    });

    // Translate a unit's sim row into status chips: explicit states first, then
    // the physical facts the press makes true.
    function unitChips(info: Float32Array, o: number): BannerChip[] {
      const chips: BannerChip[] = [];
      const cls2 = info[o + 13];
      const mode = info[o + 24];
      if (info[o + 21] > 0.5) chips.push({ text: "ROUT", kind: "bad" });
      else if (mode === 2) chips.push({ text: "DIS", title: "disengaging" });
      else if (mode === 1) chips.push({ text: "ATK", title: "attacking" });
      if (info[o + 18] === 2) chips.push({ text: "CHG!", kind: "hot", title: "charging" });
      if (info[o + 25] > 0.5) chips.push({ text: "PUR", title: "pursue: latch onto contact" });
      if (info[o + 26] > 0.5) chips.push({ text: "KITE", title: "kiting reflex on" });
      if (info[o + 3] < 0.3 && info[o + 16] > 0)
        chips.push({ text: "BRC", title: "braced: planted mass" });
      if (info[o + 8] < 0.35) chips.push({ text: "TIRED", kind: "bad", title: "winded" });
      if (info[o + 28] > 0.5) chips.push({ text: "SQZ", title: "squeezed into a corridor" });
      if (info[o + 27] > 0.5) chips.push({ text: "WAIT", title: "queued behind friends" });
      if (info[o + 29] > 0.55)
        chips.push({
          text: "CRUSH",
          kind: "bad",
          title: "crushed in the press: no room, evade dying",
        });
      if (MISSILE_CLASS_IDS.includes(cls2) && info[o + 19] === 0)
        chips.push({ text: "AMMO!", kind: "bad", title: "quivers empty" });
      if (info[o + 16] > 0)
        chips.push({ text: `⚔${info[o + 16]}`, kind: "hot", title: "men trading blows" });
      return chips;
    }

    function updateUnitBanners() {
      const info = unitInfo();
      const sel = input.selected.length > 0 ? input.selected[0] : -1;
      const n = game.unit_count();
      // DOM banners on an exact (pitch-free) projection.
      const showAll = camera.zoom > 1.1;
      for (let u = 0; u < n; u++) {
        const b = domBanners[u];
        const o = u * STRIDE;
        const alive = info[o + 15];
        if (alive === 0 || !showAll) {
          b.setVisible(false);
          continue;
        }
        const anchorX = unitAnchorX[u] > -Infinity ? unitAnchorX[u] : info[o];
        const anchorY = unitAnchorY[u] > -Infinity ? unitAnchorY[u] : info[o + 1];
        // Project at the rendered ground height — a z=0 anchor parallaxes away
        // from the soldiers on elevated terrain as the camera moves.
        const [sx, sy] = camera.worldToScreen(
          anchorX,
          anchorY,
          renderer.heightAt(anchorX, anchorY),
        );
        if (sx < -60 || sy < -40 || sx > window.innerWidth + 60 || sy > window.innerHeight + 40) {
          b.setVisible(false);
          continue;
        }
        const selected = u === sel;
        const mine = info[o + UNIT_INFO.team] === 0;
        b.setVisible(true);
        b.place(sx, sy, bannerScale(camera.zoom, selected));
        b.update({
          team: mine ? 0 : 1,
          mine,
          hp: alive / info[o + 7],
          cohesion: info[o + UNIT_INFO.cohesion],
          morale: info[o + UNIT_INFO.morale],
          stamina: info[o + UNIT_INFO.stamina],
          chips: unitChips(info, o),
          selected,
        });
      }
    }

    // --- Toolbar (React, inside <BattleHud>) --------------------------------------
    const onToolbarCmd = (cmd: string) => {
      const sel = input.selected;
      switch (cmd) {
        case "pace":
          sink.togglePace(sel);
          break;
        case "reform":
          sink.reform(sel);
          break;
        case "pursue":
          sink.togglePursue(sel);
          break;
        case "fire":
          sink.toggleFire(sel);
          break;
        case "kite":
          sink.toggleKite(sel);
          break;
        case "pause":
          paused = !paused;
          break;
        case "x1":
          paused = false;
          timeScale = 1;
          break;
        case "x3":
          paused = false;
          timeScale = 3;
          break;
        case "paths":
          showPaths = !showPaths;
          break;
      }
      updateToolbar();
    };
    handleToolbarCmd = onToolbarCmd;
    let lastToolbarSig = "";
    function updateToolbar() {
      const sel = myUnits(input.selected);
      const info = unitInfo();
      const o = sel.length ? sel[0] * STRIDE : -1;
      const classes = sel.map((u) => info[u * STRIDE + 13]);
      const supports = (allowed: number[]) => classes.some((c) => allowed.includes(c));
      const selEmpty = sel.length === 0;
      // Same command state the old imperative updateToolbar computed: .on per
      // order/time state, disabled unless a unit (and the right class) is selected.
      const state: Record<string, ToolButtonState> = {
        pace: { on: o >= 0 && info[o + 9] > 0.5, disabled: selEmpty },
        reform: { on: false, disabled: selEmpty },
        pursue: { on: o >= 0 && info[o + 25] > 0.5, disabled: selEmpty },
        fire: {
          on: o >= 0 && sel.length > 0 && fireOn,
          disabled: selEmpty || !supports(MISSILE_CLASS_IDS),
        },
        kite: { on: o >= 0 && info[o + 26] > 0.5, disabled: selEmpty || !supports(KITE_CLASS_IDS) },
        pause: { on: paused, disabled: false },
        x1: { on: !paused && timeScale === 1, disabled: false },
        x3: { on: !paused && timeScale === 3, disabled: false },
        paths: { on: showPaths, disabled: false },
      };
      const sig = JSON.stringify(state);
      if (sig === lastToolbarSig) return; // ≤5Hz; skip when nothing changed
      lastToolbarSig = sig;
      battleHud.setToolbar(state);
    }

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
    const gameover = document.getElementById("gameover")!;
    gameover.style.display = "none";
    const gameoverRoot = createRoot(gameover);
    this.cleanups.push(() => gameoverRoot.unmount());
    const renderGameover = (win: boolean, sub: string) =>
      flushSync(() =>
        gameoverRoot.render(
          createElement(GameOver, {
            inCampaign: this.cfg.inCampaign,
            win,
            sub,
            onRestart: () => this.restartBattle(),
            onExit: () => this.cfg.onExit(),
            onWatch: () => {
              gameover.style.display = "none";
            },
          }),
        ),
      );
    // Render hidden at setup so #gameover-menu exists — the campaign handoff
    // harness reads its label ("Continue") before any victory.
    renderGameover(true, "");
    const showGameover = (win: boolean, sub: string) => {
      renderGameover(win, sub);
      gameover.style.display = "flex";
    };
    // Game over: one side is dead or wholly routing. The sim keeps RUNNING —
    // routs are locked sim-side, so the pursuit plays out visibly behind the panel
    // instead of an abrupt freeze. Battle logic, so it runs from the frame loop,
    // not the HUD render path.
    const checkGameover = () => {
      const v = game.victor();
      if (v >= 0 && !ended) {
        ended = true;
        const win = v === 0;
        showGameover(
          win,
          win
            ? "The enemy army is broken. Your army holds the field."
            : "Your army is broken. The enemy holds the field.",
        );
      }
    };
    let timeScale = 1;
    let showPaths = false;
    let frozenEffects = false;
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "p") paused = !paused;
        if (e.key === "1") timeScale = 1;
        if (e.key === "3") timeScale = 3;
        if (e.key === " ") {
          showPaths = true;
          e.preventDefault();
        }
      },
      { signal },
    );
    window.addEventListener(
      "keyup",
      (e) => {
        if (e.key === " ") showPaths = false;
      },
      { signal },
    );

    // --- Orders ------------------------------------------------------------------
    const unitCenter = (u: number): [number, number] => {
      const info = unitInfo();
      const o = u * STRIDE;
      // anchor is front-center; offset half-depth back along facing
      const alive = info[o + 15];
      const cls = info[o + 13];
      const depth = (Math.ceil(alive / unitFiles(cls, alive)) || 1) * 1.1;
      return [
        info[o] - Math.cos(info[o + 2]) * depth * 0.5,
        info[o + 1] - Math.sin(info[o + 2]) * depth * 0.5,
      ];
    };

    const soldierStartOf = (u: number, info = unitInfo()) => {
      let start = 0;
      for (let k = 0; k < u; k++) start += Math.max(0, Math.floor(info[k * STRIDE + 7]));
      return start;
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
      const files = unitFiles(cls, alive);
      return { u, x: cx, y: cy, r: 0.5 * files * CLASS_SPACING[cls] };
    };

    // Order previews flash for a moment on every command (and persist on Space).
    const orderFlash = new Map<number, number>();
    const markFlash = (units: number[]) => {
      const t = performance.now();
      units.forEach((u) => orderFlash.set(u, t));
    };

    // Group move: clusters keep formation; far clusters combine at the target
    // as a compressed star. Facing = direction of travel.
    function groupMove(
      units: number[],
      x: number,
      y: number,
      kind: "move" | "disengage",
      facing?: number,
    ) {
      const sel = myUnits(units);
      if (sel.length === 0) return;
      const snaps = sel.map(unitSnap);
      let cx = 0,
        cy = 0;
      for (const s of snaps) {
        cx += s.x;
        cy += s.y;
      }
      cx /= snaps.length;
      cy /= snaps.length;
      const face = facing ?? Math.atan2(y - cy, x - cx);
      for (const d of groupMoveDests(snaps, x, y)) {
        if (kind === "disengage") game.set_disengage_order(d.u, d.x, d.y);
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
        let cx = 0,
          cy = 0;
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
          groupMove(sel, nx, ny, "move");
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
      orderPoint: (
        units: number[],
        x: number,
        y: number,
        shift: boolean,
        double: boolean,
        alt: boolean,
      ) => {
        // SHIFT = queue the order after what's underway; ALT = disengage.
        const sel = myUnits(units);
        if (sel.length === 0) return;
        const info = unitInfo();
        const targetUnit = game.pick_unit(x, y, 25);
        const isEnemy =
          targetUnit >= 0 &&
          info[targetUnit * STRIDE + 6] !== 0 &&
          info[targetUnit * STRIDE + 15] > 0;
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
          let cx = 0,
            cy = 0;
          for (const s of snaps) {
            cx += s.x;
            cy += s.y;
          }
          cx /= snaps.length;
          cy /= snaps.length;
          const face = Math.atan2(y - cy, x - cx);
          for (const d of groupMoveDests(snaps, x, y)) {
            game.enqueue(d.u, alt ? 2 : 0, d.x, d.y, face, alt ? 0 : 1);
          }
          markFlash(sel);
        } else {
          groupMove(sel, x, y, alt ? "disengage" : "move");
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
          groupMove(units, x, y, "move", facing);
        }
      },
      togglePace: (units: number[]) => {
        const sel = myUnits(units);
        const info = unitInfo();
        const anyWalk = sel.some((u) => info[u * STRIDE + 9] < 0.5);
        sel.forEach((u) => game.set_pace(u, anyWalk ? 1 : 0));
      },
      reform: (units: number[]) => myUnits(units).forEach((u) => game.set_reform(u)),
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
    const input = new Input(canvas, camera, sink, signal, applyBattleCameraRig);
    let pursueOn = false;
    let fireOn = true;
    updateToolbar(); // initial React paint now that paused/timeScale/showPaths/fireOn exist

    // --- Bottom unit-card strip: one card per player unit (Total War style) -------
    // The strip is React (spike verdict: MIGRATE — Δmedian/Δp95 ≈ 0), rendered
    // inside <BattleHud>; scene.ts drives structure (buildCards) + the 60Hz paint
    // (battleHud.cards.update) through the handle.
    let cardUnits: number[] = []; // sim unit id per card, in strip order
    const onCardSelect = (unit: number, additive: boolean) => {
      input.selected = additive ? Array.from(new Set([...input.selected, unit])) : [unit];
      // Centre the camera on the picked unit, like clicking its banner.
      const [cx, cy] = unitCenter(unit);
      camera.setViewCenter(cx, cy);
      camera.clampView();
    };
    handleCardSelect = onCardSelect;
    const buildCards = () => {
      const info = unitInfo();
      cardUnits = [];
      const inits = [];
      for (let u = 0; u < game.unit_count(); u++) {
        if (info[u * STRIDE + 6] !== 0) continue; // player units only
        cardUnits.push(u);
        inits.push({
          unit: u,
          cls: info[u * STRIDE + 13],
          look: info[u * STRIDE + UNIT_INFO.renderLook] ?? modelLookForUnit(info[u * STRIDE + 13]),
          team: 0 as const,
          name: CLASS_NAMES[info[u * STRIDE + 13]] ?? "?",
        });
      }
      battleHud.buildCards(inits);
    };
    buildCards();
    const updateCards = () => {
      const info = unitInfo();
      const sel = new Set(input.selected);
      battleHud.cards.update(
        cardUnits.map((u) => {
          const o = u * STRIDE;
          const alive = info[o + 15];
          if (alive === 0) return null;
          return {
            alive,
            total: info[o + 7],
            cohesion: info[o + 4],
            morale: info[o + 20],
            stamina: info[o + 8],
            routing: info[o + 21] > 0.5,
            selected: sel.has(u),
          };
        }),
      );
    };
    // S3 perf spike: ?measurecards records each frame's card-update self-time (ms)
    // into window.__cardUpdateSamples, so the perf harness compares the vanilla
    // vs React card bar on isolated update cost with the sim RUNNING. Off by
    // default — zero overhead on the shipping path.
    const measureCards = new URLSearchParams(location.search).has("measurecards");
    const cardUpdateSamples: number[] = [];
    if (measureCards)
      (window as unknown as { __cardUpdateSamples?: number[] }).__cardUpdateSamples =
        cardUpdateSamples;
    const tickCards = measureCards
      ? () => {
          const t = performance.now();
          updateCards();
          cardUpdateSamples.push(performance.now() - t);
        }
      : updateCards;

    // --- Tactical lines: ground decals plus transient effects ---------------------
    function tacticalLineFrame(withPaths: boolean): BattleTacticalLineFrame {
      const info = unitInfo();
      const n = game.unit_count();
      const groundCues: number[] = [];
      const rings: number[] = [];
      const effects: number[] = [];
      const showTransient = !frozen || withPaths || frozenEffects;
      for (let u = 0; u < n; u++) {
        const o = u * STRIDE;
        const [ax, ay, facing, team] = [info[o], info[o + 1], info[o + 2], info[o + 6]];
        // The player's cues share the selection-ring green (one style for
        // "mine"); the enemy's keep the red accent.
        const [r, g, b] = team === 0 ? SELECTION_GREEN : [1.0, 0.55, 0.45];
        if (withPaths) {
          const fx = Math.cos(facing);
          const fy = Math.sin(facing);
          groundCues.push(ax, ay, r, g, b, ax + fx * 4, ay + fy * 4, r, g, b);
          groundCues.push(ax - fy * 2, ay + fx * 2, r, g, b, ax + fy * 2, ay - fx * 2, r, g, b);
          if (info[o + 12] > 0.5) {
            groundCues.push(ax, ay, r, g, b, info[o + 10], info[o + 11], r, g, b);
          }
          // The SHIFT-queued chain BEHIND the active order: active dest -> q0 ->
          // q1 -> ... drawn dimmer than the live leg, a small diamond at each
          // waypoint. Only the player's units ever carry a queue, so this is a
          // no-op (empty array) for everyone else.
          const q = game.queued_orders(u);
          if (q.length >= 3) {
            let px = info[o + 12] > 0.5 ? info[o + 10] : ax;
            let py = info[o + 12] > 0.5 ? info[o + 11] : ay;
            const qr = r * 0.55,
              qg = g * 0.55,
              qb = b * 0.55;
            for (let j = 0; j + 2 < q.length; j += 3) {
              const qx = q[j],
                qy = q[j + 1];
              groundCues.push(px, py, qr, qg, qb, qx, qy, qr, qg, qb);
              const s = 2.5; // diamond waypoint marker
              groundCues.push(qx - s, qy, qr, qg, qb, qx, qy + s, qr, qg, qb);
              groundCues.push(qx, qy + s, qr, qg, qb, qx + s, qy, qr, qg, qb);
              groundCues.push(qx + s, qy, qr, qg, qb, qx, qy - s, qr, qg, qb);
              groundCues.push(qx, qy - s, qr, qg, qb, qx - s, qy, qr, qg, qb);
              px = qx;
              py = qy;
            }
          }
        }
        // Destination preview: the soldier-ring grid at the final formation
        // slots (flashes on every order; hold Space to keep them all visible).
        const age = performance.now() - (orderFlash.get(u) ?? -1e9);
        if (info[o + 12] > 0.5 && (withPaths || (showTransient && age < 2500))) {
          // Recent orders fade out; Space shows them at full strength.
          const k = withPaths ? 1 : Math.max(0, 1 - age / 2500);
          const cls = info[o + 13];
          const alive = info[o + 15];
          const files = unitFiles(cls, alive);
          const gf =
            info[o + 23] > 0.5 ? info[o + 22] : Math.atan2(info[o + 11] - ay, info[o + 10] - ax);
          pushDestRings(
            rings,
            info[o + 10],
            info[o + 11],
            gf,
            alive,
            files,
            CLASS_SPACING[cls],
            r * k,
            g * k,
            b * k,
          );
          groundCues.push(
            ax,
            ay,
            r * 0.8 * k,
            g * 0.8 * k,
            b * 0.8 * k,
            info[o + 10],
            info[o + 11],
            r * 0.8 * k,
            g * 0.8 * k,
            b * 0.8 * k,
          );
        }
        // Progress pie: WHITE = order transmitting down the line. A ground cue
        // (5-stride, draped on terrain) — the effects buffer is 6-stride with
        // per-vertex z, so pushing it there shears every later vertex.
        if (showTransient && info[o + 14] > 0)
          pushPie(groundCues, ax, ay, info[o + 14], 7, 1, 1, 1);
      }
      // Right-drag preview: where every man will stand, facing the cursor —
      // the soldier-ring grid in the selection green.
      if (input.rightDrag) {
        const sel = myUnits(input.selected);
        if (sel.length > 0) {
          const snaps = sel.map(unitSnap);
          for (const dst of groupMoveDests(snaps, input.rightDrag.x, input.rightDrag.y)) {
            const o = dst.u * STRIDE;
            const cls = info[o + 13];
            const alive = info[o + 15];
            pushDestRings(
              rings,
              dst.x,
              dst.y,
              input.rightDrag.facing,
              alive,
              unitFiles(cls, alive),
              CLASS_SPACING[cls],
              ...SELECTION_GREEN,
            );
          }
          // The arrow itself.
          const a = input.rightDrag;
          groundCues.push(
            a.x,
            a.y,
            ...SELECTION_GREEN,
            a.x + Math.cos(a.facing) * 14,
            a.y + Math.sin(a.facing) * 14,
            ...SELECTION_GREEN,
          );
        }
      }
      // Drag-move preview: the ring grid of every selected unit at the
      // dragged spot.
      if (input.dragDelta) {
        const [dx, dy] = input.dragDelta;
        for (const u of input.selected) {
          const o = u * STRIDE;
          const cls = info[o + 13];
          const alive = info[o + 15];
          if (alive === 0) continue;
          const [cx, cy] = unitCenter(u);
          pushDestRings(
            rings,
            cx + dx,
            cy + dy,
            info[o + 2],
            alive,
            unitFiles(cls, alive),
            CLASS_SPACING[cls],
            ...SELECTION_GREEN,
          );
        }
      }
      // Selection rings.
      if (input.selected.length > 0) {
        const pos = positions();
        const aliveSoldiers = new Uint8Array(
          wasm.memory.buffer,
          game.alive_ptr(),
          game.soldier_count(),
        );
        for (const u of input.selected) {
          const o = u * STRIDE;
          if (info[o + 15] === 0) continue;
          const start = soldierStartOf(u, info);
          const count = Math.max(0, Math.floor(info[o + 7]));
          const end = Math.min(start + count, aliveSoldiers.length);
          for (let i = start; i < end; i++) {
            if (aliveSoldiers[i] === 0) continue;
            const p = i * 2;
            rings.push(pos[p], pos[p + 1], SOLDIER_RING_RADIUS, ...SELECTION_GREEN);
          }
        }
      }
      // Projectiles.
      const pCount = showTransient ? game.projectile_count() : 0;
      if (pCount > 0) {
        const missileGame = game as MissileExportGame;
        const px = new Float32Array(wasm.memory.buffer, game.projectile_x_ptr(), pCount);
        const py = new Float32Array(wasm.memory.buffer, game.projectile_y_ptr(), pCount);
        const pz = new Float32Array(wasm.memory.buffer, missileGame.projectile_z_ptr(), pCount);
        const pvx = new Float32Array(wasm.memory.buffer, missileGame.projectile_vx_ptr(), pCount);
        const pvy = new Float32Array(wasm.memory.buffer, missileGame.projectile_vy_ptr(), pCount);
        const pvz = new Float32Array(wasm.memory.buffer, missileGame.projectile_vz_ptr(), pCount);
        const pk = new Uint8Array(wasm.memory.buffer, game.projectile_kind_ptr(), pCount);
        // Effects lines carry per-vertex z (see PhotorealLineLayer
        // perVertexZ): an arrow is a true 3D segment along its velocity —
        // no screen-space tricks (a ground-plane unproject snapped every
        // above-horizon endpoint to the view centre: the fan bug).
        const dpr = window.devicePixelRatio || 1;
        const minArrowWorld = (6 * dpr) / Math.max(4, camera.zoom); // ~6px floor
        for (let i = 0; i < pCount; i++) {
          const stone = pk[i] === 2;
          if (stone) {
            const len = 1.4;
            const c = 0.25;
            effects.push(
              px[i] - len,
              py[i],
              0.4,
              c,
              c,
              c * 0.9,
              px[i] + len,
              py[i],
              0.4,
              c,
              c,
              c * 0.9,
            );
            continue;
          }
          const speed = Math.hypot(pvx[i], pvy[i], pvz[i]) || 1;
          const half = Math.max(0.8, minArrowWorld / 2);
          const dx = (pvx[i] / speed) * half;
          const dy = (pvy[i] / speed) * half;
          const dz = (pvz[i] / speed) * half;
          const z0 = Math.max(0.05, pz[i] - dz);
          const z1 = Math.max(0.05, pz[i] + dz);
          // Dark shaft (arrows read dark in flight) doubled for weight, with
          // a pale fletching tip at the tail for direction.
          const sh = 0.16;
          effects.push(
            px[i] - dx,
            py[i] - dy,
            z0,
            sh,
            sh,
            sh * 0.9,
            px[i] + dx,
            py[i] + dy,
            z1,
            sh,
            sh,
            sh * 0.9,
          );
          effects.push(
            px[i] - dx,
            py[i] - dy,
            z0 + 0.06,
            sh,
            sh,
            sh * 0.9,
            px[i] + dx,
            py[i] + dy,
            z1 + 0.06,
            sh,
            sh,
            sh * 0.9,
          );
          effects.push(
            px[i] - dx * 0.7,
            py[i] - dy * 0.7,
            (z0 + z1) / 2 + 0.03,
            0.95,
            0.92,
            0.8,
            px[i] - dx,
            py[i] - dy,
            z0 + 0.03,
            0.95,
            0.92,
            0.8,
          );
        }
      }
      return {
        groundCues: new Float32Array(groundCues),
        rings: new Float32Array(rings),
        effects: new Float32Array(effects),
      };
    }

    // --- The one Menu button: restart or exit --------------------------------------
    document.getElementById("manual")!.innerHTML = MANUAL_HTML;
    document.getElementById("manual")!.style.display = "none";
    const pausemenu = document.getElementById("pausemenu")!;
    pausemenu.style.display = "none";
    const pausemenuRoot = createRoot(pausemenu);
    this.cleanups.push(() => pausemenuRoot.unmount());
    pausemenuRoot.render(
      createElement(PauseMenu, {
        inCampaign: this.cfg.inCampaign,
        onRestart: () => this.restartBattle(),
        onManual: () => {
          const el = document.getElementById("manual")!;
          el.style.display = el.style.display === "block" ? "none" : "block";
          pausemenu.style.display = "none";
        },
        onExit: () => this.cfg.onExit(),
        onClose: () => {
          pausemenu.style.display = "none";
        },
      }),
    );
    // #btn-menu (a top button) toggles the pause overlay; a backdrop click closes
    // it. React owns the .panel content; the container's display stays imperative.
    document.getElementById("btn-menu")!.addEventListener(
      "click",
      () => {
        pausemenu.style.display = pausemenu.style.display === "flex" ? "none" : "flex";
      },
      { signal },
    );
    pausemenu.addEventListener(
      "click",
      (e) => {
        if (e.target === pausemenu) pausemenu.style.display = "none";
      },
      { signal },
    );

    // --- Main loop -----------------------------------------------------------------
    type WeaponSpec = {
      name: string;
      reach: number;
      minRange: number;
      arc: number;
      interval: number;
      damage: number;
      braced: boolean;
      charge: boolean;
    };
    type ClassSpec = {
      id: number;
      key: UnitClassKey;
      name: string;
      cost: number;
      mass: number;
      radius: number;
      brace: number;
      block: number;
      evade: number;
      training: number;
      paceMult: number;
      drainMult: number;
      health: number;
      mountHealth: number;
      mounted: boolean;
      charges: boolean;
      weapons: WeaponSpec[];
      missile: {
        name: string;
        range: number;
        interval: number;
        ammo: number;
        damage: number;
        mobileFire: boolean;
      } | null;
    };
    const CLASS_SPECS: ClassSpec[] = JSON.parse(game.class_specs());
    validateClassSpecCatalog(CLASS_SPECS);
    // Index of each class's braced weapon (the pike), or -1. A man not holding
    // his braced weapon has stowed the pike upright — the renderer must not level
    // it (a flanked phalangite turned to his side-sword would otherwise swing the
    // 3D pike sideways: a porcupine).
    const classBracedIdx: number[] = CLASS_SPECS.map((c) => c.weapons.findIndex((w) => w.braced));
    // Index of each class's CHARGE weapon (the lance), or -1. A two-weapon
    // lancer holding anything but its lance has dropped to its sabre for the
    // grind, so the renderer shows the sidearm pseudo-class.
    const classChargeIdx: number[] = CLASS_SPECS.map((c) => c.weapons.findIndex((w) => w.charge));
    const banner = document.getElementById("banner")!;
    const selbox = document.getElementById("selbox")!;
    banner.style.display = "none";
    let aliveF32 = new Float32Array(0);
    let frames = new Float32Array(0);
    let renderClass = new Uint8Array(0);
    let renderFacings = new Float32Array(0); // per-soldier facing for the MESH (pikes ride the frontage)
    let renderPos = new Float32Array(0);
    let prevRenderPos = new Float32Array(0);
    let renderPosTick = -1;
    let accumulator = 0;
    let lastFrame = performance.now();
    let tickMsAvg = 0;
    let fpsAvg = 60;
    let hudTimer = 0;

    const frame = (now: number) => {
      const frameDt = Math.min((now - lastFrame) / 1000, 0.25);
      lastFrame = now;
      fpsAvg += (1 / Math.max(frameDt, 1e-4) - fpsAvg) * 0.05;

      // Pan in the view's rotated frame so W/S/A/D track the screen at any yaw.
      applyBattleCameraRig();
      camera.panWorld(input.panX * frameDt, input.panY * frameDt);

      accumulator += paused ? 0 : frameDt * timeScale;
      let ticks = 0;
      const maxTicks = MAX_TICKS_PER_FRAME * timeScale;
      while (accumulator >= TICK_DT && ticks < maxTicks) {
        accumulator -= TICK_DT;
        ticks++;
      }
      if (ticks > 0) {
        const t0 = performance.now();
        game.advance_ticks(ticks);
        simTick += ticks;
        tickMsAvg += ((performance.now() - t0) / ticks - tickMsAvg) * 0.1;
      }
      if (ticks === maxTicks) accumulator = 0;

      // Reinforcements: campaign battles grow units mid-fight.
      if (game.unit_count() > knownUnits) {
        knownUnits = game.unit_count();
        applyStatic();
        buildCards();
        while (domBanners.length < game.unit_count()) addDomBanner();
      }

      {
        const n = game.soldier_count();
        const a = new Uint8Array(wasm.memory.buffer, game.alive_ptr(), n);
        const fighting = new Uint8Array(wasm.memory.buffer, game.fighting_ptr(), n);
        const loosing = new Float32Array(
          wasm.memory.buffer,
          (game as MissileExportGame).loosing_ptr(),
          n,
        );
        const switchCd = new Float32Array(wasm.memory.buffer, game.switch_cd_ptr(), n);
        const sUnit = new Uint32Array(wasm.memory.buffer, game.soldier_unit_ptr(), n);
        const curWeapon = new Uint8Array(wasm.memory.buffer, game.cur_weapon_ptr(), n);
        const pos = positions();
        if (aliveF32.length !== n || simTick < renderPosTick) {
          aliveF32 = new Float32Array(n);
          frames = new Float32Array(n);
          renderClass = new Uint8Array(n);
          renderFacings = new Float32Array(n);
          renderPos = new Float32Array(pos);
          prevRenderPos = new Float32Array(pos);
          renderPosTick = simTick;
        }
        const renderTickDelta = Math.max(0, simTick - renderPosTick);
        const updateRenderPos = renderTickDelta > 0;
        if (updateRenderPos) prevRenderPos.set(renderPos);
        const rawFace = facings();
        // Which units are at ease: read directly from the sim so rendered pike
        // posture agrees with morale recovery and idle fidget.
        const info = unitInfo();
        const uc = game.unit_count();
        const atEase = new Uint8Array(uc);
        const running = new Uint8Array(uc);
        for (let u = 0; u < uc; u++) {
          const o = u * STRIDE;
          atEase[u] = info[o + 17] > 0.5 ? 1 : 0;
          running[u] = info[o + 9] > 0.5 ? 1 : 0;
        }
        if (unitTopU.length < uc) {
          unitAnchorX = new Float32Array(uc);
          unitAnchorY = new Float32Array(uc);
          unitMinR = new Float32Array(uc);
          unitMaxR = new Float32Array(uc);
          unitTopU = new Float32Array(uc);
        }
        unitAnchorX.fill(-Infinity, 0, uc);
        unitAnchorY.fill(-Infinity, 0, uc);
        unitMinR.fill(Infinity, 0, uc);
        unitMaxR.fill(-Infinity, 0, uc);
        unitTopU.fill(-Infinity, 0, uc);
        // Screen frame on the ground, from the camera (the one axis owner).
        const {
          right: [rAxisX, rAxisY],
          up: [uAxisX, uAxisY],
        } = camera.groundAxes();
        for (let i = 0; i < n; i++) {
          aliveF32[i] = a[i];
          const pi = 2 * i;
          if (frozen) {
            // Snapshot mode: draw the TRUE sim positions, no render smoothing —
            // a frozen frame must be deterministic and agree with picking and the
            // verify harness (which read the sim positions), not a lagged ease.
            renderPos[pi] = pos[pi];
            renderPos[pi + 1] = pos[pi + 1];
          } else if (a[i] && updateRenderPos) {
            const ex = pos[pi] - renderPos[pi];
            const ey = pos[pi + 1] - renderPos[pi + 1];
            const err2 = ex * ex + ey * ey;
            // Render-only smoothing: packed melee constraints can alternate a
            // soldier's solved centre by a few centimetres every tick. Combat
            // still reads the real positions; the mesh centre advances in sim
            // time, not rAF time, so display refresh and screenshot waits do
            // not change the picture. Large scripted advances catch up in one
            // frame because they are review jumps, not animation frames.
            const baseAlpha = err2 > 0.25 ? 0.75 : 0.28;
            const alpha = renderTickDelta > 12 ? 1 : 1 - Math.pow(1 - baseAlpha, renderTickDelta);
            renderPos[pi] += ex * alpha;
            renderPos[pi + 1] += ey * alpha;
          } else if (!a[i]) {
            renderPos[pi] = pos[pi];
            renderPos[pi + 1] = pos[pi + 1];
          }
          if (a[i]) {
            const u = sUnit[i];
            if (u < uc) {
              const wx = renderPos[pi];
              const wy = renderPos[pi + 1];
              const rP = wx * rAxisX + wy * rAxisY;
              const uP = wx * uAxisX + wy * uAxisY;
              if (uP > unitTopU[u]) unitTopU[u] = uP; // top of the block on screen
              if (rP < unitMinR[u]) unitMinR[u] = rP;
              if (rP > unitMaxR[u]) unitMaxR[u] = rP;
            }
          }
          if (!a[i]) {
            frames[i] = 4; // fallen
          } else if (switchCd[i] > 0) {
            frames[i] = 5; // fumbling the weapon swap
          } else if (loosing[i] > 0) {
            frames[i] = FRAME_SHOOT;
          } else if (fighting[i]) {
            // Trading blows: a thrust beat alternating with a guard, and ~1/3 of
            // the men on the off-beat flinching (a hit reaction) so a melee
            // reads as give-and-take, not synchronized stabbing.
            frames[i] = fightingFrameForTick(simTick, i);
          } else {
            const dx = updateRenderPos ? renderPos[pi] - prevRenderPos[pi] : 0;
            const dy = updateRenderPos ? renderPos[pi + 1] - prevRenderPos[pi + 1] : 0;
            if (dx * dx + dy * dy > 0.0004) {
              const beat = i & 1;
              frames[i] = running[sUnit[i]] ? 8 + beat : 1 + beat; // run vs march beats
            } else frames[i] = atEase[sUnit[i]] ? 6 : 0; // at ease (pikes up) or alert stand
          }
          // Render the weapon in hand, aimed EXACTLY as physics aims it (so the
          // picture never lies about who can hit whom). A braced pike is leveled
          // down the UNIT's frontage (combat's aim_facing for a braced weapon);
          // on the side-arm the pike is stowed UPRIGHT (frame 7) and he turns his
          // body to fight. This applies mid-swap too (cur_weapon holds the OLD
          // weapon while switch_cd runs) — otherwise a fumbling man would render
          // his old pike leveled along his turned facing: the sideways stragglers.
          renderFacings[i] = rawFace[i];
          renderClass[i] = info[sUnit[i] * STRIDE + 13];
          if (a[i]) {
            const cls = info[sUnit[i] * STRIDE + 13];
            const bi = classBracedIdx[cls];
            if (bi >= 0) {
              const restClass = renderClassFor(PHALANX_REST_RENDER_CLASS, cls);
              const sidearmClass = renderClassFor(PHALANX_SIDEARM_RENDER_CLASS, cls);
              if (curWeapon[i] === bi) {
                renderFacings[i] = info[sUnit[i] * STRIDE + 2]; // pike rides the frontage
                if (frames[i] === 6) {
                  renderClass[i] = restClass ?? renderClass[i];
                }
              } else {
                frames[i] = 7; // FRAME_STOW: sword in hand, pike snapped upright
                renderClass[i] = sidearmClass ?? renderClass[i];
              }
            }
            const ci = classChargeIdx[cls];
            if (ci >= 0 && curWeapon[i] !== ci) {
              renderClass[i] = SHOCK_CAV_SIDEARM_CLASS;
            }
          }
        }
        for (let u = 0; u < uc; u++) {
          // Anchor = screen-x midpoint of the block at its screen-top edge,
          // mapped back to world through the orthonormal (R, U) basis.
          if (unitMinR[u] < Infinity) {
            const midR = (unitMinR[u] + unitMaxR[u]) * 0.5;
            unitAnchorX[u] = rAxisX * midR + uAxisX * unitTopU[u];
            unitAnchorY[u] = rAxisY * midR + uAxisY * unitTopU[u];
          }
        }
        if (updateRenderPos) renderPosTick = simTick;
      }
      // Unit standards + state are a DOM component now (see UnitBanner).
      renderer.draw(
        renderPos,
        renderFacings,
        frames,
        aliveF32,
        game.soldier_count(),
        camera,
        renderClass,
        simTick,
      );
      // Attack arcs: every soldier mid-swing flashes his weapon's true envelope
      // (reach x arc) — readable combat, straight from the class table. The arc
      // tracks the weapon ACTUALLY in hand (pike vs side-sword) and, for a braced
      // pike, the UNIT's frontage — never the man's own facing — so a flanked
      // phalanx shows side-swords, not a porcupine of sideways pikes.
      if (!frozen && camera.zoom > 2.5) {
        const tris: number[] = [];
        const pos = positions();
        const face = facings();
        const curWeapon = new Uint8Array(
          wasm.memory.buffer,
          game.cur_weapon_ptr(),
          game.soldier_count(),
        );
        const soldierUnit = new Uint32Array(
          wasm.memory.buffer,
          game.soldier_unit_ptr(),
          game.soldier_count(),
        );
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
              x,
              y,
              r,
              g,
              b,
              a,
              x + Math.cos(a0) * R,
              y + Math.sin(a0) * R,
              r,
              g,
              b,
              0.04,
              x + Math.cos(a1) * R,
              y + Math.sin(a1) * R,
              r,
              g,
              b,
              0.04,
            );
          }
          budget--;
        }
        if (tris.length) renderer.drawTris(new Float32Array(tris), camera);
      }
      renderer.drawTacticalLines(tacticalLineFrame(showPaths), camera);

      // DOM selection rectangle.
      if (input.box) {
        selbox.style.display = "block";
        selbox.style.left = Math.min(input.box.x0, input.box.x1) + "px";
        selbox.style.top = Math.min(input.box.y0, input.box.y1) + "px";
        selbox.style.width = Math.abs(input.box.x1 - input.box.x0) + "px";
        selbox.style.height = Math.abs(input.box.y1 - input.box.y0) + "px";
      } else {
        selbox.style.display = "none";
      }

      updateUnitBanners();
      tickCards();
      hudTimer += frameDt;
      if (hudTimer > 0.2) {
        hudTimer = 0;
        tickGroupAttacks();
        updateHud();
        checkGameover();
        updateToolbar();
        drawMinimap();
      }
    };

    function updateHud() {
      // Bare dev telemetry, not part of the diegetic card: "—" when frozen so
      // snapshots are deterministic (the sim clock is stopped).
      battleHud.setFps(frozen ? "fps —" : `fps ${fpsAvg.toFixed(0)}`);
      let unit: HudUnit | undefined;
      let cardUnit = -1;
      // One unit selected (or hovered) → its detail; otherwise the army summary.
      if (input.selected.length === 1) {
        cardUnit = input.selected[0];
      } else if (input.selected.length === 0 && input.mouseCss[0] >= 0) {
        const dpr = window.devicePixelRatio || 1;
        const [wx, wy] = camera.screenToWorld(input.mouseCss[0] * dpr, input.mouseCss[1] * dpr);
        cardUnit = game.pick_unit(wx, wy, 25); // hover: either side
      }
      if (cardUnit >= 0) {
        const info = unitInfo();
        const o = cardUnit * STRIDE;
        const cohesion = info[o + 4];
        const fatigue = info[o + 8];
        const pace = info[o + 9] > 0.5 ? "run" : "walk";
        const clsId = info[o + 13];
        const cls = CLASS_NAMES[clsId] ?? "?";
        const side = info[o + 6] === 0 ? "YOUR" : "ENEMY";
        const alive = info[o + 15],
          total = info[o + 7];
        const hpFrac = total > 0 ? alive / total : 0;
        const charge = info[o + 18] === 2 ? " · CHARGING" : "";
        const ammo = info[o + 19] > 0 ? ` · ammo ${info[o + 19]}` : "";
        const routing = info[o + 21] > 0.5 ? " · ROUTING" : "";
        const engaged = info[o + 16] > 0 ? ` · engaged ${info[o + 16]}` : "";
        const thumb = cardThumbUrl(modelLookForClass(clsId));
        const detail: string[] = [];
        const spec = CLASS_SPECS[clsId];
        if (spec) {
          const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
          detail.push(
            `cost ${spec.cost} gold  ` +
              `mass ${spec.mass.toFixed(1)}${spec.brace > 1 ? ` (brace x${spec.brace.toFixed(1)})` : ""}  ` +
              `block ${pct(spec.block)}  evade ${pct(spec.evade)}  train ${pct(spec.training)}`,
            `pace x${spec.paceMult.toFixed(2)}  stamina drain x${spec.drainMult.toFixed(2)}  hp ${spec.health.toFixed(1)}` +
              (spec.mounted ? ` + mount ${spec.mountHealth.toFixed(1)}` : "") +
              (spec.charges ? "  charges" : ""),
          );
          for (const w of spec.weapons) {
            const deg = ((w.arc * 180) / Math.PI / 2).toFixed(0);
            // Leading indent is a real non-breaking space (was the &nbsp; entity).
            detail.push(
              ` ${w.name}: ${w.reach.toFixed(1)}m ±${deg}°  ` +
                `dmg ${w.damage.toFixed(2)} / ${w.interval.toFixed(1)}s` +
                (w.minRange > 0 ? `  (dead <${w.minRange.toFixed(1)}m)` : ""),
            );
          }
          if (spec.missile) {
            const m = spec.missile;
            detail.push(
              ` ${m.name}: ${m.range.toFixed(0)}m  dmg ${m.damage.toFixed(2)} / ${m.interval.toFixed(0)}s  ` +
                `ammo ${m.ammo}${m.mobileFire ? "  fires mounted" : ""}`,
            );
          }
        }
        const hpColor = hpFrac > 0.5 ? "#5cba46" : hpFrac > 0.25 ? "#d6b13a" : "#cf4a3a";
        const meta = `${side} · ${alive}/${total} men · ${pace}${charge}${routing}${engaged}${ammo}`;
        unit = {
          thumb: thumb || undefined,
          cls,
          meta,
          hpFrac,
          hpColor,
          cohesion,
          fatigue,
          morale: info[o + 20],
          detail,
        };
      }
      // No single unit in focus → army-wide summary so the card is never empty.
      const roster = unit ? undefined : armySummary(unitInfo(), game.unit_count(), STRIDE);
      const data: HudData = { unit, roster };
      battleHud.setInfo(data);
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
      if (!on) frozenEffects = false;
      renderer.fixedTime = on ? 0 : null;
      renderer.preserveFrozenEffects = on && frozenEffects;
    };
    const freezeAtTick = (target: number, options: { effects?: boolean } = {}) => {
      frozenEffects = options.effects === true;
      doFreeze(true);
      const n = target - simTick;
      if (n > 0) {
        game.advance_ticks(n);
        simTick += n;
      }
      tickGroupAttacks();
      return renderer.settlePresentedFrame();
    };
    const reviewFrame = (
      minx: number,
      miny: number,
      maxx: number,
      maxy: number,
      opts: { margin?: number; pitch?: number; fill?: number } = {},
    ) => {
      if (![minx, miny, maxx, maxy].every(Number.isFinite)) return;
      if (!reviewFrameRestore) {
        reviewFrameRestore = {
          rigBounds: { ...cameraRigBounds },
          rigRange: { ...cameraRigRange },
          zoom: camera.zoom,
          pitchBias: camera.pitchBias,
          yaw: camera.yaw,
          center: camera.viewCenter(),
        };
      }
      // Review shots are north-up (world +Y to the top of frame — blue south
      // unit at the bottom, red north unit on top). camera3d yaw 0 puts +Y to
      // screen-right; -PI/2 is the chart-style north-up bearing.
      camera.yaw = -Math.PI / 2;
      const loX = Math.min(minx, maxx);
      const hiX = Math.max(minx, maxx);
      const loY = Math.min(miny, maxy);
      const hiY = Math.max(miny, maxy);
      const margin = Math.max(0, opts.margin ?? 12);
      const halfMargin = margin / 2;
      const fitMinX = loX - halfMargin;
      const fitMaxX = hiX + halfMargin;
      const fitMinY = loY - halfMargin;
      const fitMaxY = hiY + halfMargin;
      const cx = (loX + hiX) / 2;
      const cy = (loY + hiY) / 2;
      let spanX = Math.max(1, fitMaxX - fitMinX);
      let spanY = Math.max(1, fitMaxY - fitMinY);
      const targetFill = Math.max(0.01, opts.fill ?? 0.72);
      const setReviewRig = () => {
        cameraRigRange = { min: 2.5, max: 20 };
        cameraRigBounds = { width: spanX, height: spanY };
        applyBattleCameraRig();
        // Pin the TOP-DOWN rig endpoint (zoomT = 0): its distance is
        // map-relative (fieldReach * distOutFactor) with no absolute cap, so
        // the fill convergence below can scale the synthetic bounds freely.
        // (Pinning zoomT = 1 broke when the close endpoint gained the 10m
        // absolute cap for soldier-eye zoom — review shots filmed as giant
        // close-ups.) Rig pitch at this endpoint is topDownPitch = 1.35.
        camera.zoom = 2.5;
        camera.pitchBias = 1.35 - (opts.pitch ?? 1.15);
        camera.setViewCenter(cx, cy);
      };
      const samplePoints: [number, number][] = [
        [fitMinX, fitMinY],
        [fitMaxX, fitMinY],
        [fitMaxX, fitMaxY],
        [fitMinX, fitMaxY],
        [cx, fitMinY],
        [fitMaxX, cy],
        [cx, fitMaxY],
        [fitMinX, cy],
      ];
      setReviewRig();
      const clientWidth = Math.max(
        1,
        canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1),
      );
      const clientHeight = Math.max(
        1,
        canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1),
      );
      for (let i = 0; i < 3; i++) {
        const projected = samplePoints.map(([x, y]) => camera.worldToScreen(x, y));
        const xs = projected.map((p) => p[0]);
        const ys = projected.map((p) => p[1]);
        const screenSpanX = Math.max(...xs) - Math.min(...xs);
        const screenSpanY = Math.max(...ys) - Math.min(...ys);
        const fill = Math.max(screenSpanX / clientWidth, screenSpanY / clientHeight);
        if (!Number.isFinite(fill) || fill <= 0) break;
        const scale = fill / targetFill;
        if (Math.abs(scale - 1) <= 0.05) break;
        spanX *= scale;
        spanY *= scale;
        setReviewRig();
      }
    };
    const reviewFrameClear = () => {
      const restored = reviewFrameRestore;
      cameraRigBounds = restored ? { ...restored.rigBounds } : { ...mapCameraRigBounds };
      cameraRigRange = restored ? { ...restored.rigRange } : { ...mapCameraRigRange };
      applyBattleCameraRig();
      if (restored) {
        camera.zoom = restored.zoom;
        camera.pitchBias = restored.pitchBias;
        camera.yaw = restored.yaw;
        camera.setViewCenter(restored.center[0], restored.center[1]);
      }
      reviewFrameRestore = null;
    };
    window.__game = {
      stats: () => ({
        soldiers: game.soldier_count(),
        units: game.unit_count(),
        tickMs: tickMsAvg,
        fps: fpsAvg,
        victor: game.victor(),
        renderer: "gpu",
        renderStats: renderer.stats(),
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
      attackOrder: (u: number, enemy: number) => game.set_attack_order(u, enemy),
      attackMove: (u: number, x: number, y: number) => game.set_attack_move_order(u, x, y),
      disengage: (u: number, x: number, y: number) => game.set_disengage_order(u, x, y),
      // SHIFT-queue a follow-up order and read the queue back — lets the verify
      // harness exercise the queued-path (hold-Space) overlay end to end.
      enqueue: (u: number, mode: number, x: number, y: number, facing: number, hasFacing: number) =>
        game.enqueue(u, mode, x, y, facing, hasFacing),
      queuedOrders: (u: number) => Array.from(game.queued_orders(u)),
      terrainDebug,
      advance: (n: number) => {
        game.advance_ticks(n);
        simTick += n;
        tickGroupAttacks();
      },
      projectileCount: () => game.projectile_count(),
      // Absolute ticks driven so far — the harness pins a snapshot to a fixed
      // tick so the idle fidget sway can't jitter the pixels run-to-run.
      tickCount: () => simTick,
      // Freeze, then drive the sim to an exact absolute tick (advancing only
      // forward). Gives a byte-stable deployment snapshot regardless of how many
      // real-time ticks happened to elapse before the call.
      freezeAtTick,
      freezeAtTickWithEffects: (target: number) => freezeAtTick(target, { effects: true }),
      freeze: (on = true) => doFreeze(on),
      reviewFrame,
      reviewFrameClear,
      groupMove: (units: number[], x: number, y: number) => groupMove(units, x, y, "move"),
      setFiles: (u: number, files: number) => game.set_files(u, files),
      // Spawn an arbitrary unit (vibe scenarios: multi-column penetration, etc.).
      // Raw spawn — light-infantry stats; enough to exercise FORMATION behaviour.
      spawnUnit: (
        x: number,
        y: number,
        facing: number,
        count: number,
        files: number,
        team: number,
      ) => game.spawn_unit(x, y, facing, count, files, 1.0, 1.2, team, 0.7),
      // Spawn a real class unit for vibe scenarios that are tied to Rust
      // mechanics/balance contracts rather than raw formation probes.
      spawnClass: (
        x: number,
        y: number,
        facing: number,
        count: number,
        files: number,
        cls: number,
        team: number,
      ) => game.spawn_class(x, y, facing, count, files, cls, team),
      groupAttack: (units: number[], target: number) => {
        groupAttacks.push({ units, target, lastTx: 1e9, lastTy: 1e9 });
        tickGroupAttacks();
      },
      unitInfo: (u: number) => Array.from(unitInfo().slice(u * STRIDE, u * STRIDE + STRIDE)),
      soldierStartOf: (u: number) => {
        return soldierStartOf(u);
      },
      soldierPos: (i: number) => {
        const p = positions();
        return [p[2 * i], p[2 * i + 1]];
      },
      soldierAlive: (i: number) => {
        const a = new Uint8Array(wasm.memory.buffer, game.alive_ptr(), game.soldier_count());
        return a[i] ?? 0;
      },
      // The renderer's canonical terrain surface — lets the harness project
      // world anchors (banners, soldiers) at their true rendered height.
      heightAt: (x: number, y: number) => renderer.heightAt(x, y),
      vistaHeightAt: (x: number, y: number) =>
        generatedVistaForDebug ? vistaHeightAt(generatedVistaForDebug, x, y) : null,
      setCamera: (x: number, y: number, zoom: number, yaw = camera.yaw, pitch = camera.pitch) => {
        camera.setViewCenter(x, y);
        camera.zoom = zoom;
        camera.yaw = yaw;
        camera.pitchBias = 1.35 - pitch;
        camera.clampView();
      },
    };
    window.__cam = camera;
    void renderer.ready
      .then(() => {
        window.__ready = true;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        showFatalErrorSurface(canvas, fatalSurfaceFor("init", message));
      });
  }
}

function vistaHeightAt(vista: BattleVistaGrid, x: number, y: number): number | null {
  const band = vista.bands.find(
    (b) => Math.abs(x) <= b.outerHalfW + b.cell && Math.abs(y) <= b.outerHalfH + b.cell,
  );
  if (!band) return null;
  const gx = clamp((x - band.ox) / band.cell, 0, band.w - 1);
  const gy = clamp((y - band.oy) / band.cell, 0, band.h - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, band.w - 1);
  const y1 = Math.min(y0 + 1, band.h - 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const top = lerp(band.height[y0 * band.w + x0], band.height[y0 * band.w + x1], tx);
  const bot = lerp(band.height[y1 * band.w + x0], band.height[y1 * band.w + x1], tx);
  return lerp(top, bot, ty);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

declare global {
  interface Window {
    __game: unknown;
    __cam: unknown;
    __ready: boolean;
  }
}

function scaleHeightForRenderer(height: Float32Array, reliefScale: number): Float32Array {
  const out = new Float32Array(height.length);
  const scale = reliefScale / BATTLE_RELIEF_EXAGGERATION;
  for (let i = 0; i < height.length; i++) out[i] = height[i] * scale;
  return out;
}

function readGeneratedVistaGrid(
  wasm: InitOutput,
  game: Game,
  descriptor: GeneratedBattleMapDescriptor,
): BattleVistaGrid | null {
  const vista = descriptor.vista;
  if (!vista?.bands?.length) return null;
  const g = game as VistaExportGame;
  const count = Math.min(g.generated_vista_band_count(), vista.bands.length);
  const bands: BattleVistaGrid["bands"] = [];
  for (let i = 0; i < count; i++) {
    const meta = vista.bands[i];
    const w = g.generated_vista_band_width(i);
    const h = g.generated_vista_band_height(i);
    const cell = g.generated_vista_band_cell(i);
    const ox = g.generated_vista_band_origin_x(i);
    const oy = g.generated_vista_band_origin_y(i);
    // The height ptr call may (re)generate the band and grow wasm memory,
    // detaching every earlier view - fetch it LAST and copy immediately,
    // with no wasm calls in between (the game-wasm pointer rule).
    const ptr = g.generated_vista_band_height_ptr(i);
    if (!meta || w <= 0 || h <= 0 || ptr === 0) continue;
    const height = new Float32Array(new Float32Array(wasm.memory.buffer, ptr, w * h));
    bands.push({
      name: meta.name,
      w,
      h,
      cell,
      ox,
      oy,
      innerHalfW: meta.innerHalfW,
      innerHalfH: meta.innerHalfH,
      outerHalfW: meta.outerHalfW,
      outerHalfH: meta.outerHalfH,
      height,
    });
  }
  return bands.length > 0 ? { shape: vista.shape, bands } : null;
}
