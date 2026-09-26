import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
export const meta = {
  name: "campaign-raised-labels",
  kind: "visual",
  world: "none",
  tier: "full",
  snapshots: ["campaign-raised-labels-dpr1", "campaign-raised-labels-dpr2"],
  describe: "Shared atlas labels follow presented terrain and resize.",
};
export async function run(ctx) {
  for (const dpr of [1, 2]) {
    const page = await ctx.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: dpr,
      errorPrefix: `raised-labels-${dpr}`,
    });
    await page.goto(`${ctx.target}/renderer/campaign-composition?ref=1&labels=1`);
    await page.waitForFunction(() => window.__rendererLabReady, undefined, { timeout: 90000 });
    await page.waitForTimeout(1000);
    const stats = () => page.evaluate(() => window.__rendererLabStats.stats);
    const before = await stats();
    ctx.check(
      `DPR${dpr} atlas draws accepted labels`,
      before.labels.visibleLabels === 3 && before.labels.vertices === 18,
      JSON.stringify(before.labels),
    );
    ctx.check(
      `DPR${dpr} no DOM label substitute`,
      (await page.locator("[data-entity]").count()) === 0,
    );
    await ctx.snap(null, `campaign-raised-labels-dpr${dpr}`, {
      threshold: 0,
      maxDiffRatio: 0,
      shot: await page.screenshot(),
    });
    const cameraChecks = await page.evaluate(
      async ({ dpr, root }) => {
        const first = window.__campaignComposition.world();
        const { PhotorealCampaignWorld } = await import(
          `${root}packages/photoreal-renderer/src/campaign/campaignWorld.ts`
        );
        const { chartCamera3d } = await import(`${root}packages/renderer-core/src/camera3d.ts`);
        const second = await PhotorealCampaignWorld.create(
          document.createElement("canvas"),
          first.composition,
        );
        try {
          const pose = chartCamera3d({ x: 6, y: -3, zoom: 5, pitch: 0.9 }, 800);
          pose.aspect = 1280 / 800;
          pose.target = [6, -3, 8];
          first.setFrameCamera(pose, 1280, 800, dpr);
          second.setFrameCamera({ ...pose, target: [-35, -32, 8] }, 900, 600, dpr);
          const retained = first.project(6, -3, 8);
          const retainedAnchors = first.anchors();
          const saved = JSON.stringify([retained, retainedAnchors]);
          const other = JSON.stringify(second.project(6, -3, 8));
          // The middle box of the army's front row; a ray through its centre hits it.
          const ground = first.surface.sampleRendered(35, -25).position[2];
          pose.target[0] = 35;
          pose.target[1] = -26.5;
          pose.target[2] = ground + 1.8;
          pose.distance *= 0.75;
          pose.aspect = 1100 / 700;
          first.setFrameCamera(pose, 1100, 700, dpr);
          // No draw or asynchronous yield between accepting the camera and querying it.
          const centre = first.project(...pose.target);
          const picked = first.pick(550, 350);
          const anchors = first.anchors();
          return {
            centred: Math.hypot(centre.x - 550, centre.y - 350) < 0.01 && centre.visible,
            picked,
            independent: JSON.stringify(second.project(6, -3, 8)) === other,
            retained: JSON.stringify([retained, retainedAnchors]) === saved,
            anchorsMoved: anchors.some(
              (a, i) => a.x !== retainedAnchors[i].x || a.y !== retainedAnchors[i].y,
            ),
          };
        } finally {
          second.dispose();
          window.__campaignComposition.draw();
        }
      },
      { dpr, root: `/@fs${fileURLToPath(new URL("../../../", import.meta.url))}` },
    );
    ctx.check(
      `DPR${dpr} pre-draw pan/zoom/resize projects and picks the accepted pose`,
      cameraChecks.centred && cameraChecks.picked === "army",
      JSON.stringify(cameraChecks),
    );
    ctx.check(
      `DPR${dpr} two worlds and retained public results remain independent`,
      cameraChecks.independent && cameraChecks.retained && cameraChecks.anchorsMoved,
      JSON.stringify(cameraChecks),
    );
    const drawn = PNG.sync.read(await page.screenshot());
    await page.evaluate(() => window.__campaignComposition.glyphs(false));
    const hidden = PNG.sync.read(await page.screenshot());
    for (const rect of [
      ...before.labels.visibleCityLabelRects,
      ...before.labels.visibleArmyLabelRects,
    ]) {
      const ink = rect.inkRect;
      let changes = 0;
      for (
        let y = Math.max(0, Math.floor(ink.y * dpr));
        y < Math.min(drawn.height, Math.ceil((ink.y + ink.h) * dpr));
        y++
      )
        for (
          let x = Math.max(0, Math.floor(ink.x * dpr));
          x < Math.min(drawn.width, Math.ceil((ink.x + ink.w) * dpr));
          x++
        ) {
          const i = (y * drawn.width + x) * 4;
          if (
            Math.abs(drawn.data[i] - hidden.data[i]) +
              Math.abs(drawn.data[i + 1] - hidden.data[i + 1]) +
              Math.abs(drawn.data[i + 2] - hidden.data[i + 2]) >
            10
          )
            changes++;
        }
      ctx.check(
        `DPR${dpr} accepted ink is actually drawn: ${rect.text}`,
        changes > 20,
        `${changes} changed pixels`,
      );
    }
    await page.evaluate(() => window.__campaignComposition.glyphs(true));
    const card = before.labels.visibleArmyLabelRects.find((r) => r.text === "Field army").inkRect;
    await page.evaluate((rect) => window.__campaignComposition.blockers([rect]), card);
    ctx.check(
      `DPR${dpr} card occupancy culls army label`,
      !(await stats()).labels.visibleArmyLabelRects.some((r) => r.text === "Field army"),
    );
    await page.evaluate(() => window.__campaignComposition.blockers([]));
    await page.evaluate(() => window.__campaignComposition.installDetail(true));
    const raised = await stats();
    const army = (s) => s.labels.visibleArmyLabelRects.find((r) => r.text === "Field army").inkRect;
    ctx.check(
      `DPR${dpr} replacement moves accepted army ink`,
      army(raised).y < army(before).y - 5,
      JSON.stringify({ before: army(before), after: army(raised) }),
    );
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.evaluate(() => window.__campaignComposition.draw());
    const resized = await stats();
    ctx.check(`DPR${dpr} resize refreshes ink`, army(resized).x !== army(raised).x);
    await page.locator("#composition-fog").click();
    ctx.check(
      `DPR${dpr} fog removes hidden army ink`,
      !(await stats()).labels.visibleArmyLabelRects.some((r) => r.text === "Field army"),
    );
    await page.locator("#composition-reset").click();
    await page.waitForFunction(() => window.__rendererLabStats.stats.generation === 1);
    ctx.check(
      `DPR${dpr} recreated world retains one canvas and visible labels`,
      (await page.locator("canvas").count()) === 1 && (await stats()).labels.visibleLabels > 0,
    );
    await page.close();
  }
}
