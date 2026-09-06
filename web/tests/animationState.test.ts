// @vitest-environment node
import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import {
  assertGameplayAppearances,
  marchingStateForSpeed,
} from "@packages/crowd-runtime/src/animationState";
import { buildCrowdInstances } from "@packages/crowd-runtime/src/instanceData";
import type { AppearanceBundle } from "@packages/soldier-assets/src/appearanceBundle";
import type { SoldierPlayback } from "@packages/crowd-runtime/src/actionTimeline";

test("marching speed state uses hysteresis instead of frame displacement flicker", () => {
  expect(marchingStateForSpeed(0.39, false)).toBe(false);
  expect(marchingStateForSpeed(0.41, false)).toBe(true);
  expect(marchingStateForSpeed(0.16, true)).toBe(true);
  expect(marchingStateForSpeed(0.14, true)).toBe(false);
});

test("submission preserves explicit terminal destination and opaque base/overlay payload", () => {
  const playback: SoldierPlayback = {
    appearanceId: 41,
    base: {
      source: { kind: "frozen", locals: Object.freeze([1, 2, 3]) },
      destination: { clip: "death_a", phase: 1 },
      weight: 0.3,
    },
    riderUpperBody: {
      source: { kind: "clip", sample: { clip: "idle", phase: 0.2 } },
      destination: { clip: "shoot", phase: 0.4 },
      weight: 0.6,
    },
  };
  const result = buildCrowdInstances({
    positions: new Float32Array([2, 3]),
    facings: new Float32Array([0.5]),
    playback: [playback],
    alive: new Uint8Array([0]),
    soldierUnit: new Uint32Array([1]),
    unitTeam: [0, 1],
    mountedClasses: [41],
    terrainHeight: (x, y) => x + y,
  });
  expect(result.instances[0]).toMatchObject({
    classId: 41,
    clip: "death_a",
    phase: 1,
    x: 2,
    y: 3,
    elevation: 5,
    faction: 1,
    mounted: true,
    alive: false,
    facing: 0.5,
  });
  expect(result.instances[0].playback).toBe(playback);
  expect(result.stats).toEqual({ input: 1, written: 1, alive: 0, player: 0, enemy: 1 });
  expect(() => buildCrowdInstances({ positions: new Float32Array(2), playback: [] })).toThrow(
    "Playback count",
  );
});

test("gameplay admission rejects manual-only appearances without imposing a blanket clip list", () => {
  // Loader owns the complete schema; this gate owns only gameplay/manual admission.
  const catalog = { 40: { manifest: { presentation: null } } } as unknown as Record<
    number,
    AppearanceBundle
  >;
  expect(() => assertGameplayAppearances(catalog)).toThrow("40 is manual-only");
  catalog[40].manifest.presentation = {
    actions: {},
    riderUpperBodyJoints: [],
  } as unknown as NonNullable<AppearanceBundle["manifest"]["presentation"]>;
  expect(() => assertGameplayAppearances(catalog)).not.toThrow();
});

test("all shipped gameplay action clips match their local rig, and mismatches fail before use", async () => {
  const read = async (url: URL) => JSON.parse(await readFile(url, "utf8"));
  const root = new URL("../public/assets/soldiers/catalog.json", import.meta.url);
  const catalog = await read(root);
  const appearances: Record<number, AppearanceBundle> = {};
  for (const [id, path] of Object.entries(catalog.appearances)) {
    const url = new URL(path as string, root);
    const manifest = await read(url);
    appearances[Number(id)] = {
      manifest,
      rig: await read(new URL(manifest.skeleton, url)),
      animation: await read(new URL(manifest.animation, url)),
    } as AppearanceBundle;
  }
  expect(() => assertGameplayAppearances(appearances)).not.toThrow();
  const original = appearances[0].rig.clips;
  const name = appearances[0].manifest.presentation!.actions.ready!.clip;
  appearances[0].rig.clips = original.filter((clip) => clip.name !== name);
  expect(() => assertGameplayAppearances(appearances)).toThrow("missing or mismatched rig/VAT");
  for (const field of ["duration", "loop", "markers"] as const) {
    appearances[0].rig.clips = original.map((clip) =>
      clip.name !== name
        ? clip
        : {
            ...clip,
            [field]:
              field === "duration"
                ? clip.duration + 0.1
                : field === "loop"
                  ? !clip.loop
                  : { release: 0.2 },
          },
    );
    expect(() => assertGameplayAppearances(appearances)).toThrow("missing or mismatched rig/VAT");
  }
});
