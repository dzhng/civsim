// @vitest-environment node
import { expect, test } from "vitest";
import { temporalCaptureSamples, temporalSnapshots } from "./scenes/models/_temporal-replay.mjs";

test("temporal inventory retains semantic identity while authored exit/death timing changes", () => {
  const recipe = (exit, death, terminal) => ({
    events: [
      { label: "Release exit", tick: exit },
      { label: "Run during exit", tick: exit + 1 },
      { label: "Composed death", tick: death },
      { label: "Terminal hold", tick: terminal },
    ],
  });
  const old = temporalCaptureSamples(recipe(24, 35, 72));
  const authored = temporalCaptureSamples(recipe(43, 54, 106));
  expect(authored.map((sample) => sample.name)).toEqual(old.map((sample) => sample.name));
  expect(authored.find((sample) => sample.name === "event-release-exit").tick).toBe(43);
  expect(authored.find((sample) => sample.name === "death-quarter").tick).toBe(56.25);
  expect(authored.at(-1).tick).toBe(106);
  expect(
    [4, 7, 41].flatMap((id) =>
      authored.map((sample) => `shared/soldiers/action-replay/temporal-${id}-${sample.name}`),
    ),
  ).toEqual(temporalSnapshots);
  expect(new Set(temporalSnapshots).size).toBe(39);
  expect(() => temporalCaptureSamples({ events: [] })).toThrow("Missing temporal sample anchor");
});
