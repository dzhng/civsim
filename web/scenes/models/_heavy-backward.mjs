import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { snapshotSelected } from "../../snapshot.mjs";
import { encodeGif, pngToRGBA } from "../../shots/_gif.mjs";

// Frozen 30Hz engine men-centroid trace, not individual self-propulsion proof.
const measured = JSON.parse(
  await readFile(new URL("./_heavy-backward-trace.json", import.meta.url)),
);
const clip = "guarded-backward-walk";
const views = [
  { view: "side", yaw: -Math.PI / 2 },
  { view: "oblique", yaw: -Math.PI / 3 },
];
const name = (view, frame) =>
  `shared/soldiers/heavy-kit/backward-${view}-${String(frame).padStart(2, "0")}`;
export const heavyBackwardSnapshots = views.flatMap(({ view }) =>
  Array.from({ length: 40 }, (_, frame) => name(view, frame)),
);

/** Two cycles at the reviewed vector trace; manual candidate selection only. */
export async function captureHeavyBackward(ctx, page) {
  if (!heavyBackwardSnapshots.some((key) => snapshotSelected(key))) return;
  if (!measured.allGuarded) throw new Error("Backward fixture lost its conscious guarded interval");
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = new URL("../../../throwaway/heavy-backward/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const submissions = [];
  for (const row of views) {
    if (
      !heavyBackwardSnapshots.some(
        (key) => key.includes(`backward-${row.view}`) && snapshotSelected(key),
      )
    )
      continue;
    await page.evaluate(
      ({ row, measured, clip }) => {
        const h = window.__battleModels;
        h.freeze();
        h.set({
          classId: 0,
          clip,
          phase: 0,
          formation: false,
          yaw: row.yaw,
          pitch: 1.4,
          zoom: 150,
          target: [0, -measured.measuredSpeed, 0.9],
        });
        document.querySelector("#candidate-caption").textContent =
          `Guarded backward walk · ${row.view}\nRecorded men-centroid travel · ${measured.measuredSpeed.toFixed(3)} m/s mean`;
      },
      { row, measured, clip },
    );
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
    const framing = await page.evaluate(
      async ({ root, measured, clip }) => {
        const { modelInstances } = await import(
          `/@fs${root}apps/renderer-lab/src/battleModelFixture.ts`
        );
        const h = window.__battleModels,
          w = h.world;
        const camera = structuredClone(w.stats().preparedCamera);
        const source = modelInstances(h.stats().pose, w.soldierAssets);
        const routeFrame = h.stats().frame;
        const duration = w.soldierAssets[0].animation.clips.find((c) => c.name === clip).duration;
        if (Math.abs(duration - 1) > 1e-6)
          throw new Error("Backward capture requires the reviewed one-second clip");
        window.__heavyBackwardFrame = async (seconds) => {
          const rows = measured.rootDisplacement;
          let i = 0;
          while (i + 1 < rows.length - 1 && rows[i + 1].seconds < seconds) i++;
          const a = rows[i],
            b = rows[i + 1],
            u = (seconds - a.seconds) / (b.seconds - a.seconds);
          const forward = a.x + (b.x - a.x) * u,
            lateral = a.y + (b.y - a.y) * u;
          const phase = (-forward / measured.measuredSpeed) % 1;
          const instances = source.map((s) => ({
            ...s,
            phase,
            x: s.x + Math.cos(s.facing) * forward - Math.sin(s.facing) * lateral,
            y: s.y + Math.sin(s.facing) * forward + Math.cos(s.facing) * lateral,
          }));
          w.setTime(0);
          await w.drawInstances(instances, camera);

          await w.render();

          return {
            seconds,
            forward,
            lateral,
            phase,
            instance: instances[0],
            sampled: w.debugSoldierAnim(0),
            routeFrame: h.stats().frame,
          };
        };
        return { camera, routeFrame, pose: h.stats().pose, catalog: h.stats().catalog };
      },
      { root, measured, clip },
    );
    const images = [],
      states = [];
    const draw = async (seconds) => ({
      state: await page.evaluate((t) => window.__heavyBackwardFrame(t), seconds),
      shot: await page.screenshot({ clip: { x: 128, y: 96, width: 1024, height: 640 } }),
    });
    for (let frame = 0; frame < 40; frame++) {
      const snapshot = name(row.view, frame);
      if (!snapshotSelected(snapshot)) continue;
      const sample = await draw(frame / 20),
        repeat = await draw(frame / 20);
      ctx.check(
        `${snapshot}: exact repeated frame`,
        sample.shot.equals(repeat.shot) &&
          JSON.stringify(sample.state) === JSON.stringify(repeat.state),
      );
      ctx.check(
        `${snapshot}: recorded backward travel reaches production`,
        sample.state.forward <= 0 &&
          sample.state.routeFrame === framing.routeFrame &&
          sample.state.sampled.clip === clip &&
          Math.abs(sample.state.sampled.phase - sample.state.phase) < 1e-6,
      );
      await ctx.snap(null, snapshot, { shot: sample.shot, threshold: 0, maxDiffRatio: 0 });
      images.push(pngToRGBA(sample.shot));
      states.push(sample.state);
    }
    if (images.length === 40)
      await writeFile(
        new URL(`backward-${row.view}.gif`, directory),
        encodeGif(images, 1024, 640, 5),
      );
    submissions.push({ view: row.view, framing, states });
  }
  await writeFile(
    new URL("submission.json", directory),
    JSON.stringify(submissions, null, 2) + "\n",
  );
}
