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
} from "./graphicsSettings";

describe("graphicsSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    reloadGraphicsSettingsForTests();
  });

  it("defaults to the production settings", () => {
    expect(getGraphicsSettings()).toEqual(DEFAULT_GRAPHICS_SETTINGS);
  });

  it("persists and reloads a complete settings roundtrip", () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribeGraphicsSettings((settings) => seen.push(settings));
    setGraphicsSettings({ shadows: "csm", grass: false, farGrass: false, bloom: false });
    unsubscribe();

    expect(JSON.parse(localStorage.getItem(GRAPHICS_SETTINGS_STORAGE_KEY) ?? "{}")).toEqual({
      shadows: "csm",
      grass: false,
      farGrass: false,
      bloom: false,
    });
    expect(seen).toEqual([{ shadows: "csm", grass: false, farGrass: false, bloom: false }]);

    reloadGraphicsSettingsForTests();
    expect(getGraphicsSettings()).toEqual({
      shadows: "csm",
      grass: false,
      farGrass: false,
      bloom: false,
    });
  });

  it("lets query params override only the named settings", () => {
    const base = { shadows: "csm" as const, grass: true, farGrass: true, bloom: true };
    expect(resolveGraphicsSettings("?shadows=off&grass=off&nofar&post=off", base)).toEqual({
      shadows: "off",
      grass: false,
      farGrass: false,
      bloom: false,
    });
    expect(resolveGraphicsSettings("?post=on", { ...base, bloom: false })).toEqual({
      ...base,
      bloom: true,
    });
    expect(graphicsQueryOverrides("?shadows=off&nofar")).toEqual({
      shadows: true,
      grass: false,
      farGrass: true,
      bloom: false,
    });
  });
});
