import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { loadAppearanceCatalog } from "../src/appearanceBundle.ts";
import { APPEARANCE_DESCRIPTORS } from "../src/appearance.ts";
import { decodeLocalSample, resolveLocalSample } from "../src/localAnimation.ts";
import { localPoseToJointMatrices } from "../src/localPose.ts";
import { poseSoldierMesh } from "../src/skin.ts";

const root = new URL("../assets/candidates/", import.meta.url);
const server = createServer(async (request, response) => {
  try {
    response.end(await readFile(new URL(request.url.slice(1), root)));
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  const base = `http://127.0.0.1:${server.address().port}/`;
  for (const id of [3, 14, 16, 17, 18, 19]) {
    const name = APPEARANCE_DESCRIPTORS[id].name;
    const bundle = (await loadAppearanceCatalog(`${base}${name}/catalog.json`))[id];
    assert.ok(bundle.manifest.presentation, `${name} must be playable, not a null study`);
    const actions = bundle.manifest.presentation.actions;
    const pose = (role, phase = 0) =>
      decodeLocalSample(
        bundle.animation,
        resolveLocalSample(bundle.animation, actions[role].clip, phase),
      );
    assert.notDeepEqual(pose("melee"), pose("melee", 0.38), `${name} has real effort`);
    assert.notDeepEqual(pose("death"), pose("death", 1), `${name} has real fall`);
    assert.equal(actions.release, null, `${name} has no invented projectile release`);
    assert.ok(bundle.tiers[1].indices.length < bundle.tiers[0].indices.length);
    assert.ok(bundle.tiers[2].indices.length < bundle.tiers[1].indices.length);
    if (id === 18 || id === 19) {
      assert.equal(actions.pikeReady, null, `${name} cannot lower a discarded pike`);
    } else {
      const highest = (role) => {
        const positions = poseSoldierMesh(
          bundle.tiers[0],
          localPoseToJointMatrices(bundle.rig, pose(role)),
        ).positions;
        let height = -Infinity;
        for (let i = 2; i < positions.length; i += 3) height = Math.max(height, positions[i]);
        return height;
      };
      // The standing upright pike must extend well above the body; the held
      // hedge lies near waist height. This tests the submitted mesh, not names.
      assert.ok(
        highest("atEase") > highest("pikeReady") * 2,
        `${name}: upright=${highest("atEase")}, held=${highest("pikeReady")}`,
      );
    }
  }
  console.log(
    "pike family: six HTTP-admitted bindings, real action motion, upright/held geometry and reduced tiers passed",
  );
} finally {
  server.close();
}
