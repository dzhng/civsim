import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { readFile } from "node:fs/promises";
import {
  cropPixels,
  roleClip,
  motionSamples,
  appearances,
  artifactStem,
  selectedAppearances,
  sheetSamples,
} from "../shots/models/scripts/_soldier-capture.mjs";

test("portrait crop retains every source pixel, including bronze, green cloth and alpha", () => {
  const source = new PNG({ width: 4, height: 3 });
  for (let i = 0; i < source.data.length; i++) source.data[i] = (i * 17) % 256;
  source.data.set([155, 149, 82, 255, 76, 128, 71, 127], 20);
  const result = PNG.sync.read(
    cropPixels(PNG.sync.write(source), { x: 1, y: 1, width: 2, height: 2 }),
  );
  assert.deepEqual(
    [...result.data],
    [...source.data.subarray(20, 28), ...source.data.subarray(36, 44)],
  );
});

test("motion reviews sample full exported cycles and retain a nonloop terminal pose", () => {
  assert.deepEqual(motionSamples({ duration: 1.6, loop: true }), {
    phases: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875],
    delay: 20,
  });
  assert.deepEqual(motionSamples({ duration: 0.8, loop: false }), {
    phases: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    delay: 10,
  });
});

test("review roles resolve the loaded manifest's actual clips, never placeholder names", () => {
  const asset = {
    manifest: {
      presentation: {
        actions: {
          walk: { clip: "uniform-march" },
          melee: { clip: "sword-effort" },
          release: null,
        },
      },
    },
    clips: [
      { name: "uniform-march", duration: 1.6, loop: true },
      { name: "sword-effort", duration: 0.8, loop: false },
    ],
  };
  assert.deepEqual(roleClip(asset, "walk"), asset.clips[0]);
  assert.deepEqual(roleClip(asset, "melee"), asset.clips[1]);
  assert.equal(roleClip(asset, "release", { optional: true }), null);
  assert.throws(() => roleClip(asset, "hit"), /Missing.*hit/);
  asset.manifest.presentation.actions.walk.clip = "not-exported";
  assert.throws(() => roleClip(asset, "walk"), /not-exported/);
});

test("registry-derived artifact names preserve every existing card consumer URL", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../../packages/soldier-assets/assets/cards/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  for (const [id, filename] of Object.entries(manifest))
    assert.equal(`${artifactStem(appearances[Number(id)])}.png`, filename);
  assert.equal(artifactStem(appearances[8]), "08-artillery");
  assert.deepEqual(selectedAppearances("8,0,8").map(artifactStem), [
    "08-artillery",
    "00-heavy-sword",
  ]);
  assert.throws(() => selectedAppearances("-1"), /Unknown appearance/);
});

test("static review accepts zero-duration holds and an inapplicable melee action", () => {
  const asset = {
    manifest: {
      presentation: {
        actions: {
          ready: { clip: "stand" },
          atEase: { clip: "stand" },
          walk: { clip: "step" },
          melee: null,
          release: { clip: "loose" },
        },
      },
    },
    clips: [
      { name: "stand", duration: 0, loop: true },
      { name: "step", duration: 1, loop: true },
      { name: "loose", duration: 0.8, loop: false },
    ],
  };
  assert.equal(roleClip(asset, "ready").name, "stand");
  assert.deepEqual(
    sheetSamples(asset).map(({ clip }) => clip.name),
    ["stand", "stand", "loose", "step"],
  );
  asset.manifest.presentation.actions.release = null;
  assert.deepEqual(
    sheetSamples(asset).map(({ clip }) => clip.name),
    ["stand", "stand", "step"],
  );
  assert.equal(roleClip(asset, "melee", { optional: true }), null);
});
