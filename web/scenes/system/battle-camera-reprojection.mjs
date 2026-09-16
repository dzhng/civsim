import { battleRendererReady } from "../worlds.mjs";

export const meta = {
  name: "battle-camera-reprojection",
  kind: "flow",
  world: "production-battle-camera",
  tier: "full",
  snapshots: [],
  describe:
    "Camera-only renders refresh crowd visibility from submitted state without duplicate pose uploads.",
};

export async function run(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    let game;
    Object.defineProperty(window, "__game", {
      configurable: true,
      get: () => game,
      set(value) {
        game = value;
        value?.freeze(true);
      },
    });
  });
  await page.goto(`${ctx.target}/?map=gen&seed=7&ai=off`);
  await battleRendererReady(page, 120000);
  await page.evaluate(() => window.__game.freezeAtTick(30));
  await page.evaluate(async () => {
    // Use the loaded module URL, including any Vite invalidation query. Importing
    // a second module copy would silently instrument an unused prototype.
    const loaded = (suffix) => {
      const entry = performance
        .getEntriesByType("resource")
        .find((item) => new URL(item.name).pathname.endsWith(suffix));
      if (!entry) throw Error(`Missing loaded renderer module: ${suffix}`);
      return entry.name;
    };
    const { PhotorealBattleWorld } = await import(
      loaded("/photoreal-renderer/src/battle/battleWorld.ts")
    );
    const { PhotorealCrowd } = await import(loaded("/photoreal-renderer/src/battle/crowdLayer.ts"));
    const counts = { draws: 0, uploads: 0 };
    const submit = PhotorealBattleWorld.prototype.submitInstances;
    const upload = PhotorealCrowd.prototype.uploadFrame;
    const probe = (window.__cameraReprojection = { counts, world: null });
    PhotorealBattleWorld.prototype.submitInstances = function (...args) {
      probe.world = this;
      counts.draws++;
      return submit.apply(this, args);
    };
    PhotorealCrowd.prototype.uploadFrame = function (...args) {
      counts.uploads++;
      return upload.apply(this, args);
    };
  });
  for (let step = 0; step < 20; step++) {
    await page.evaluate(async (step) => {
      window.__cam.setViewCenter(-160 + step * 5, -600 + step);
      await new Promise(requestAnimationFrame);
    }, step);
  }
  const result = await page.evaluate(() => {
    const { world, counts } = window.__cameraReprojection;
    if (!world) throw Error("Production crowd hook was not reached");
    const normal = { ...counts },
      initial = counts.uploads;
    world.render();
    world.render();
    const repeated = counts.uploads - initial;
    const before = world.crowd.debugSoldierAnim(0).root;
    const borrowed = world.instances[0],
      oldX = borrowed.x,
      camera = world.lastCamera;
    try {
      borrowed.x += 1000;
      world.setCamera({
        ...camera,
        camera3d: {
          ...camera.camera3d,
          target: [
            camera.camera3d.target[0] + 400,
            camera.camera3d.target[1],
            camera.camera3d.target[2],
          ],
        },
      });
      world.render();
      const changed = counts.uploads - initial - repeated;
      const after = world.crowd.debugSoldierAnim(0).root;
      world.render();
      return {
        normal,
        repeated,
        changed,
        changedRepeat: counts.uploads - initial - repeated - changed,
        before,
        after,
      };
    } finally {
      borrowed.x = oldX;
      world.setCamera(camera);
      world.render();
    }
  });
  ctx.check(
    "ordinary draw/render prepares poses once",
    result.normal.draws >= 10 && result.normal.draws === result.normal.uploads,
    JSON.stringify(result.normal),
  );
  ctx.check(
    "unchanged renders do not repeat pose preparation",
    result.repeated === 0 && result.changedRepeat === 0,
    JSON.stringify(result),
  );
  ctx.check(
    "camera change refreshes audience exactly once",
    result.changed === 1,
    JSON.stringify(result),
  );
  ctx.check(
    "camera refresh keeps submitted positions",
    result.before.every((value, i) => value === result.after[i]),
    JSON.stringify({ before: result.before, after: result.after }),
  );
}
