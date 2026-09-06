import { PNG } from "pngjs";
import { requireSwiftShaderBaseline } from "./_swiftshader-baseline.ts";

const names = [
  "near",
  "near-unshadowed",
  "near-authored-ao",
  "far",
  "far-half-properties",
  "far-dead",
  "far-nearest-properties",
];
export const meta = {
  name: "battle-model-far-grounding",
  kind: "visual",
  world: "battle-models-exact-view-material-diagnostic",
  tier: "full",
  snapshots: names.map((name) => `battle/far-grounding/${name}`),
  describe:
    "Exact representative view isolates material transfer and living contact AO; close explicit far selection is not production LOD quality acceptance.",
};

// Interior facets, not silhouette agreement: reject a pixel if either image
// changes by more than two codes in its 5x5 neighborhood. The camera/ROI and
// blue material are fixed below, so the mask cannot hide a changed threshold.
function interiorDifference(a, b) {
  const x = PNG.sync.read(a),
    y = PNG.sync.read(b),
    deltas = [];
  for (let py = 260; py < 520; py++)
    for (let px = 500; px < 780; px++) {
      const i = (py * x.width + px) * 4;
      if (x.data[i + 2] < x.data[i] + 20 || y.data[i + 2] < y.data[i] + 20) continue;
      let stable = true;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          for (let c = 0; c < 3; c++) {
            const j = ((py + dy) * x.width + px + dx) * 4 + c;
            if (Math.abs(x.data[j] - x.data[i + c]) > 2 || Math.abs(y.data[j] - y.data[i + c]) > 2)
              stable = false;
          }
      if (stable)
        deltas.push(Math.max(...[0, 1, 2].map((c) => Math.abs(x.data[i + c] - y.data[i + c]))));
    }
  deltas.sort((a, b) => a - b);
  return {
    count: deltas.length,
    mean: deltas.reduce((a, b) => a + b, 0) / deltas.length,
    max: deltas.at(-1),
    p99: deltas[Math.floor(deltas.length * 0.99)],
  };
}

