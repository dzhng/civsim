// The campaign scene: EU4-style pausable real time over the ancient world.
// Owns its canvas + DOM (created on first enter, so the battle UI stays
// untouched), reads zero-copy army/city arrays from wasm each frame, and
// hands Pending battles to the battle scene (or auto-resolves them).

import {
  Campaign,
  Game,
  start_campaign_battle,
  report_battle,
  type InitOutput,
} from "../wasm/game_wasm.js";
import type { Scene } from "../scene";
import { type EncounterSideView } from "../ui/campaign/CampaignBattleModal";
import { mountCampaignHud, type CampaignHudHandle } from "../ui/campaign/CampaignHud";
import { nearestLoc, tilePos, type CampaignData } from "./data";
import type { CamView } from "./camera";
import {
  rectsOverlap,
  type ScreenRect,
} from "../../../packages/game-renderer/src/campaign/mapPass";
import {
  CAMPAIGN_FULL_TILT_ZOOM,
  CampaignRenderer,
  MAX_CAMPAIGN_ZOOM,
  type CampaignCardRect,
} from "./renderer";
import { TerrainField } from "./terrain";
import { Territory } from "./territory";
import { Allegiance } from "./status";
import type { MapCardModel, MapCardPosition } from "../ui/campaign/MapCards";
import { installCampaignDebugApi, markCampaignReady } from "./debugApi";
import { fatalSurfaceFor, showFatalErrorSurface } from "../shared/fatalError";
import { getGraphicsSettings } from "../shared/graphicsSettings";
import {
  campaignDomHtml,
  type ArmyRosterRow,
  type ClassDoctrineRow,
  type CityDetail,
  type DiplomacyAction,
  type DiplomacyRow,
} from "./panels";
import { readCampaignViews, type ArmyView, type CityView } from "./views";

/** Campaign ticks per real second at base speed. A tick covers
 * MINUTES_PER_TICK game-minutes (campaign tunables), so at 10 min/tick the base
 * already runs ~10 game-hours per real second — the old top speed. The world is
 * tick-driven (movement, economy, AI), so fast-forward stays in lockstep while
 * the AI cost per real-second tracks the multiplier, not the tick scale. */
