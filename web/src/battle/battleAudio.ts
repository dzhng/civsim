import {
  AmbientAudioDirector,
  AmbientAudioEngine,
  type AmbientAudioSettings,
  type AmbientRealtimeAudioContextConstructor,
  type MeadowSoundscapeState,
} from "../../../packages/ambient-audio/src/index";
import {
  battleGrassTintWeight,
  type BattleGroundCover,
} from "../../../packages/game-renderer/src/battle/terrainFeatures";
import { sampleBattleWind } from "../../../packages/game-renderer/src/battle/windSignal";
import {
  getGraphicsSettings,
  subscribeGraphicsSettings,
  type GraphicsAudioSettings,
} from "../shared/graphicsSettings";

export interface BattleAudioTerrainGrid {
  w: number;
  h: number;
  cell: number;
  ox: number;
  oy: number;
  tint: Uint8Array;
  groundCover?: BattleGroundCover | null;
}

export interface BattleAudioWaterSurface {
  kind: "lake" | "ocean";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BattleAudioCamera {
  viewCenter(): [number, number];
  groundAxes(): { right: [number, number] };
}

export interface BattleAmbientAudioInspection {
  ok: boolean;
  mounted: boolean;
  ctxState: AudioContextState | "unavailable";
  activeNodes: number;
  state: MeadowSoundscapeState | null;
}

export class BattleAmbientAudio {
  private engine: AmbientAudioEngine | null = null;
  private director: AmbientAudioDirector | null = null;
  private terrain: BattleAudioTerrainGrid | null = null;
  private waterSurfaces: BattleAudioWaterSurface[] = [];
  private settings = getGraphicsSettings().audio;
  private unsubscribe: (() => void) | null = null;
  private resumeRequested = false;
  private suspended = false;

  constructor() {
    const AudioContextCtor = realtimeAudioContextConstructor();
    if (!AudioContextCtor) return;
    try {
      this.engine = AmbientAudioEngine.create({
        AudioContext: AudioContextCtor,
        settings: audioSettingsForEngine(this.settings),
      });
      this.engine.windBed.start();
      this.engine.waterBed.start();
      this.director = new AmbientAudioDirector(
        this.engine.windBed,
        this.engine.waterBed,
        this.engine.birdScheduler,
      );
      this.applySettings(this.settings);
      this.unsubscribe = subscribeGraphicsSettings((settings) => {
        this.settings = settings.audio;
        this.applySettings(this.settings);
      });
    } catch {
      this.engine = null;
      this.director = null;
    }
  }

  setTerrain(
    terrain: BattleAudioTerrainGrid | null,
    waterSurfaces: readonly BattleAudioWaterSurface[],
  ): void {
    this.terrain = terrain ? { ...terrain, tint: new Uint8Array(terrain.tint) } : null;
    this.waterSurfaces = waterSurfaces.map((surface) => ({ ...surface }));
  }

  resume(): void {
    this.resumeRequested = true;
    if (this.suspended) return;
    void this.engine?.resume().catch(() => {});
  }

  suspend(): void {
    this.suspended = true;
    void this.engine?.suspend().catch(() => {});
  }

  setSuspended(suspended: boolean): void {
    if (suspended) {
      this.suspend();
      return;
    }
    this.suspended = false;
    if (this.resumeRequested) this.resume();
  }

  update(camera: BattleAudioCamera, dtSeconds: number, tSeconds: number): void {
    if (!this.director || !this.engine?.mounted || this.suspended) return;
    const listenerXY = camera.viewCenter();
    const wind = sampleBattleWind(listenerXY[0], listenerXY[1], tSeconds);
    const water = nearestWaterSurfaceSignal(
      listenerXY,
      camera.groundAxes().right,
      this.waterSurfaces,
    );
    this.director.update({
      windSpeed: wind.speed,
      windGust: wind.gust,
      waterProximity: this.settings.water ? water.proximity : 0,
      waterPan: water.pan,
      grassNear: sampleGrassNear(listenerXY, this.terrain),
      birds: this.settings.birds,
      birdIntensity: this.settings.birds ? 1 : 0,
      listenerXY,
      dtSeconds,
    });
  }

