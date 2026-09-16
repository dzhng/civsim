// @vitest-environment node
import { expect, test } from "vitest";
import { CrowdFrameSnapshot } from "@packages/crowd-runtime/src/frameSnapshot";
import type { CrowdInstance } from "@packages/crowd-runtime/src/instanceData";

function soldier(): CrowdInstance {
  const destination = { clip: "walk", phase: 0.3 };
  return {
    x: 12,
    y: 34,
    facing: 1,
    classId: 0,
    faction: 0,
    alive: true,
    clip: "walk",
    phase: 0.3,
    seed: 3,
    mounted: false,
    lod: 0,
    elevation: 2,
    playback: {
      appearanceId: 0,
      base: { source: { kind: "clip", sample: destination }, destination, weight: 1 },
      riderUpperBody: {
        source: { kind: "clip", sample: { clip: "attack", phase: 0.2 } },
        destination: { kind: "base" },
        weight: 0.5,
      },
    },
  };
}

test("camera-only consumers retain submitted positions and mutable playback shells", () => {
  const owner = new CrowdFrameSnapshot();
  const input = soldier();
  const [saved] = owner.capture([input]);
  input.x = 99;
  input.playback!.base.destination.phase = 0.8;
  input.playback!.base.weight = 0;
  const upper = input.playback!.riderUpperBody!;
  if (upper.source.kind === "clip") upper.source.sample.clip = "hit";
  expect(saved.x).toBe(12);
  expect(saved.playback!.base.destination.phase).toBe(0.3);
  expect(saved.playback!.base.weight).toBe(1);
  expect(saved.playback!.riderUpperBody!.source).toEqual({
    kind: "clip",
    sample: { clip: "attack", phase: 0.2 },
  });
  const source = saved.playback!.base.source;
  expect(source.kind === "clip" && source.sample).toBe(saved.playback!.base.destination);
});

test("snapshot storage survives alias changes, optional fields and shrink/regrowth", () => {
  const owner = new CrowdFrameSnapshot();
  const input = soldier();
  const [saved] = owner.capture([input]);
  const playback = saved.playback;
  input.playback!.base.source = { kind: "clip", sample: { clip: "idle", phase: 0.1 } };
  owner.capture([input]);
  expect(saved.playback).toBe(playback);
  expect(saved.playback!.base.source).toEqual({
    kind: "clip",
    sample: { clip: "idle", phase: 0.1 },
  });
  expect(saved.playback!.base.destination).toEqual({ clip: "walk", phase: 0.3 });
  input.playback!.base.source = { kind: "clip", sample: input.playback!.base.destination };
  owner.capture([input]);
  const aliased = saved.playback!.base.source;
  expect(aliased.kind === "clip" && aliased.sample).toBe(saved.playback!.base.destination);
  const locals = Object.freeze([1, 2, 3]);
  input.playback!.base.source = { kind: "frozen", locals };
  delete input.playback!.riderUpperBody;
  delete input.elevation;
  owner.capture([input]);
  const source = saved.playback!.base.source;
  expect(source.kind === "frozen" && source.locals).toBe(locals);
  expect(saved.playback!.riderUpperBody).toBeUndefined();
  expect(saved.elevation).toBeUndefined();
  owner.capture([]);
  delete input.playback;
  expect(owner.capture([input])[0]).toBe(saved);
  expect(saved.playback).toBeUndefined();
  owner.clear();
  expect(owner.instances).toEqual([]);
});
