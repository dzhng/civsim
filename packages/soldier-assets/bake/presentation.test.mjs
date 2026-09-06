import assert from "node:assert/strict";
import { bakePlaceholder } from "./soldier-placeholders.mjs";
import { loadAppearanceBundle, loadAppearanceCatalog } from "../src/appearanceBundle.ts";
import { bakeAppearance } from "./appearance.mjs";
import { APPEARANCE_DESCRIPTORS } from "../src/appearance.ts";
import { assertPresentationMotion } from "./presentation.mjs";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { bakeRig } from "./vat.mjs";

const { files } = await bakePlaceholder({ write: false });
const sword = files["appearances/heavy-sword/appearance.json"];
assert.equal(
  sword.presentation?.actions.release,
  null,
  "swords have explicitly inapplicable release, not a blanket shooting clip",
);

const server = createServer((request, response) => {
  const value = files[request.url.slice(1)];
  response.writeHead(value ? 200 : 404).end(JSON.stringify(value));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}/`;
try {
  const catalog = await loadAppearanceCatalog(`${base}catalog.json`);
  const releases = new Map();
  const states = new Set();
  for (const [id, bundle] of Object.entries(catalog)) {
    assert.deepEqual(bundle.manifest.presentation, APPEARANCE_DESCRIPTORS[id].presentation);
    const selection = APPEARANCE_DESCRIPTORS[id].selection;
    const key = `${selection.unitClass}/${selection.state}`;
    assert.ok(!states.has(key), `ambiguous appearance selection ${key}`);
    states.add(key);
    const binding = bundle.manifest.presentation.actions.release;
    if (binding) {
      releases.set(Number(id), binding.clip);
      const clip = bundle.animation.clips.find((clip) => clip.name === binding.clip);
      assert.equal(
        clip.markers.release,
        bundle.rig.clips.find((source) => source.name === clip.name).markers.release,
      );
      assert.ok(clip.markers.release > 0 && clip.markers.release < 1);
      assert.equal(binding.layer, bundle.manifest.mounted ? "riderUpperBody" : "fullBody");
    }
  }
  assert.deepEqual(
    [...releases],
    [
      [4, "bow_release"],
      [5, "throw_release"],
      [7, "bow_release"],
      [8, "crew_release"],
    ],
  );
  assert.deepEqual(
    APPEARANCE_DESCRIPTORS.slice(15).map((d) => d.selection),
    [
      { unitClass: 6, state: "sidearm" },
      { unitClass: 3, state: "atEase" },
      { unitClass: 14, state: "atEase" },
      { unitClass: 3, state: "sidearm" },
      { unitClass: 14, state: "sidearm" },
    ],
  );
  assert.deepEqual(
    Object.entries(catalog)
      .filter(([, b]) => b.manifest.presentation.actions.pikeReady)
      .map(([id]) => Number(id)),
    [3, 14],
  );

  const path = "appearances/horse-archers/appearance.json";
  const original = structuredClone(files[path]);
  const animation = files["baked/human-placeholder.vat.json"];
  const release = animation.clips.find((clip) => clip.name === "bow_release");
  const load = () => loadAppearanceBundle(`${base}${path}`);
  files[path] = structuredClone(original);
  files[path].presentation.actions.release.clip = "missing_release_motion";
  await assert.rejects(
    load,
    /presentation release.*missing_release_motion/,
    "authoring errors name both the role and missing source clip",
  );
  files[path] = original;
  for (const mutate of [
    (p) => delete p.presentation,
    (p) => delete p.presentation.actions.hit,
    (p) => (p.presentation.actions.hit = null),
    (p) => (p.presentation.actions.death.clip = "idle"),
    (p) => (p.presentation.actions.release.clip = "attack_a"),
    (p) => (p.presentation.riderUpperBodyJoints = ["missing"]),
    (p) => (p.presentation.riderUpperBodyJoints = ["spine", "spine"]),
    (p) => (p.presentation.actions.death.layer = "riderUpperBody"),
  ]) {
    files[path] = structuredClone(original);
    mutate(files[path]);
    await assert.rejects(load, /presentation|release|mask|layer/);
  }
  files[path] = original;
  for (const marker of [NaN, Infinity, -0.01, 1.01, "0.5", null]) {
    release.markers.release = marker;
    await assert.rejects(load, /release marker/);
  }
  for (const marker of [0, 1]) {
    release.markers.release = marker;
    assert.equal(
      (await load()).animation.clips.find((c) => c.name === "bow_release").markers.release,
      marker,
    );
  }
  release.markers.release = 0.55 / 0.75;
  files[path] = { ...original, presentation: null };
  assert.equal(
    (await load()).manifest.presentation,
    null,
    "manual-only diagnostic bundle loads without inventing actions",
  );
  files[path] = original;

  const maskedRig = structuredClone(files["baked/human-placeholder.skeleton.json"]);
  const action = maskedRig.clips.find((c) => c.name === "bow_release");
  action.tracks = {};
  assert.throws(
    () => assertPresentationMotion(original.presentation, bakeRig(maskedRig, 12), maskedRig),
    /release.*no sampled motion/,
  );
  for (const joint of [5, 0]) {
    action.tracks = { [joint]: { T: { times: [0, 0.75], values: [0, 0, 0, 0.1, 0, 0] } } };
    const maskedAnimation = bakeRig(maskedRig, 12);
    assert.throws(
      () => assertPresentationMotion(original.presentation, maskedAnimation, maskedRig),
      /release.*no sampled motion/,
      "a masked-out leg or ancestor cannot make an upper-body action meaningful",
    );
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

const source = await readFile(
  new URL("../assets/test/blender-reference/human.glb", import.meta.url),
);
const options = {
  name: "source-markers",
  tiers: [source, source, source],
  fps: 24,
  loopClips: [],
  presentation: null,
};
const sourceBundle = bakeAppearance(options);
const clipName = sourceBundle["animation.json"].clips[0].name;
const marked = bakeAppearance({ ...options, clipMarkers: { [clipName]: { release: 0.37 } } });
assert.equal(marked["animation.json"].clips[0].markers.release, 0.37);
assert.equal(marked["skeleton.json"].clips[0].markers.release, 0.37);
assert.deepEqual(marked["animation.json"].data, sourceBundle["animation.json"].data);
assert.throws(
  () => bakeAppearance({ ...options, presentation: undefined }),
  /explicit presentation/,
);
assert.throws(
  () => bakeAppearance({ ...options, clipMarkers: { absent: { release: 0.5 } } }),
  /marker clip absent/,
);
assert.throws(
  () => bakeAppearance({ ...options, clipMarkers: { [clipName]: { release: 2 } } }),
  /release marker/,
);
console.log(
  "presentation: complete roster applicability, variant selection, HTTP admission, source markers and no-op rejection passed",
);
