export type GraphicsShadowMode = "off" | "single" | "csm";
export type GraphicsGrassQuality = "low" | "standard" | "fine";

export interface GraphicsAudioSettings {
  masterVolume: number;
  muted: boolean;
  birds: boolean;
  water: boolean;
}

export interface GraphicsSettings {
  shadows: GraphicsShadowMode;
  grassQuality: GraphicsGrassQuality;
  grass: boolean;
  farGrass: boolean;
  bloom: boolean;
  audio: GraphicsAudioSettings;
}

export interface GraphicsQueryOverrides {
  shadows: boolean;
  grassQuality: boolean;
  grass: boolean;
  farGrass: boolean;
  bloom: boolean;
}

export const GRAPHICS_SETTINGS_STORAGE_KEY = "civsim.graphicsSettings";

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  shadows: "single",
  grassQuality: "standard",
  grass: true,
  farGrass: true,
  bloom: true,
  audio: {
    masterVolume: 0.55,
    muted: true,
    birds: true,
    water: true,
  },
};

type Listener = (settings: GraphicsSettings) => void;

let current = readStoredGraphicsSettings();
const listeners = new Set<Listener>();

export function getGraphicsSettings(): GraphicsSettings {
  return cloneGraphicsSettings(current);
}

export function setGraphicsSettings(next: GraphicsSettings): void {
  const clean = sanitizeGraphicsSettings(next, current);
  if (graphicsSettingsEqual(clean, current)) return;
  current = clean;
  writeStoredGraphicsSettings(current);
  for (const listener of listeners) listener(getGraphicsSettings());
}

export function updateGraphicsSettings(patch: Partial<GraphicsSettings>): void {
  setGraphicsSettings({ ...current, ...patch, audio: patch.audio ?? current.audio });
}

export function subscribeGraphicsSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function graphicsQueryOverrides(search: string): GraphicsQueryOverrides {
  const params = searchParams(search);
  return {
    shadows: params.has("shadows"),
    grassQuality:
      params.has("grassQuality") || params.has("grassquality") || params.has("grass-quality"),
    grass: params.has("grass"),
    farGrass: params.has("nofar") || params.has("fargrass"),
    bloom: params.has("post") || params.has("bloom"),
  };
}

export function resolveGraphicsSettings(
  search: string,
  base: GraphicsSettings = getGraphicsSettings(),
): GraphicsSettings {
  const params = searchParams(search);
  const resolved = sanitizeGraphicsSettings(base, DEFAULT_GRAPHICS_SETTINGS);
  const shadow = parseShadowMode(params.get("shadows"));
  if (shadow) resolved.shadows = shadow;
  const grassQuality = parseGrassQuality(
    params.get("grassQuality") ?? params.get("grassquality") ?? params.get("grass-quality"),
  );
  if (grassQuality) resolved.grassQuality = grassQuality;
  const grass = parseBooleanParam(params.get("grass"));
  if (grass !== null) resolved.grass = grass;
  if (params.has("nofar")) resolved.farGrass = false;
  const farGrass = parseBooleanParam(params.get("fargrass"));
  if (farGrass !== null) resolved.farGrass = farGrass;
  const post = params.get("post");
  if (post !== null) resolved.bloom = post !== "off";
  const bloom = parseBooleanParam(params.get("bloom"));
  if (bloom !== null) resolved.bloom = bloom;
  return resolved;
}

export function reloadGraphicsSettingsForTests(): void {
  current = readStoredGraphicsSettings();
  for (const listener of listeners) listener(getGraphicsSettings());
}

function readStoredGraphicsSettings(): GraphicsSettings {
  const storage = localStorageOrNull();
  if (!storage) return { ...DEFAULT_GRAPHICS_SETTINGS };
  try {
    const raw = storage.getItem(GRAPHICS_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GRAPHICS_SETTINGS };
    return sanitizeGraphicsSettings(JSON.parse(raw), DEFAULT_GRAPHICS_SETTINGS);
  } catch {
    return { ...DEFAULT_GRAPHICS_SETTINGS };
  }
}

function writeStoredGraphicsSettings(settings: GraphicsSettings): void {
  const storage = localStorageOrNull();
  if (!storage) return;
  try {
    storage.setItem(GRAPHICS_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

function sanitizeGraphicsSettings(value: unknown, fallback: GraphicsSettings): GraphicsSettings {
  const candidate = value as Partial<GraphicsSettings> | null;
  return {
    shadows: parseShadowMode(candidate?.shadows) ?? fallback.shadows,
    grassQuality: parseGrassQuality(candidate?.grassQuality) ?? fallback.grassQuality,
    grass: typeof candidate?.grass === "boolean" ? candidate.grass : fallback.grass,
    farGrass: typeof candidate?.farGrass === "boolean" ? candidate.farGrass : fallback.farGrass,
    bloom: typeof candidate?.bloom === "boolean" ? candidate.bloom : fallback.bloom,
    audio: sanitizeAudioSettings(candidate?.audio, fallback.audio),
  };
}

function sanitizeAudioSettings(
  value: unknown,
  fallback: GraphicsAudioSettings,
): GraphicsAudioSettings {
  const candidate = value as Partial<GraphicsAudioSettings> | null;
  return {
    masterVolume: clamp01Number(candidate?.masterVolume, fallback.masterVolume),
    muted: typeof candidate?.muted === "boolean" ? candidate.muted : fallback.muted,
    birds: typeof candidate?.birds === "boolean" ? candidate.birds : fallback.birds,
    water: typeof candidate?.water === "boolean" ? candidate.water : fallback.water,
  };
}

function parseShadowMode(value: unknown): GraphicsShadowMode | null {
  if (value === "off" || value === "single" || value === "csm") return value;
  if (value === "fast") return "single";
  if (value === "high") return "csm";
  return null;
}

function parseGrassQuality(value: unknown): GraphicsGrassQuality | null {
  if (value === "low" || value === "standard" || value === "fine") return value;
  return null;
}

function parseBooleanParam(value: string | null): boolean | null {
  if (value === null) return null;
  if (value === "" || value === "on" || value === "true" || value === "1") return true;
  if (value === "off" || value === "false" || value === "0") return false;
  return null;
}

function searchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function graphicsSettingsEqual(a: GraphicsSettings, b: GraphicsSettings): boolean {
  return (
    a.shadows === b.shadows &&
    a.grassQuality === b.grassQuality &&
    a.grass === b.grass &&
    a.farGrass === b.farGrass &&
    a.bloom === b.bloom &&
    a.audio.masterVolume === b.audio.masterVolume &&
    a.audio.muted === b.audio.muted &&
    a.audio.birds === b.audio.birds &&
    a.audio.water === b.audio.water
  );
}

function cloneGraphicsSettings(settings: GraphicsSettings): GraphicsSettings {
  return { ...settings, audio: { ...settings.audio } };
}

function clamp01Number(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
