import { PNG } from "pngjs";
import { snapshotSelected } from "../../snapshot.mjs";

export const meshLodSnapshots = (folder) =>
  ["mesh-lod-context", "mesh-lod-diagnostic"].map((name) => `shared/soldiers/${folder}/${name}`);

/** Inspect real admitted tiers, then magnify without a second crowd upload. */
export async function captureMeshLods(ctx, page, { folder, classId, ready, attack, zoom }) {
  const names = meshLodSnapshots(folder);
  if (!names.some((name) => snapshotSelected(name))) return;
  const crop = { x: 320, y: 96, width: 640, height: 640 };
  const sheets = [new PNG({ width: 1920, height: 1920 }), new PNG({ width: 1920, height: 1920 })];
  const poses = [
    [ready, 0, true],
    [attack, 0.4, true],
    ["death", 1, false],
  ];
  const nearDarkPixels = [];
  for (let row = 0; row < poses.length; row++) {
    for (let tier = 0; tier < 3; tier++) {
      const [clip, phase, alive] = poses[row];
      const result = await page.evaluate(
        async ({ classId, clip, phase, alive, zoom, tier }) => {
          const h = window.__battleModels;
          h.set({
            classId,
            clip,
            phase,
            alive,
            formation: false,
            yaw: 0.8,
            pitch: 1.15,
            zoom,
            target: [0, 0, 0.9],
          });
          while (h.stats().pendingDraw) await new Promise(requestAnimationFrame);
          // Three caches camera uniforms within its browser frame. Admission
          // must render after the workbench's close-pose frame has completed.
          await new Promise(requestAnimationFrame);
          const world = h.world;
          const inspection = structuredClone(world.stats().camera);
          const admission = structuredClone(inspection);
          // Actual perspective distance, not the chart's screen-scale hint.
          if (tier > 0)
            Object.assign(admission.camera3d, { distance: tier === 1 ? 120 : 260, fovY: 0.85 });
          world.drawInstances(
            [
              {
                x: 0,
                y: 0,
                elevation: 0,
                facing: Math.PI / 2,
                classId,
                faction: 0,
                alive,
                frame: 0,
                clip,
                phase,
                seed: 0,
                mounted: false,
                lod: 0,
              },
            ],
            admission,
          );
          document.querySelector("#candidate-caption").textContent =
            `${clip} ${phase} · tier ${tier}\nActual production projection`;
          world.render();
          await world.settlePresentedFrame();
          return { inspection, stats: world.stats() };
        },
        { classId, clip, phase, alive, zoom, tier },
      );
      ctx.check(
        `${folder}/${clip}/tier${tier}: actual main tier admitted`,
        result.stats.crowd.visibleTierHistogram[`l${tier}`] === 1 && result.stats.lod.skinned === 1,
        JSON.stringify(result.stats.crowd.visibleTierHistogram),
      );
      for (let view = 0; view < 2; view++) {
        if (view === 1)
          await page.evaluate(
            async ({ camera, clip, phase, tier }) => {
              const world = window.__battleModels.world;
              world.setCamera(camera);
              document.querySelector("#candidate-caption").textContent =
                `${clip} ${phase} · tier ${tier}\nMagnified geometry diagnostic`;
              world.render();
              await world.settlePresentedFrame();
            },
            { camera: result.inspection, clip, phase, tier },
          );
        const shot = await page.screenshot({ clip: crop });
        ctx.check(
          `${folder}/${clip}/tier${tier}/view${view}: frozen pixels exact`,
          shot.equals(await page.screenshot({ clip: crop })),
        );
        const image = PNG.sync.read(shot);
        if (view === 0) {
          // Central body region stays within the green inspection pad at every
          // distance; outer grass is dark and is not a silhouette-size signal.
          let darkPixels = 0;
          for (let y = 260; y < 380; y++)
            for (let x = 240; x < 400; x++) {
              const offset = (y * image.width + x) * 4;
              if (
                image.data[offset] < 110 &&
                image.data[offset + 1] < 110 &&
                image.data[offset + 2] < 110
              )
                darkPixels++;
            }
          if (tier === 0) nearDarkPixels[row] = darkPixels;
          else
            ctx.check(
              `${folder}/${clip}/tier${tier}: rendered context shrinks below quarter near dark area`,
              nearDarkPixels[row] > 0 && darkPixels < nearDarkPixels[row] / 4,
              JSON.stringify({ near: nearDarkPixels[row], context: darkPixels }),
            );
        }
        PNG.bitblt(image, sheets[view], 0, 0, 640, 640, tier * 640, row * 640);
      }
    }
  }
  for (let view = 0; view < 2; view++)
    if (snapshotSelected(names[view]))
      await ctx.snap(page, names[view], {
        shot: PNG.sync.write(sheets[view]),
        threshold: 0,
        maxDiffRatio: 0,
      });
}
