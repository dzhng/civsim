import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GRAPHICS_SETTINGS,
  GRAPHICS_SETTINGS_STORAGE_KEY,
  getGraphicsSettings,
  graphicsQueryOverrides,
  reloadGraphicsSettingsForTests,
  resolveGraphicsSettings,
  setGraphicsSettings,
  subscribeGraphicsSettings,
  updateGraphicsSettings,
  useGraphicsSettings,
} from "./graphicsSettings";

describe("graphicsSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    reloadGraphicsSettingsForTests();
  });

  it("defaults to the production settings", () => {
    expect(getGraphicsSettings()).toEqual(DEFAULT_GRAPHICS_SETTINGS);
  });

  it("keeps a stable React snapshot until settings change", () => {
    const { result, rerender } = renderHook(() => useGraphicsSettings());
    const initial = result.current;
    rerender();
    expect(result.current).toBe(initial);

    act(() => updateGraphicsSettings({ bloom: false }));
    const changed = result.current;
    expect(changed).not.toBe(initial);
    expect(changed.bloom).toBe(false);

    act(() => setGraphicsSettings(getGraphicsSettings()));
    expect(result.current).toBe(changed);
  });

  it("persists and reloads a complete settings roundtrip", () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribeGraphicsSettings((settings) => seen.push(settings));
    setGraphicsSettings({
      shadows: "csm",
      grassQuality: "fine",
      grass: false,
      farGrass: false,
      bloom: false,
      audio: {
        masterVolume: 0.8,
        muted: false,
        birds: false,
        water: false,
      },
    });
    unsubscribe();

    expect(JSON.parse(localStorage.getItem(GRAPHICS_SETTINGS_STORAGE_KEY) ?? "{}")).toEqual({
      shadows: "csm",
      grassQuality: "fine",
      grass: false,
      farGrass: false,
      bloom: false,
      audio: {
        masterVolume: 0.8,
        muted: false,
        birds: false,
        water: false,
      },
    });
    expect(seen).toEqual([
      {
        shadows: "csm",
        grassQuality: "fine",
        grass: false,
        farGrass: false,
        bloom: false,
        audio: {
          masterVolume: 0.8,
          muted: false,
          birds: false,
          water: false,
        },
      },
    ]);

    reloadGraphicsSettingsForTests();
    expect(getGraphicsSettings()).toEqual({
      shadows: "csm",
      grassQuality: "fine",
      grass: false,
      farGrass: false,
      bloom: false,
      audio: {
        masterVolume: 0.8,
        muted: false,
        birds: false,
        water: false,
      },
    });
  });

  it("lets supported query params override only shadows and post-processing", () => {
    const base = {
      shadows: "csm" as const,
      grassQuality: "standard" as const,
      grass: true,
      farGrass: true,
      bloom: true,
      audio: DEFAULT_GRAPHICS_SETTINGS.audio,
    };
    expect(resolveGraphicsSettings("?shadows=off&post=off", base)).toEqual({
      shadows: "off",
      grassQuality: "standard",
      grass: true,
      farGrass: true,
      bloom: false,
      audio: DEFAULT_GRAPHICS_SETTINGS.audio,
    });
    expect(resolveGraphicsSettings("?post=on", { ...base, bloom: false })).toEqual({
      ...base,
      bloom: true,
    });
    expect(graphicsQueryOverrides("?shadows=off")).toEqual({
      shadows: true,
      grassQuality: false,
      grass: false,
      farGrass: false,
      bloom: false,
    });
  });

  it("sanitizes stored audio settings and ships muted by default", () => {
    expect(DEFAULT_GRAPHICS_SETTINGS.audio.muted).toBe(true);
    localStorage.setItem(
      GRAPHICS_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        audio: {
          masterVolume: 9,
          muted: false,
          birds: false,
          water: false,
        },
      }),
    );

    reloadGraphicsSettingsForTests();

    expect(getGraphicsSettings().audio).toEqual({
      masterVolume: 1,
      muted: false,
      birds: false,
      water: false,
    });
  });
});
