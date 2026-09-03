// @vitest-environment node
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createSeaDisplacementSource,
  seaDisplacementSourceFromParam,
} from "../../packages/photoreal-renderer/src/battle/seaLayer.ts";
import { BATTLE_OCEAN_RAMP } from "../../packages/game-renderer/src/water/waterShoreRamp.ts";

test("photoreal sea: route params select the displacement source", () => {
  assert.equal(seaDisplacementSourceFromParam(null), "gerstner-tsl");
  assert.equal(seaDisplacementSourceFromParam("gerstner"), "gerstner-tsl");
  assert.equal(seaDisplacementSourceFromParam("gerstner-tsl"), "gerstner-tsl");
  // Retired or unknown params (e.g. the deleted IFFT source) fall back to the
  // one live source rather than erroring.
  assert.equal(seaDisplacementSourceFromParam("no-such-source"), "gerstner-tsl");
});

test("photoreal sea: Gerstner is the default active source", () => {
  const stats = createSeaDisplacementSource().stats();
  assert.deepEqual(stats, {
    requested: "gerstner-tsl",
    source: "gerstner-tsl",
    tier: "gerstner-tsl",
    fallback: false,
    resolution: 1,
    cascades: 1,
    storageBytes: 0,
    surface: {
      owner: "skyModel-ibl-standard-pbr",
      skyReflection: "scene.environment:skyModel-lut",
      sunGlint: "mesh-standard-ggx",
      shallowAlbedo: [0.22, 0.58, 0.6],
      deepAlbedo: [0.025, 0.095, 0.22],
      foamAlbedo: [0.92, 0.93, 0.94],
      sandTurbidityAlbedo: [0.66, 0.58, 0.4],
      roughness: 0.105,
      foamRoughness: 0.78,
      normalDetail: {
        near: 0.84,
        far: 0.18,
        fadeStart: 720,
        fadeEnd: 2300,
      },
      foam: {
        // Base thresholds x SEA_SWELL_SCALE (0.55) — David's calm-register
        // call (2026-07-02): foam scales with the swell so coverage holds.
        heightStart: 0.52 * 0.55,
        heightEnd: 1.55 * 0.55,
        slopeStart: 0.12,
        slopeEnd: 0.58,
        speckleStart: 0.56,
        speckleEnd: 0.78,
        scale: 0.74,
      },
      shore: {
        ramp: BATTLE_OCEAN_RAMP,
        sandTurbidityDepthStart: 0.04,
        sandTurbidityDepthEnd: 0.26,
        heightfieldDatum: true,
        farExtent: 7200,
      },
      glint: {
        roughnessFloor: 0.105,
        normalDetailCeiling: 0.84,
        hotLumaThreshold: 246,
        hotFractionMax: 0.07,
        centerShareMin: 0.6,
      },
    },
  });
});

test("photoreal sea: adapter tier collapses to Gerstner after the 12a verdict", () => {
  const stats = createSeaDisplacementSource("gerstner-tsl").stats();
  assert.equal(stats.requested, "gerstner-tsl");
  assert.equal(stats.source, "gerstner-tsl");
  assert.equal(stats.tier, "gerstner-tsl");
  assert.equal(stats.fallback, false);
  assert.equal(stats.resolution, 1);
  assert.equal(stats.cascades, 1);
  assert.equal(stats.storageBytes, 0);
});
