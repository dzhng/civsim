import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { bakePlaceholder, placeholderRig } from "./soldier-placeholders.mjs";
import { loadAppearanceBundle, encodeSoldierMesh } from "../src/appearanceBundle.ts";
import { createPlaceholderSoldierMeshTiers } from "../src/soldierMesh.ts";
import { poseSoldierMesh } from "../src/skin.ts";
import {
  encodeLocalAnimation,
  decodeLocalSample,
  resolveLocalSample,
} from "../src/localAnimation.ts";
import { localPoseToJointMatrices } from "../src/localPose.ts";

const root = new URL("../assets/fixtures/placeholder-soldiers/", import.meta.url);
const server = createServer(async (request, response) => {
  try {
    const content = await readFile(new URL(`.${request.url}`, root));
    response.writeHead(200, { "Content-Type": "application/json" }).end(content);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  const base = `http://127.0.0.1:${server.address().port}/`;
  const catalog = await fetch(`${base}catalog.json`).then((response) => response.json());
  const source = createPlaceholderSoldierMeshTiers();
  const generated = await bakePlaceholder({ write: false });
  assert.equal(
    Object.hasOwn(generated.files, "kit.json"),
    false,
    "complete catalog is the sole generated roster",
  );
  assert.deepEqual(Object.keys(catalog.appearances), Object.keys(generated.descriptors));
  let checkedVertices = 0;
  let maximumRadiusFraction = 0;
  for (const [id, path] of Object.entries(catalog.appearances)) {
    const bundle = await loadAppearanceBundle(new URL(path, base).href);
    assert.equal(bundle.manifest.name, generated.descriptors[id].name);
    assert.equal(bundle.manifest.mounted, generated.descriptors[id].look.mounted);
    assert.deepEqual(
      bundle.rig,
      JSON.parse(
        JSON.stringify(placeholderRig(), (_key, value) =>
          ArrayBuffer.isView(value) ? Array.from(value) : value,
        ),
      ),
    );
    assert.deepEqual(encodeLocalAnimation(bundle.animation), generated.out);
    for (let tier = 0; tier < 3; tier++) {
      assert.equal(
        JSON.stringify(encodeSoldierMesh(bundle.tiers[tier])),
        JSON.stringify(encodeSoldierMesh(source[id][tier])),
      );
    }
    assert.ok(bundle.tiers[0].indices.length > bundle.tiers[1].indices.length);
    assert.ok(bundle.tiers[1].indices.length > bundle.tiers[2].indices.length);
    assert.equal(
      JSON.stringify(encodeSoldierMesh(bundle.farMesh)),
      JSON.stringify(encodeSoldierMesh(source[id][0])),
    );
    const { center, radius } = bundle.manifest.bounds;
    for (const mesh of [...bundle.tiers, bundle.farMesh]) {
      for (const clip of bundle.animation.clips)
        for (let frame = 0; frame <= Math.round(clip.duration * 12); frame++) {
          const locals = decodeLocalSample(
            bundle.animation,
            resolveLocalSample(
              bundle.animation,
              clip.name,
              frame / Math.max(1, Math.round(clip.duration * 12)),
            ),
          );
          const { positions } = poseSoldierMesh(mesh, localPoseToJointMatrices(bundle.rig, locals));
          for (let i = 0; i < positions.length; i += 3) {
            const distance = Math.hypot(...center.map((c, axis) => positions[i + axis] - c));
            assert.ok(
              distance <= radius,
              `appearance ${id} frame ${frame} escapes animated bounds`,
            );
            maximumRadiusFraction = Math.max(maximumRadiusFraction, distance / radius);
            checkedVertices++;
          }
        }
    }
  }
  const again = await bakePlaceholder({ write: false });
  assert.deepEqual(again.files, generated.files);
  for (const assetRoot of [
    root,
    new URL("../../../web/public/assets/soldiers/fixtures/placeholder-soldiers/", import.meta.url),
  ]) {
    for (const [path, expected] of Object.entries(generated.files)) {
      assert.equal(
        await readFile(new URL(path, assetRoot), "utf8"),
        `${JSON.stringify(expected, null, expected.indexFormat ? undefined : 2)}\n`,
      );
    }
  }
  const obsolete = await mkdtemp(new URL("appearances/obsolete-test-", root));
  try {
    await writeFile(`${obsolete}/appearance.json`, "{}");
    const check = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./soldier-placeholders.mjs", import.meta.url)), "--check"],
      { encoding: "utf8" },
    );
    assert.equal(check.status, 1);
    assert.ok(check.stderr.includes(`obsolete generated asset: ${obsolete}/appearance.json`));
  } finally {
    await rm(obsolete, { recursive: true });
  }
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./soldier-placeholders.mjs", import.meta.url)), "--check"],
    { stdio: "pipe" },
  );
  console.log(
    JSON.stringify({
      appearances: Object.keys(catalog.appearances).length,
      checkedVertices,
      maximumRadiusFraction,
      deterministic: true,
    }),
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