export async function run(ctx) {
  requireSwiftShaderBaseline(meta.name);
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  const captures = {};
  try {
    await page.goto(`${ctx.target}/renderer/battle-models?ref=1`);
    await page.waitForFunction(() => window.__battleModels?.stats().frame >= 3, undefined, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__battleModels.freeze());
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    for (const name of names) {
      const state = await page.evaluate(async (name) => {
        const h = window.__battleModels,
          w = h.world,
          renderer = w.world.renderer;
        h.set({
          classId: 0,
          yaw: 0.15,
          pitch: 1.15,
          zoom: 80,
          formation: false,
          clip: "idle",
          phase: 0,
        });
        while (h.stats().pendingDraw) await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        window.__groundingSource ??= structuredClone(w.soldierAssets[0]);
        const bundle = structuredClone(window.__groundingSource),
          mesh = bundle.tiers[0];
        // Preserve geometry, actual normals, weights and animation. Identical detailed
        // mesh across tiers removes authored LOD geometry as a confounder.
        mesh.colors.fill(1);
        mesh.materialIds.fill(0);
        mesh.factionMasks.fill(0);
        bundle.tiers = [mesh, mesh, mesh];
        bundle.farMesh = mesh;
        bundle.surface.materials = [
          {
            name: "smooth-blue-control",
            baseColor: [0.035, 0.065, 0.24, 1],
            roughness: 0.08,
            metallic: 0,
          },
        ];
        const setTarget = renderer.setRenderTarget.bind(renderer);
        if (name === "far-nearest-properties")
          renderer.setRenderTarget = (target, ...args) => {
            // All property channels use the same filter so coverage division
            // stays matched. This isolates mixed-normal boundaries, not a
            // proposed production filtering change.
            if (target?.textures?.length === 3)
              for (const texture of target.textures) {
                texture.minFilter = 1003;
                texture.magFilter = 1003;
              }
            setTarget(target, ...args);
          };
        if (name === "far-half-properties")
          renderer.setRenderTarget = (target, ...args) => {
            if (target?.textures?.length === 3) {
              // Test-only precision control: normal/contact and ORM become
              // RGBA16F; filtering/coverage and production shader stay identical.
              target.textures[1].type = 1016;
              target.textures[2].type = 1016;
            }
            setTarget(target, ...args);
          };
        let replacement;
        try {
          replacement = await w.crowd.constructor.create(renderer, w.world.scene, { 0: bundle });
        } finally {
          renderer.setRenderTarget = setTarget;
        }
        w.crowd.dispose();
        w.crowd = replacement;
        w.soldierAssets = { 0: bundle };
        if (name === "near-unshadowed" || name === "near-authored-ao")
          for (const bucket of replacement.buckets[0]) {
            bucket.mesh.receiveShadow = false;
            if (name === "near-authored-ao") bucket.mesh.material.aoNode = null;
            bucket.mesh.material.needsUpdate = true;
          }
        const atlas = replacement.impostors[0].atlas,
          direction = atlas.directions[5];
        const camera = structuredClone(w.stats().camera);
        camera.camera3d.target = atlas.center.toArray();
        camera.camera3d.yaw = Math.atan2(direction.y, direction.x);
        camera.camera3d.pitch = Math.asin(direction.z);
        const oldDistance = camera.camera3d.distance;
        // Near-orthographic, not literally orthographic: preserve production
        // camera owner and projected center scale, suppress perspective drift.
        camera.camera3d.distance = 2000;
        camera.camera3d.fovY =
          2 * Math.atan((Math.tan(camera.camera3d.fovY / 2) * oldDistance) / 2000);
        if (name.startsWith("far")) camera.zoom = 0.9;
        const instance = {
          x: 0,
          y: 0,
          elevation: 0,
          facing: Math.PI / 2,
          classId: 0,
          faction: 0,
          alive: name !== "far-dead",
          frame: 0,
          clip: "idle",
          phase: 0,
          seed: 0,
          mounted: false,
          lod: 0,
        };
        w.drawInstances([instance], camera);
        w.render();
        await w.settlePresentedFrame();
        return {
          camera,
          lod: w.stats().lod,
          selectedTile: replacement.impostors[0].mesh.geometry
            .getAttribute("impostorMeta")
            ?.getX(0),
          allocatedBytes: atlas.metrics.allocatedBytes,
        };
      }, name);
      ctx.check(
        `${name}: requested representation`,
        name.startsWith("far")
          ? state.lod.impostors === 1 && state.selectedTile === 5
          : state.lod.skinned === 1,
        JSON.stringify(state),
      );
      // Half-float control intentionally changes its test-only allocation; all
      // production modes retain the same three RGBA8 mip chains plus depth.
      if (name !== "far-half-properties")
        ctx.check(
          `${name}: atlas allocation unchanged`,
          state.allocatedBytes === 11796456,
          String(state.allocatedBytes),
        );
      const shot = await page.screenshot();
      captures[name] = shot;
      await ctx.snap(page, `battle/far-grounding/${name}`, { shot, threshold: 0, maxDiffRatio: 0 });
      ctx.check(`${name}: frozen pixels`, shot.equals(await page.screenshot()));
    }
    const living = interiorDifference(captures["near-unshadowed"], captures.far);
    ctx.check(
      "living interior material response matches",
      living.count > 3000 && living.p99 <= 2 && living.max <= 3,
      JSON.stringify(living),
    );
    const dead = interiorDifference(captures["near-authored-ao"], captures["far-dead"]);
    ctx.check(
      "dead instances disable contact grounding",
      dead.count > 3000 && dead.p99 <= 2 && dead.max <= 3,
      JSON.stringify(dead),
    );
    const precision = interiorDifference(captures.far, captures["far-half-properties"]);
    ctx.check(
      "normal and ORM precision do not cause stronger highlights",
      precision.count > 3000 && precision.p99 <= 1,
      JSON.stringify(precision),
    );
    const active = interiorDifference(captures.far, captures["far-dead"]);
    ctx.check(
      "living contact factor actually affects lower body",
      active.max >= 10 && active.mean > 1,
      JSON.stringify(active),
    );
  } finally {
    await page.close();
  }
}