const TICKS_PER_SEC = 60;
const SPEEDS = [1, 2, 4];
const SPEED_LABELS = ["1x", "3x", "10x"];
const SAVE_KEY = "campaign-save";
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
  private ui!: HTMLDivElement;
  private campaignHud: CampaignHudHandle | null = null;
  private lastTopBarKey = "";
  private renderer!: CampaignRenderer;
  // Terrain/territory live across battle round-trips (enter/exit cycles).
  private field: TerrainField | null = null;
  private territory: Territory | null = null;
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
   *  or relations change; drives map status treatment and non-icon tints. */
  private factionStatus = new Int8Array(0);
  /** Faction (political) view: territories flooded with owner colours + names.
   *  Off = the natural map (terrain only, neutral city dots). */
  private factionView = true;
  /** Fog of war: the player sees only their own cities/armies and the ground
   *  around them; everything else is dark under drifting cloud. Defaults off so
   *  the campaign opens on the full parchment atlas; toggle (F) for gameplay. */
  private fogOfWar = false;
  private diploOpen = false;
  private diploJson = "";
  private classBuilderOpen = false;
  private classBuilderJson = "";
  private classDraft = new Map<number, { unit: number; size: number }>();
  private armies: ArmyView[] = [];
  private cities = new Map<number, CityView>();
  private stackUnitCap = 1;
  private recruitClasses: string[] = [];
  private spotPos: [number, number][] = [];
  private modalOpen = false;
  private autoResolving = false;
  private terrainReady = false;
  /** Signature of the currently-shown siege notifications, to avoid rebuilding
   *  the DOM (and its click handlers) every tick. */
  private siegeSig = "";
  private mapCardsSig = "";
  /** Last measured size per card id. measureMapCards() only sees displayed
   *  nodes, so a card the collision pass hid would otherwise lose its size and
   *  flicker back in unarbitrated next frame; the cache keeps it a contender.
   *  Cleared when the card set/content changes (sizes follow content). */
  private cardSizeCache = new Map<string, { w: number; h: number }>();

  /** Held camera keys + last cursor position (CSS px; -1 = mouse never seen,
   *  edge-pan stays off) — the battle input contract, applied per frame. */
  private heldKeys = new Set<string>();
  private edgeMouse: [number, number] = [-1, -1];

  constructor(private cfg: CampaignConfig) {
    this.cam = { x: 0, y: 0, scale: 0.18 };
  }

  enter() {
    // Warm the map font (Cinzel) so the canvas labels engrave from the first
    // frames rather than flashing the serif fallback.
    void document.fonts.load("700 40px Cinzel");
    void document.fonts.load("600 14px Cinzel");
    if (!document.getElementById("campaign-canvas")) this.buildDom();
    this.canvas = document.getElementById("campaign-canvas") as HTMLCanvasElement;
    this.ui = document.getElementById("campaign-ui") as HTMLDivElement;
    this.canvas.style.display = "block";
    this.ui.style.display = "block";
    if (this.spotPos.length === 0) {
      this.spotPos = this.cfg.data.map.ambush_spots.map((sp) =>
        tilePos(this.cfg.data.map.edges[sp.edge], sp.tile),
      );
    }
    if (!this.field) {
      this.field = new TerrainField(this.cfg.data);
      this.territory = new Territory(this.cfg.data, this.field);
    }
    this.terrainReady = false;
    this.renderer = new CampaignRenderer(this.canvas, this.cfg.data, this.field!, this.territory!, {
      graphics: getGraphicsSettings(),
    });
    void this.renderer.ready
      .then(() => {
        this.terrainReady = true;
        markCampaignReady(true);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        showFatalErrorSurface(this.canvas, fatalSurfaceFor("init", message));
      });
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
      fightReady: () => {
        const eid = this.cfg.campaign.battle_ready();
        if (eid < 0) return false;
        this.fight(eid);
        return true;
      },
      derivedSiteSeed: (kind: number, a: number, b: number) =>
        this.cfg.campaign.derived_site_seed(kind, a, b),
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
        this.renderTopBar();
        return this.factionView;
      },
      /** Test/verify hook: flip gameplay fog of war on or off (off = reveal). */
      fogOfWar: (on?: boolean) => {
        this.fogOfWar = on ?? !this.fogOfWar;
        this.renderTopBar();
        return this.fogOfWar;
      },
      /** world km -> CSS px (for synthetic mouse events) */
      project: (wx: number, wy: number) => {
        const p = this.renderer.toScreen(wx, wy);
        return [p[0] / devicePixelRatio, p[1] / devicePixelRatio];
      },
      /** CSS px -> world km through the one renderer projection owner. */
      screenToWorld: (sx: number, sy: number) =>
        this.renderer.toWorld(sx * devicePixelRatio, sy * devicePixelRatio),
      cam: (x: number, y: number, scale: number) => {
        this.cam = { x, y, scale };
        this.clampCam();
        this.drawWorld();
      },
      camGet: () => ({
        ...this.cam,
        pitchDeg: (this.renderer.pitchForScale(this.cam.scale) * 180) / Math.PI,
      }),
      territoryAlpha: () => this.renderer.territoryAlpha(this.cam.scale),
      /** Fog-of-war probe: player visibility (0..1) at a world point. */
      visAt: (x: number, y: number) => this.renderer.visibleAt(x, y),
      cellInfo: (x: number, y: number) => this.territory!.infoAt(x, y, this.cities),
      terrainAt: (x: number, y: number) => ({
        land: this.field!.landAt(x, y),
        height: this.field!.heightAt(x, y),
      }),
      renderLandAt: (x: number, y: number, marginKm = 0) =>
        this.field!.renderLandAt(x, y, marginKm),
      sceneryCandidates: () => this.renderer.sceneryCandidateSnapshot(),
      /** Snapshot mode: pin the water clock (campaign is already paused). */
      freeze: (on = true) => {
        this.renderer.fixedTime = on ? 0 : null;
      },
      terrStats: () => {
        const t = this.territory!;
        let filled = 0;
        for (let i = 3; i < t.rgba.length; i += 4) if (t.rgba[i] > 0) filled++;
        return { filled, total: t.rgba.length / 4, labels: t.labels };
      },
    });
    markCampaignReady(false);
  }

  /** Spin up the off-thread AI: a worker computes commander decisions on posted
   *  snapshots, which the host applies on a fixed delay. The AI never runs in
   *  the tick loop, so this is the sole driver. */
  private startAiWorker() {
    const worker = new Worker(new URL("./ai-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ applyAt: number; json: string }>) => {
      this.cfg.campaign.submit_decisions_json(e.data.applyAt, e.data.json);
    };
    worker.postMessage({ type: "init", mapJson: this.cfg.mapJson });
    this.aiWorker = worker;
  }

  exit() {
    markCampaignReady(false);
    this.aiWorker?.terminate();
    this.aiWorker = null;
    this.ac?.abort();
    this.ac = null;
    this.renderer?.destroy();
    this.canvas.style.display = "none";
    this.ui.style.display = "none";
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
        this.aiWorker?.postMessage({
          type: "snapshot",
          applyAt: step.tick + AI_LATENCY,
          snap: c.save(),
        });
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
    this.applyCameraKeys(dt);

    if (!this.paused && !this.autoResolving) {
      this.acc += dt * TICKS_PER_SEC * SPEEDS[this.speed];
      const n = Math.floor(this.acc);
      if (n > 0) {
        this.acc -= n;
        this.advance(n);
        this.refreshViews();
        if (c.battle_ready() >= 0 && !this.modalOpen) {
          this.paused = true; // auto-pause: a battle wants a decision
          this.showBattleModal(c.battle_ready());
        }
      }
    }

    // A battle modal (or auto-resolve) covers the screen with a dimmed
    // backdrop: stop redrawing the world behind it. The map render is the
    // backdrop: stop redrawing the world behind it. The WebGPU map render is
    // the frame's whole cost, so skipping it keeps the decision UI responsive.
    if (!this.terrainReady) {
      this.updateHud();
      return;
    }
    if (!this.autoResolving && !this.modalOpen) this.drawWorld();
    this.updateHud();
  }

  /** One full world render at the current camera. The frame's whole cost. */
  private drawWorld() {
    this.renderer.resize();
    this.clampCam(); // zoom floor = aspect-fill, pan inside the map
    // Same-frame collision ordering (slice 09, pinned): pin this frame's
    // camera, lay the DOM cards out against it (card-vs-card resolution
    // included), and only then draw — so the canvas label arbitration blocks
    // on the exact card rects the player sees this frame, never last frame's.
    this.renderer.setFrameCamera(this.cam);
    const cards = this.layoutMapCards();
    this.campaignHud?.updateMapCards(cards.positions);
    this.renderer.draw({
      cam: this.cam,
      armies: this.armies,
      cities: this.cities,
      selected: this.selected,
      selectedCity: this.selectedCity,
      factionLabels: this.territory!.labels,
      factionStatus: this.factionStatus,
      playerFaction: this.playerFaction(),
      fogOfWar: this.fogOfWar,
      visionSources: this.visionSources().map((source) => ({
        x: source.x,
        y: source.y,
        radius: source.r,
      })),
      factionView: this.factionView,
      stackUnitCap: this.stackUnitCap,
      cardRects: cards.rects,
      cardCollisionCulls: cards.culls,
    });
  }

  /** Pan the camera to a world point (clamped inside the map). */
  private centerCam(x: number, y: number) {
    this.cam.x = x;
    this.cam.y = y;
    this.clampCam();
  }

  private clampCam() {
    this.renderer.clampCam(this.cam);
  }

  // ---- state out of wasm ----------------------------------------------------

  private refreshViews() {
    const views = readCampaignViews(this.cfg.campaign, this.cfg.wasm);
    this.armies = views.armies;
    this.cities = views.cities;
    this.stackUnitCap = views.stackUnitCap;
    // Keep allegiance fresh for status treatment (cheap; the renderer reads it
    // every frame). City/army flags are faction-coloured, so they only need a
    // recolour when a town changes hands.
    this.refreshFactionStatus();
    this.refreshSieges();
    this.refreshMapCards();
    if (views.ownerHash !== this.ownerHash && this.territory) {
      this.ownerHash = views.ownerHash;
      this.territory.rebuild(this.cities);
      this.renderer?.updateTerritory(this.territory);
    }
  }

  /** Live notifications for the player's besieged cities. The world keeps
   *  running (no auto-pause); clicking a notice pans the camera to the city so
   *  the player can rush relief before the garrison battle commits. */
  private refreshSieges() {
    const sieges = JSON.parse(this.cfg.campaign.sieges_json()) as SiegeView[];
    const facName = (f: number) => this.cfg.data.map.factions[f]?.name ?? `faction ${f}`;
    // Rebuild only when the set of besieged cities changes, not every tick.
    const sig = sieges.map((s) => s.node).join(",");
    const hud = this.campaignHud;
    if (!hud) return;
    if (sig !== this.siegeSig) {
      this.siegeSig = sig;
      const rows = sieges.map((s) => ({
        node: s.node,
        x: s.x,
        y: s.y,
        name: this.cfg.data.map.nodes[s.node].name,
        attackerName: facName(s.attacker),
      }));
      hud.setSieges(rows, (node, x, y) => {
        this.centerCam(x, y);
        this.openCityPanel(node);
      });
    }
  }

  private refreshMapCards() {
    const hud = this.campaignHud;
    if (!hud) return;
    const pf = this.playerFaction();
    const cards: MapCardModel[] = [];
    const garrisonsByCity = this.ownGarrisonFooters();
    for (const [node, city] of this.cities) {
      if (city.owner !== pf) continue;
      const mapNode = this.cfg.data.map.nodes[node];
      if (mapNode.kind !== "city") continue;
      const detail = JSON.parse(this.cfg.campaign.city_json(node)) as CityDetail | null;
      const garrison = garrisonsByCity.get(node);
      cards.push({
        id: `city:${node}`,
        kind: "city",
        name: mapNode.name.toUpperCase(),
        factionColor: cssFactionColor(this.cfg.data.map.factions[city.owner]?.color),
        incomeText: `+${(detail?.monthly_income ?? 0).toLocaleString()}/mo`,
        garrisonName: garrison?.name,
        garrisonStrengthText: garrison?.strength,
      });
    }
    const ordinalOf = this.playerArmyOrdinals();
    for (const army of this.armies) {
      if (!this.isOwnArmy(army) || this.ownGarrisonCityForArmy(army) !== null) continue;
      cards.push({
        id: `army:${army.id}`,
        kind: "army",
        name: `${ordinal(ordinalOf.get(army.id) ?? 1)} LEGION`.toUpperCase(),
        factionColor: cssFactionColor(this.cfg.data.map.factions[army.faction]?.color),
        strengthText: formatStrength(army.soldiers),
      });
    }
    const sig = JSON.stringify(cards);
    if (sig === this.mapCardsSig) return;
    this.mapCardsSig = sig;
    this.cardSizeCache.clear();
    hud.setMapCards(cards, (id) => this.onMapCardClick(id));
  }

  /** A card is a click target for the thing it labels: city cards select the
   *  city (same path as clicking the model), army cards select the army. */
  private onMapCardClick(id: string) {
    const [kind, rawNode] = id.split(":");
    const node = Number(rawNode);
    if (!Number.isFinite(node)) return;
    if (kind === "city") {
      this.selected = -1;
      this.openCityPanel(node);
    } else if (kind === "army") {
      this.selected = node;
      this.closeCityPanel();
    }
    this.updateArmyPanel();
  }

  /** Lay the DOM map cards out for this frame: anchor each card directly under
   *  its city/army, then resolve overlaps against already-claimed ground.
   *  Below the full-tilt zoom the loser hides; once the camera rides fully
   *  tilted every city card must stay visible (that close, hiding reads as a
   *  missing city — Ostia next to Roma), so a colliding city card slides
   *  straight down below the claimed ground instead. The visible rects and
   *  culls are REPORTED to the renderer: cards report, the label authority
   *  arbitrates labels. */
  private layoutMapCards(): {
    positions: MapCardPosition[];
    rects: CampaignCardRect[];
    culls: string[];
  } {
    const hud = this.campaignHud;
    if (!hud) return { positions: [], rects: [], culls: [] };
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth || window.innerWidth || 1;
    const height = this.canvas.clientHeight || window.innerHeight || 1;
    const cityMinTier = this.cam.scale < 0.6 ? 3 : this.cam.scale < 0.85 ? 2 : 1;
    const pf = this.playerFaction();
    for (const [id, size] of hud.measureMapCards()) this.cardSizeCache.set(id, size);
    const cardSizes = this.cardSizeCache;
    interface CardLayout {
      id: string;
      name: string;
      /** Who wins ground: cities above armies, higher tier above lower. */
      priority: number;
      /** City cards at full-tilt zoom nudge on collision; everything else culls. */
      city: boolean;
      /** The city's own screen anchor (model base) — other cards must not
       *  cover it (the campaign-lod "does not bury its own marker" contract). */
      anchor?: [number, number];
      x: number;
      y: number;
      size: { w: number; h: number } | undefined;
      visible: boolean;
      rect?: ScreenRect;
    }
    const entries: CardLayout[] = [];
    for (const [node, city] of this.cities) {
      if (city.owner !== pf) continue;
      const mapNode = this.cfg.data.map.nodes[node];
      if (mapNode.kind !== "city") continue;
      const [sx, sy] = this.renderer.toScreen(mapNode.pos[0], mapNode.pos[1]);
      const id = `city:${node}`;
      const ax = sx / dpr;
      const ay = sy / dpr;
      const baseY = ay + cityCardOffsetY(this.cam.scale, mapNode.tier);
      const size = cardSizes.get(id);
      const x = ax;
      const y = baseY;
      entries.push({
        id,
        name: mapNode.name.toUpperCase(),
        priority: 10 + mapNode.tier,
        city: true,
        anchor: [ax, ay],
        x,
        y,
        size,
        visible: mapNode.tier >= cityMinTier && onScreen(x, y, width, height),
      });
    }
    const ordinalOf = this.playerArmyOrdinals();
    for (const army of this.armies) {
      if (!this.isOwnArmy(army) || this.ownGarrisonCityForArmy(army) !== null) continue;
      const [sx, sy] = this.renderer.toScreen(army.x, army.y);
      const id = `army:${army.id}`;
      const x = sx / dpr;
      const y = sy / dpr + 22;
      entries.push({
        id,
        // Must match the DOM card title (refreshMapCards) — stats consumers
        // key card outcomes by name.
        name: `${ordinal(ordinalOf.get(army.id) ?? 1)} LEGION`.toUpperCase(),
        priority: 0,
        city: false,
        x,
        y,
        size: cardSizes.get(id),
        visible: this.cam.scale > 0.35 && onScreen(x, y, width, height),
      });
    }
    // Card-vs-card: claim ground in priority order (emitter order breaks
    // ties — deterministic per frame). A card not yet measured (first DOM
    // frame) can't claim or yield; it joins next frame.
    const cityCardsMustShow = this.cam.scale >= CAMPAIGN_FULL_TILT_ZOOM;
    const claimed: ScreenRect[] = [];
    const culls: string[] = [];
    const contenders = entries
      .map((entry, seq) => ({ entry, seq }))
      .filter(({ entry }) => entry.visible && entry.size)
      .sort((a, b) => b.entry.priority - a.entry.priority || a.seq - b.seq)
      .map(({ entry }) => entry);
    for (const entry of contenders) {
      const size = entry.size!;
      let rect = cardRectAt(entry.x, entry.y, size);
      if (cityCardsMustShow && entry.city) {
        // Slide below the claimed ground — other cards AND other cities'
        // anchors (a card over a neighbour's model base buries its marker) —
        // until free. Each step permanently clears at least one obstacle
        // (y only grows), so the obstacle count bounds the loop.
        const anchors = contenders
          .filter((other) => other.city && other !== entry && other.anchor)
          .map((other) => other.anchor!);
        for (let i = 0; i < claimed.length + anchors.length; i++) {
          const rectHits = claimed.filter((other) => rectsOverlap(rect, other));
          const anchorHits = anchors.filter(
            ([x, y]) =>
              x >= rect.x - ANCHOR_CLEAR_PX &&
              x <= rect.x + rect.w + ANCHOR_CLEAR_PX &&
              y >= rect.y - ANCHOR_CLEAR_PX &&
              y <= rect.y + rect.h,
          );
          if (rectHits.length === 0 && anchorHits.length === 0) break;
          entry.y =
            Math.max(
              ...rectHits.map((other) => other.y + other.h),
              ...anchorHits.map(([, y]) => y + ANCHOR_CLEAR_PX),
            ) + CARD_NUDGE_GAP_PX;
          rect = cardRectAt(entry.x, entry.y, size);
        }
        entry.rect = rect;
        claimed.push(rect);
        continue;
      }
      if (!claimed.some((other) => rectsOverlap(rect, other))) {
        entry.rect = rect;
        claimed.push(rect);
        continue;
      }
      entry.visible = false;
      culls.push(`card:${entry.name}`);
    }
    return {
      positions: entries.map(({ id, x, y, visible }) => ({ id, x, y, visible })),
      rects: entries
        .filter((entry) => entry.visible && entry.rect)
        .map((entry) => ({ id: entry.id, name: entry.name, box: entry.rect! })),
      culls,
    };
  }

  private ownGarrisonFooters() {
    const footers = new Map<number, { name: string; strength: string; soldiers: number }>();
    const ordinalOf = this.playerArmyOrdinals();
    for (const army of this.armies) {
      if (!this.isOwnArmy(army)) continue;
      const city = this.occupiedCityForArmy(army);
      if (city === null) continue;
      const existing = footers.get(city.index);
      if (existing && existing.soldiers >= army.soldiers) continue;
      footers.set(city.index, {
        name: `${ordinal(ordinalOf.get(army.id) ?? 1)} LEGION`,
        strength: formatStrength(army.soldiers),
        soldiers: army.soldiers,
      });
    }
    return footers;
  }

  private playerArmyOrdinals() {
    const ids = this.armies
      .filter((army) => this.isOwnArmy(army))
      .map((army) => army.id)
      .sort((a, b) => a - b);
    return new Map(ids.map((id, index) => [id, index + 1]));
  }

  private isOwnArmy(army: ArmyView) {
    return army.mine || army.faction === this.playerFaction();
  }

  /** The occupied city only counts as a garrison (card footer, no army card)
   *  when the player OWNS it — an own army on a foreign city (siege/occupation)
   *  must keep its own army card or the stack has no label at all. */
  private ownGarrisonCityForArmy(army: ArmyView) {
    const hit = this.occupiedCityForArmy(army);
    if (!hit) return null;
    return this.cities.get(hit.index)?.owner === this.playerFaction() ? hit : null;
  }

  private occupiedCityForArmy(army: ArmyView) {
    let best: { index: number; d: number } | null = null;
    for (let index = 0; index < this.cfg.data.map.nodes.length; index++) {
      const node = this.cfg.data.map.nodes[index];
      if (node.kind !== "city") continue;
      const d = Math.hypot(node.pos[0] - army.x, node.pos[1] - army.y);
      if (d < 8 && (!best || d < best.d)) best = { index, d };
    }
    return best;
  }

  // ---- input ------------------------------------------------------------------

  private wireInput(signal: AbortSignal) {
    const cv = this.canvas;
    let dragging = false;
    let moved = false;
    cv.addEventListener(
      "mousedown",
      (e) => {
        if (e.button === 0) {
          dragging = true;
          moved = false;
        }
      },
      { signal },
    );
    window.addEventListener(
      "mouseup",
      (e) => {
        if (e.button === 0 && dragging) {
          dragging = false;
          if (!moved) this.click(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);
        }
      },
      { signal },
    );
    cv.addEventListener(
      "mousemove",
      (e) => {
        if (dragging && (e.movementX || e.movementY)) {
          moved = true;
          // View-relative drag: a screen delta maps through the user yaw so
          // the map follows the cursor whatever way the chart is rotated.
          const yaw = this.cam.yaw ?? 0;
          const sx = e.movementX / this.cam.scale;
          const sy = e.movementY / this.cam.scale;
          this.cam.x -= sx * Math.cos(yaw) + sy * Math.sin(yaw);
          this.cam.y -= sx * Math.sin(yaw) - sy * Math.cos(yaw);
          return;
        }
        // Hover mirrors click: pick the rendered marker, not a ground-plane
        // inverse that drifts from raised markers under perspective.
        this.hover = this.nearestRenderedArmy(
          e.offsetX * devicePixelRatio,
          e.offsetY * devicePixelRatio,
        );
      },
      { signal },
    );
    cv.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        // Normalize deltaMode to pixels before scaling so LINE-mode mice/Firefox
        // (~3/notch) and PIXEL-mode trackpads/mice (~100/notch) share one
        // sensitivity — same fold as the battle wheel handler (battle/input.ts).
        const unitPx = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
        const f = Math.exp(-e.deltaY * unitPx * 0.0015);
        const [wx, wy] = this.renderer.toWorld(
          e.offsetX * devicePixelRatio,
          e.offsetY * devicePixelRatio,
        );
        this.cam.scale = Math.min(MAX_CAMPAIGN_ZOOM, this.cam.scale * f);
        this.clampCam(); // zoom floor + new basis for zoom-to-cursor
        const [nx, ny] = this.renderer.toWorld(
          e.offsetX * devicePixelRatio,
          e.offsetY * devicePixelRatio,
        );
        this.cam.x += wx - nx;
        this.cam.y += wy - ny;
        this.clampCam();
      },
      { signal, passive: false },
    );
    cv.addEventListener(
      "contextmenu",
      (e) => {
        e.preventDefault();
        this.rightClick(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);
      },
      { signal },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        this.heldKeys.add(e.key.toLowerCase());
        if (this.modalOpen) return;
        if (e.key === " ") {
          e.preventDefault();
          this.paused = !this.paused;
        } else if (e.key === "1") this.setSpeed(0);
        else if (e.key === "2") this.setSpeed(1);
        else if (e.key === "3") this.setSpeed(2);
        else if (e.key === "h" && this.selected >= 0) {
          this.cfg.campaign.order_halt(this.selected);
          this.refreshViews();
        } else if (e.key === "v") {
          this.factionView = !this.factionView;
          this.renderTopBar();
        } else if (e.key === "f") {
          this.fogOfWar = !this.fogOfWar;
          this.renderTopBar();
        } else if (e.key === "Backspace" || e.key === "Home") {
          // Camera reset, same key as battle: back to the north-up chart.
          this.cam.yaw = 0;
          e.preventDefault();
        }
      },
      { signal },
    );
    window.addEventListener("keyup", (e) => this.heldKeys.delete(e.key.toLowerCase()), {
      signal,
    });
    // Edge-pan needs the cursor wherever it is — over HUD panels and DOM
    // cards too — so it tracks on window, not the canvas.
    window.addEventListener(
      "mousemove",
      (e) => {
        this.edgeMouse = [e.clientX, e.clientY];
      },
      { signal },
    );
  }

  /** Held-key + screen-edge camera, the battle contract (battle/input.ts):
   *  WASD/arrows pan view-relative (Shift sprints ×3), the screen edges pan,
   *  Q/E rotate about the look target, and Z/X ride the tilt axis — which on
   *  the campaign chart is zoom, since pitch derives from scale. Rates match
   *  battle's 50ms cadence, expressed per second. */
  private applyCameraKeys(dt: number) {
    if (this.modalOpen) return;
    const held = this.heldKeys;
    const sprint = held.has("shift") ? 3 : 1;
    const speed = this.renderer.panSpeed(this.cam.scale) * sprint;
    let px =
      (held.has("d") || held.has("arrowright") ? speed : 0) -
      (held.has("a") || held.has("arrowleft") ? speed : 0);
    let py =
      (held.has("w") || held.has("arrowup") ? speed : 0) -
      (held.has("s") || held.has("arrowdown") ? speed : 0);
    const EDGE = 14;
    const [mx, my] = this.edgeMouse;
    if (mx >= 0 && my >= 0) {
      if (mx < EDGE) px -= speed;
      if (mx > window.innerWidth - EDGE) px += speed;
      if (my < EDGE) py += speed;
      if (my > window.innerHeight - EDGE) py -= speed;
    }
    const yaw = this.cam.yaw ?? 0;
    if (px !== 0 || py !== 0) {
      this.cam.x += (px * Math.cos(yaw) - py * Math.sin(yaw)) * dt;
      this.cam.y += (px * Math.sin(yaw) + py * Math.cos(yaw)) * dt;
      this.clampCam();
    }
    // 0.035 rad and ~5% zoom per 50ms battle tick → per-second rates.
    if (held.has("q")) this.cam.yaw = yaw + 0.7 * dt;
    if (held.has("e")) this.cam.yaw = yaw - 0.7 * dt;
    if (held.has("z")) this.zoomBy(Math.exp(-1.0 * dt)); // toward top-down
    if (held.has("x")) this.zoomBy(Math.exp(1.0 * dt)); // toward the tilted close-up
  }

  private zoomBy(factor: number) {
    this.cam.scale = Math.min(MAX_CAMPAIGN_ZOOM, this.cam.scale * factor);
    this.clampCam();
  }

  private click(px: number, py: number) {
    // Select the nearest of my armies; second preference: open a city panel.
    const [wx, wy] = this.renderer.toWorld(px, py);
    const best = this.nearestRenderedArmy(px, py);
    this.selected = best;
    if (best >= 0) this.selectedCity = -1; // an army takes the selection from a city
    const loc =
      best < 0 ? nearestLoc(this.cfg.data.map, wx, wy, Math.max(8, 18 / this.cam.scale)) : null;
    if (loc && loc.kind === 0 && this.cfg.data.map.nodes[loc.a].kind === "city") {
      this.openCityPanel(loc.a);
    } else if (loc && loc.kind === 0 && this.cfg.data.map.nodes[loc.a].kind === "junction") {
      this.openJunctionPanel(loc.a);
    } else if (best < 0) {
      const city = this.nearestRenderedCity(px, py);
      if (city >= 0) this.openCityPanel(city);
      else this.closeCityPanel();
    } else {
      this.closeCityPanel();
    }
    this.updateArmyPanel();
  }

  private nearestRenderedArmy(px: number, py: number): number {
    const maxPx = 28 * (window.devicePixelRatio || 1);
    let best = -1;
    let bestD = maxPx;
    for (const army of this.armies) {
      if (!army.mine) continue;
      const [sx, sy] = this.renderer.toScreen(army.x, army.y);
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestD) {
        bestD = d;
        best = army.id;
      }
    }
    return best;
  }

  private nearestRenderedCity(px: number, py: number): number {
    const maxPx = 28 * (window.devicePixelRatio || 1);
    let best = -1;
    let bestD = maxPx;
    for (let i = 0; i < this.cfg.data.map.nodes.length; i++) {
      const node = this.cfg.data.map.nodes[i];
      if (node.kind !== "city") continue;
      const [sx, sy] = this.renderer.toScreen(node.pos[0], node.pos[1]);
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
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
    const sideView = (s: EncounterSide, label: string, noRetreat: boolean): EncounterSideView => ({
      label,
      garrison: s.garrison,
      factionName: facName(s.faction),
      soldiers: s.soldiers,
      noRetreat,
    });
    const mineInvolved = info.attacker.faction === my || info.defender.faction === my;
    // Jump the camera to where the fight is so the player sees the threat
    // behind the dimmed modal. Prefer the defender — that is the
    // place under attack — and fall back to the attacker if it is off-map or
    // fogged (e.g. a city garrison not drawn as a field army).
    const at =
      this.armies.find((a) => a.id === info.defender.id) ??
      this.armies.find((a) => a.id === info.attacker.id);
    if (at) {
      this.centerCam(at.x, at.y);
      this.drawWorld(); // one render at the new camera before the modal covers it
    }
    this.modalOpen = true;
    this.campaignHud?.setBattleModal({
      ambush: info.ambush,
      attacker: sideView(info.attacker, "Attacker", info.no_retreat[0]),
      defender: sideView(info.defender, "Defender", info.no_retreat[1]),
      reinforcements: info.reinforcements,
      mineInvolved,
      onFight: () => this.fight(eid),
      onAuto: () => this.autoResolve(eid),
    });
  }

  private closeModal() {
    this.modalOpen = false;
    this.campaignHud?.setBattleModal(null);
    this.campaignHud?.setProgressModal(null);
  }

  private fight(eid: number) {
    this.closeModal();
    const c = this.cfg.campaign;
    try {
      localStorage.setItem(SAVE_KEY + "-auto", c.save());
    } catch {}
    const game = start_campaign_battle(c, eid);
    if (!game) return;
    this.cfg.onBattle(game, () => {
      report_battle(c, game);
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
    this.campaignHud?.setProgressModal("0:00");
    // Match the native headless auto-resolve cap: long grinds are decided by
    // remaining strength instead of making the UI burn minutes of wasm time.
    const cap = 30 * 60 * 12; // 12 battle-minutes
    let ticks = 0;
    const pump = () => {
      const v = game.auto_step(30 * 10); // 10 battle-seconds per frame
      ticks += 30 * 10;
      const secs = Math.floor(ticks / 30);
      this.campaignHud?.setProgressModal(
        `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} battle time`,
      );
      if (v >= 0 || ticks >= cap) {
        report_battle(c, game);
        game.free();
        this.autoResolving = false;
        this.closeModal();
        this.refreshViews();
      } else {
        requestAnimationFrame(pump);
      }
    };
    requestAnimationFrame(pump);
  }

  // ---- DOM --------------------------------------------------------------------

  private buildDom() {
    const cv = document.createElement("canvas");
    cv.id = "campaign-canvas";
    cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:none;";
    document.body.appendChild(cv);
    const ui = document.createElement("div");
    ui.id = "campaign-ui";
    ui.style.display = "none";
    ui.innerHTML = campaignDomHtml();
    document.body.appendChild(ui);
    this.campaignHud = mountCampaignHud(ui.querySelector("#cmp-hud-root")!);
    this.renderTopBar();
  }

  private saveCampaign() {
    const c = this.cfg.campaign;
    if (c.can_save()) {
      try {
        localStorage.setItem(SAVE_KEY, c.save());
      } catch {}
    }
  }

  /** Render the React top bar with current state — the ≤5Hz bridge. Skips when
   * nothing visible changed (called every updateHud, i.e. per render frame). */
  private renderTopBar() {
    const hud = this.campaignHud;
    if (!hud) return;
    const t = this.cfg.campaign.current_tick();
    const day = Math.floor(t / 1440) + 1;
    const mins = t % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(Math.floor(mins % 60)).padStart(2, "0");
    const dateText = `Day ${day}, ${hh}:${mm}${this.paused ? "  PAUSED" : `  ${SPEED_LABELS[this.speed]}`}`;
    const eco = JSON.parse(this.cfg.campaign.economy_json()) as {
      treasury: number;
      monthly_income: number;
      monthly_upkeep: number;
      monthly_net: number;
    };
    const sign = eco.monthly_net >= 0 ? "+" : "";
    const goldText = `${eco.treasury.toLocaleString()} gold  (${sign}${eco.monthly_net.toLocaleString()}/mo: +${eco.monthly_income.toLocaleString()} −${eco.monthly_upkeep.toLocaleString()})`;
    const key = `${dateText}|${goldText}|${this.factionView}|${this.fogOfWar}|${this.diploOpen}|${this.classBuilderOpen}`;
    if (key === this.lastTopBarKey) return;
    this.lastTopBarKey = key;
    hud.setTopBar({
      dateText,
      goldText,
      paused: this.paused,
      speed: this.speed,
      factionView: this.factionView,
      fog: this.fogOfWar,
      diploOpen: this.diploOpen,
      classesOpen: this.classBuilderOpen,
      onPause: () => {
        this.paused = !this.paused;
        this.renderTopBar();
      },
      onSpeed: (i) => {
        this.setSpeed(i);
        this.renderTopBar();
      },
      onFactions: () => {
        this.factionView = !this.factionView;
        this.renderTopBar();
      },
      onFog: () => {
        this.fogOfWar = !this.fogOfWar;
        this.renderTopBar();
      },
      onDiplomacy: () => {
        this.toggleDiplomacy();
        this.renderTopBar();
      },
      onClasses: () => {
        this.toggleClassBuilder();
        this.renderTopBar();
      },
      onSave: () => this.saveCampaign(),
      onExit: () => this.cfg.onExit(),
    });
  }

  private toggleDiplomacy() {
    this.diploOpen = !this.diploOpen;
    // The #cmp-diplo-btn lit state is the React top bar's (diploOpen prop).
    if (this.diploOpen) this.updateDiplomacyPanel();
    else this.campaignHud?.setDiplomacy(null);
  }

  private toggleClassBuilder() {
    this.classBuilderOpen = !this.classBuilderOpen;
    // The #cmp-classes-btn lit state is the React top bar's (classesOpen prop).
    if (this.classBuilderOpen) this.updateClassBuilderPanel(true);
    else this.campaignHud?.setClasses(null);
  }

  private updateDiplomacyPanel() {
    if (!this.diploOpen) return;
    const json = this.cfg.campaign.diplomacy_json();
    if (json === this.diploJson) return; // unchanged — keep the live DOM/listeners
    this.diploJson = json;
    const list = JSON.parse(json) as DiplomacyRow[];
    const actions: Record<DiplomacyAction, (other: number) => boolean> = {
      declare_war: (other) => this.cfg.campaign.declare_war(other),
      make_peace: (other) => this.cfg.campaign.make_peace(other),
      propose_alliance: (other) => this.cfg.campaign.propose_alliance(other),
      break_alliance: (other) => this.cfg.campaign.break_alliance(other),
      gift_gold: (other) => this.cfg.campaign.gift_gold(other, 200),
    };
    this.campaignHud?.setDiplomacy({
      list,
      onAction: (act, other) => {
        actions[act](other);
        this.refreshViews();
        this.updateDiplomacyPanel();
      },
    });
  }

  private updateHud() {
    // The date/gold readout, speed lights, and view-toggle lights are the React
    // top bar now — renderTopBar() formats them and skips when nothing changed.
    this.renderTopBar();
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
      return {
        ...r,
        selected: d.unit,
        sizeMult: d.size,
        dirty: d.unit !== r.selected || d.size !== r.sizeMult,
      };
    });
    this.campaignHud?.setClasses({
      rows,
      // Selecting a unit/size stages it in the draft (its dirty flag lights
      // Apply); the row's live selected/size drives the fallback for the other.
      onSelectUnit: (cls, unit) => {
        const row = rows.find((r) => r.classIndex === cls);
        if (!row) return;
        this.classDraft.set(cls, { unit, size: row.sizeMult });
        this.updateClassBuilderPanel(true);
      },
      onSelectSize: (cls, size) => {
        const row = rows.find((r) => r.classIndex === cls);
        if (!row) return;
        this.classDraft.set(cls, { unit: row.selected, size });
        this.updateClassBuilderPanel(true);
      },
      onApply: (cls) => {
        const draft = this.classDraft.get(cls);
        if (draft && this.cfg.campaign.order_set_class_doctrine(cls, draft.unit, draft.size)) {
          this.classDraft.delete(cls);
          this.refreshViews();
          this.updateClassBuilderPanel(true);
        }
      },
    });
  }

  private updateArmyPanel() {
    const roster =
      this.selected < 0
        ? null
        : (JSON.parse(this.cfg.campaign.army_roster_json(this.selected)) as ArmyRosterRow[] | null);
    if (this.selected < 0 || !roster) {
      this.campaignHud?.setArmy(null);
      return;
    }
    const id = this.selected;
    const me = this.armies.find((a) => a.id === id);
    // merge candidate: another of my halted armies on the same/adjacent tile
    const buddy = me
      ? this.armies.find((a) => a.mine && a.id !== me.id && Math.hypot(a.x - me.x, a.y - me.y) < 6)
      : undefined;
    // On a trigger tile? (wasm re-validates; this only drives button state)
    const spotIdx = me
      ? this.spotPos.findIndex(([x, y]) => Math.hypot(x - me.x, y - me.y) < 2.6)
      : -1;
    const autoReplenish = this.cfg.campaign.army_auto_replenish(id);
    this.campaignHud?.setArmy({
      armyId: id,
      roster,
      me,
      buddy,
      spotIdx,
      autoReplenish,
      onAutoReplenish: (on) => {
        this.cfg.campaign.order_auto_replenish(id, on);
        this.refreshViews();
        this.updateArmyPanel();
      },
      onHalt: () => {
        this.cfg.campaign.order_halt(id);
        this.refreshViews();
      },
      onAmbush: () => {
        if (spotIdx >= 0 && this.cfg.campaign.order_ambush(id, spotIdx)) {
          this.refreshViews();
          this.updateArmyPanel();
        }
      },
      onCamp: () => {
        if (this.cfg.campaign.order_camp(id)) {
          this.refreshViews();
          this.updateArmyPanel();
        }
      },
      onSplit: (mask) => {
        if (this.cfg.campaign.order_split(id, mask)) {
          this.refreshViews();
          this.updateArmyPanel();
        }
      },
      onMerge: () => {
        if (buddy && this.cfg.campaign.order_merge(buddy.id, id)) {
          this.refreshViews();
          this.updateArmyPanel();
        }
      },
    });
  }

  private openCityPanel(node: number) {
    this.selectedCity = node;
    const c = this.cities.get(node);
    if (!c) return;
    const mineCity =
      this.cfg.data.map.factions[c.owner]?.playable !== undefined &&
      c.owner === this.playerFaction();
    const detail = JSON.parse(this.cfg.campaign.city_json(node)) as CityDetail | null;
    if (!detail) return;
    const n = this.cfg.data.map.nodes[node];
    this.campaignHud?.setCity({
      name: n.name,
      tier: n.tier,
      factionName: this.cfg.data.map.factions[c.owner]?.name ?? "?",
      garrison: c.garrison,
      queue: c.queue,
      mineCity,
      detail,
      recruitClasses: this.recruitClasses,
      // Read both dials so setting one keeps the other; the city auto-develops.
      onPolicy: (focus, throttle) => {
        this.cfg.campaign.order_set_city_policy(node, focus, throttle);
        this.refreshViews();
      },
      onRecruit: (i) => {
        this.cfg.campaign.order_recruit(node, i, 240);
        this.refreshViews();
        this.openCityPanel(node);
      },
    });
  }

  private openJunctionPanel(node: number) {
    this.selectedCity = -1;
    this.campaignHud?.setJunction(this.cfg.data.map.nodes[node].name);
  }

  private closeCityPanel() {
    this.selectedCity = -1;
    this.campaignHud?.setCity(null);
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
    for (const f of JSON.parse(this.cfg.campaign.diplomacy_json()) as {
      id: number;
      relation: string;
    }[]) {
      this.factionStatus[f.id] =
        f.relation === "war"
          ? Allegiance.Foe
          : f.relation === "alliance" || f.relation === "self"
            ? Allegiance.Friend
            : Allegiance.Neutral;
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

function cssFactionColor(color: [number, number, number] | undefined) {
  const [r, g, b] = color ?? [146, 126, 92];
  return `rgb(${r},${g},${b})`;
}

function formatStrength(soldiers: number) {
  return `${Math.round(soldiers / 100) / 10}k`;
}

function cityCardOffsetY(zoom: number, tier: number) {
  if (zoom < 0.6) return 6 + tier * 0.7;
  return 7.5 + Math.min(4, zoom * 1.1);
}

/** Breathing room between a nudged city card and the rect it slid below. */
const CARD_NUDGE_GAP_PX = 4;
/** Clearance a nudged card keeps around a neighbour city's anchor point. */
const ANCHOR_CLEAR_PX = 6;

function onScreen(x: number, y: number, width: number, height: number) {
  return x >= -160 && y >= -90 && x <= width + 160 && y <= height + 120;
}

/** DOM card rect (CSS px): cards render top-center anchored
 *  (translate3d(x,y) translate(-50%,0) in MapCards). */
function cardRectAt(x: number, y: number, size: { w: number; h: number }): ScreenRect {
  return { x: x - size.w / 2, y, w: size.w, h: size.h };
}

function ordinal(k: number) {
  const value = k % 100;
  const suffix = value >= 11 && value <= 13 ? "th" : (["th", "st", "nd", "rd"][k % 10] ?? "th");
  return `${k}${suffix}`;
}