  inspect(): BattleAmbientAudioInspection {
    return {
      ok: this.engine?.ok ?? false,
      mounted: this.engine?.mounted ?? false,
      ctxState: this.engine?.ctx.state ?? "unavailable",
      activeNodes: this.engine?.activeNodes ?? 0,
      state: this.director?.snapshot() ?? null,
    };
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    const engine = this.engine;
    this.engine = null;
    this.director = null;
    if (engine) void engine.dispose().catch(() => {});
  }

  private applySettings(settings: GraphicsAudioSettings): void {
    if (!this.engine) return;
    this.engine.mixer.setMasterVolume(settings.masterVolume);
    this.engine.mixer.setMuted(settings.muted);
    this.engine.mixer.setBedVolume("birds", settings.birds ? 1 : 0);
    this.engine.mixer.setBedVolume("water", settings.water ? 1 : 0);
    this.engine.birdScheduler.setEnabled(settings.birds);
  }
}

export function nearestWaterSurfaceSignal(
  point: readonly [number, number],
  cameraRight: readonly [number, number],
  surfaces: readonly BattleAudioWaterSurface[],
): { proximity: number; pan: number; distance: number } {
  let best: {
    surface: BattleAudioWaterSurface;
    distance: number;
    closest: [number, number];
  } | null = null;
  for (const surface of surfaces) {
    const closest: [number, number] = [
      clamp(point[0], Math.min(surface.x0, surface.x1), Math.max(surface.x0, surface.x1)),
      clamp(point[1], Math.min(surface.y0, surface.y1), Math.max(surface.y0, surface.y1)),
    ];
    const distance = Math.hypot(point[0] - closest[0], point[1] - closest[1]);
    if (!best || distance < best.distance) best = { surface, distance, closest };
  }
  if (!best) return { proximity: 0, pan: 0, distance: Infinity };

  const radius = best.surface.kind === "ocean" ? 900 : 260;
  const proximity = smooth01(1 - best.distance / radius);
  const vector = panVector(point, best.surface, best.closest);
  const side = vector[0] * cameraRight[0] + vector[1] * cameraRight[1];
  const panRadius = Math.max(80, radius * 0.45);
  return {
    proximity,
    pan: clamp(side / panRadius, -1, 1),
    distance: best.distance,
  };
}

export function sampleGrassNear(
  point: readonly [number, number],
  terrain: BattleAudioTerrainGrid | null,
): number {
  if (!terrain) return 0;
  const cx = Math.floor((point[0] - terrain.ox) / terrain.cell);
  const cy = Math.floor((point[1] - terrain.oy) / terrain.cell);
  let total = 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= terrain.w || y >= terrain.h) continue;
      total += battleGrassTintWeight(terrain.tint[y * terrain.w + x] ?? 0);
      count++;
    }
  }
  if (count === 0) return 0;
  const coverScale =
    terrain.groundCover === "sand" ? 0.35 : terrain.groundCover === "scrub-grass" ? 0.75 : 1;
  return clamp((total / count) * coverScale, 0, 1);
}

function audioSettingsForEngine(settings: GraphicsAudioSettings): AmbientAudioSettings {
  return {
    masterVolume: settings.masterVolume,
    muted: settings.muted,
    birds: settings.birds,
  };
}

function realtimeAudioContextConstructor(): AmbientRealtimeAudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const host = window as Window &
    typeof globalThis & { webkitAudioContext?: AmbientRealtimeAudioContextConstructor };
  return (host.AudioContext ??
    host.webkitAudioContext ??
    null) as AmbientRealtimeAudioContextConstructor | null;
}

function panVector(
  point: readonly [number, number],
  surface: BattleAudioWaterSurface,
  closest: readonly [number, number],
): [number, number] {
  const dx = closest[0] - point[0];
  const dy = closest[1] - point[1];
  if (Math.hypot(dx, dy) > 1e-6) return [dx, dy];
  return [(surface.x0 + surface.x1) * 0.5 - point[0], (surface.y0 + surface.y1) * 0.5 - point[1]];
}

function smooth01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
