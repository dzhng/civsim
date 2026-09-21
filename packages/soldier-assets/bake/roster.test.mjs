import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { APPEARANCE_DESCRIPTORS } from "../src/appearance.ts";
import { encodeSoldierMesh, loadAppearanceBundle } from "../src/appearanceBundle.ts";
import { bakeRosterAppearance, rosterRecipe } from "./roster.mjs";

const root = resolve(process.argv[2] ?? "web/public/assets/soldiers");
const catalog = JSON.parse(await readFile(resolve(root, "catalog.json"), "utf8"));
const names = process.argv.slice(3);
// Exercise the real loader with local build output at its fetch boundary.
globalThis.fetch = async (url) => {
  const path = new URL(url).pathname;
  try {
    return new Response(await readFile(resolve(root, `.${path}`)));
  } catch {
    return new Response(null, { status: 404 });
  }
};
if (!names.length)
  assert.deepEqual(
    Object.keys(catalog.appearances),
    APPEARANCE_DESCRIPTORS.map((_, id) => String(id)),
  );
for (const [id, descriptor] of APPEARANCE_DESCRIPTORS.entries()) {
  if (names.length && !names.includes(descriptor.name)) continue;
  const path = catalog.appearances[id];
  assert.ok(path, `${descriptor.name}: missing catalog row`);
  const bundle = await loadAppearanceBundle(`http://roster.test/${path}`);
  const recipe = await rosterRecipe(descriptor);
  assert.equal(bundle.manifest.name, descriptor.name);
  assert.deepEqual(bundle.manifest.presentation, recipe.presentation);
  const triangles = bundle.tiers.map((mesh) => mesh.indices.length / 3);
  assert.ok(
    triangles.every((count, tier) => tier === 0 || count < triangles[tier - 1]),
    `${descriptor.name}: expected actual reduced geometry, got ${triangles}`,
  );
  const expected = await bakeRosterAppearance(descriptor);
  for (const [tier, mesh] of bundle.tiers.entries())
    assert.deepEqual(
      encodeSoldierMesh(mesh),
      JSON.parse(JSON.stringify(expected[`tier-${tier}.mesh.json`])),
      `${descriptor.name}: loaded tier ${tier} differs from the source bake`,
    );
  assert.equal(bundle.manifest.far.clip, recipe.presentation.actions.ready.clip);
  console.log(
    `${descriptor.name}: actual loader, authored source, roles and decreasing tiers pass`,
  );
}
