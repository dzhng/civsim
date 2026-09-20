// @vitest-environment node
import { expect, test } from "vitest";
import { copySoldierPlayback, CrowdFrameSnapshot } from "@packages/crowd-runtime/src/frameSnapshot";
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

test("a standalone playback copy is independent of the pool and keeps endpoint aliasing", () => {
  const owner = new CrowdFrameSnapshot();
  const input = soldier();
  const [saved] = owner.capture([input]);
  const copy = copySoldierPlayback(saved.playback!);
  expect(copy).toEqual(saved.playback);
  expect(copy).not.toBe(saved.playback);
  const source = copy.base.source;
  expect(source.kind === "clip" && source.sample).toBe(copy.base.destination);
  // A later submission overwrites the pool; a handed-out copy must not follow it.
  input.playback!.base.destination.phase = 0.8;
  delete input.playback!.riderUpperBody;
  owner.capture([input]);
  expect(saved.playback!.base.destination.phase).toBe(0.8);
  expect(copy.base.destination.phase).toBe(0.3);
  expect(copy.riderUpperBody).toEqual(soldier().playback!.riderUpperBody);
});

test("a reused slot carries no value from the submission it overwrote", () => {
  const owner = new CrowdFrameSnapshot();
  const [saved] = owner.capture([soldier()]);
  // Every field differs from the first submission, so a slot that forgets one
  // reports the earlier man rather than the one actually submitted.
  const next: CrowdInstance = {
    x: -5,
    y: -6,
    facing: -1.25,
    classId: 2,
    faction: 1,
    alive: false,
    clip: "die",
    phase: 0.75,
    seed: 9,
    mounted: true,
    lod: 3,
    elevation: -4,
    playback: {
      appearanceId: 2,
      base: {
        source: { kind: "clip", sample: { clip: "hit", phase: 0.1 } },
        destination: { clip: "die", phase: 0.75 },
        weight: 0.25,
      },
    },
  };
  expect(owner.capture([next])[0]).toBe(saved);
  expect(saved).toEqual(next);
  expect(saved.playback).not.toBe(next.playback);
});
