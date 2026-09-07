import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { snapshotSelected } from "../../snapshot.mjs";
import { encodeGif, pngToRGBA } from "../../shots/_gif.mjs";

// Held-hedge + atEase candidate only. Prescribed travel is not a runtime binding.
const views = [
  { name: "whole-side", yaw: -Math.PI / 2, zoom: 150, z: 0.95 },
  { name: "whole-oblique", yaw: -Math.PI / 3, zoom: 150, z: 0.95 },
  { name: "whole-right", yaw: Math.PI / 3, zoom: 150, z: 0.95 },
  { name: "pike-side", yaw: -Math.PI / 2, zoom: 90, z: 2.4 },
  { name: "pike-oblique", yaw: -Math.PI / 3, zoom: 90, z: 2.4 },
  { name: "front-whole", yaw: Math.PI, zoom: 200, z: 0.95, frames: 1 },
  { name: "front-grip", yaw: Math.PI + 0.25, zoom: 320, z: 1.3, frames: 1 },
  { name: "rear-grip", yaw: -0.25, zoom: 320, z: 1.3, frames: 1 },
];
const prefix = "shared/soldiers/medium-phalanx/walk";
const motions = [
  { clip: "walk", speed: 1.7, duration: 0.9, distance: 1.53, frames: 36 },
  // Prescribed engine target, not an assertion that the source is ground-locked.
  { clip: "run", speed: 3.23, duration: 0.8, distance: 2.584, frames: 32 },
];
const name = (motion, view, frame) =>
  `shared/soldiers/medium-phalanx/${motion.clip}-${view.name}-${String(frame).padStart(2, "0")}`;
export const mediumTravelSnapshots = [
  ...motions.flatMap((motion) =>
    views
      .filter((view) => motion.clip === "walk" || !view.frames)
      .flatMap((view) =>
        Array.from({ length: view.frames ?? motion.frames }, (_, i) => name(motion, view, i)),
      ),
  ),
  ...[0.9, 0.42].map((pitch) => `${prefix}-formation-${pitch}`),
];

export async function captureMediumTravel(ctx, page) {
  if (!mediumTravelSnapshots.some((snapshot) => snapshotSelected(snapshot))) return;
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = new URL("../../../throwaway/medium-travel/", import.meta.url);
  await mkdir(directory, { recursive: true });
  // Match the reviewed caption-free film; static sheet captions remain unchanged.
  await page.evaluate(() => {
    document.querySelector("#candidate-caption").style.display = "none";
  });
  const reports = [];
  for (const motion of motions) {
    for (const view of views.filter((view) => motion.clip === "walk" || !view.frames)) {
      const count = view.frames ?? motion.frames;
      if (
        !Array.from({ length: count }, (_, i) => name(motion, view, i)).some((snapshot) =>
          snapshotSelected(snapshot),
        )
      )
        continue;
      await page.evaluate(
        ({ view, motion }) => {
          window.__battleModels.set({
            classId: 14,
            clip: motion.clip,
            phase: 0,
            formation: false,
            yaw: view.yaw,
            pitch: 1.4,
            zoom: view.zoom,
            target: [0, motion.distance, view.z],
          });
        },
        { view, motion },
      );
      await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw);
      await page.evaluate(
        async ({ root, motion }) => {
          const { modelInstances } = await import(
            `/@fs${root}apps/renderer-lab/src/battleModelFixture.ts`
          );
          const { travelInstances } = await import(
            `/@fs${root}web/scenes/models/_travel-sample.mjs`
          );
          const h = window.__battleModels,
            w = h.world;
          const camera = structuredClone(w.stats().camera);
          const source = modelInstances(h.stats().pose, w.soldierAssets);
          const clip = w.soldierAssets[14].animation.clips.find(
            (clip) => clip.name === motion.clip,
          );
          if (Math.abs(clip.duration - motion.duration) > 1e-6)
            throw new Error(`Medium ${motion.clip} timing needs review`);
          window.__mediumTravel = async (seconds) => {
            const instances = travelInstances(source, seconds, motion.speed, motion.duration);
            w.setTime(0);
            w.drawInstances(instances, camera);
            await w.settlePresentedFrame();
            w.render();
            await w.world.settlePresentedFrame();
            return {
              instance: instances[0],
              sampled: w.debugSoldierAnim(0),
              count: w.stats().soldiers,
            };
          };
        },
        { root, motion },
      );
      const draw = async (seconds) => {
        const state = await page.evaluate((seconds) => window.__mediumTravel(seconds), seconds);
        return {
          state,
          shot: await page.screenshot({ clip: { x: 128, y: 96, width: 1024, height: 640 } }),
        };
      };
      const first = await draw(0),
        distant = await draw(1.125),
        reset = await draw(0);
      ctx.check(
        `${motion.clip}/${view.name}: absolute time reset is exact`,
        first.shot.equals(reset.shot) &&
          JSON.stringify(first.state) === JSON.stringify(reset.state),
      );
      const dx = distant.state.instance.x - first.state.instance.x;
      const dy = distant.state.instance.y - first.state.instance.y;
      ctx.check(
        `${motion.clip}/${view.name}: prescribed forward travel reaches submission`,
        Math.abs(Math.hypot(dx, dy) - motion.speed * 1.125) < 1e-9 &&
          dx * Math.cos(first.state.instance.facing) + dy * Math.sin(first.state.instance.facing) >
            0,
      );
      const images = [],
        states = [];
      for (let frame = 0; frame < count; frame++) {
        const snapshot = name(motion, view, frame);
        if (!snapshotSelected(snapshot)) continue;
        const sample = await draw(frame / 20),
          repeat = await draw(frame / 20);
        ctx.check(`${snapshot}: frozen frame repeats`, sample.shot.equals(repeat.shot));
        ctx.check(
          `${snapshot}: manual ${motion.clip} reaches production`,
          sample.state.count === 1 &&
            sample.state.sampled.clip === motion.clip &&
            Math.abs(sample.state.sampled.phase - sample.state.instance.phase) < 1e-6,
        );
        await ctx.snap(null, snapshot, { shot: sample.shot, threshold: 0, maxDiffRatio: 0 });
        images.push(pngToRGBA(sample.shot));
        states.push(sample.state);
      }
      if (images.length === motion.frames)
        await writeFile(
          new URL(`${motion.clip === "walk" ? "" : "run-"}${view.name}.gif`, directory),
          encodeGif(images, 1024, 640, 5),
        );
      reports.push({ motion, view, states });
    }
  }
  // Preserve the matched lab formation; its 1.6 m spacing is not dense engine admission.
  for (const pitch of [0.9, 0.42]) {
    const snapshot = `${prefix}-formation-${pitch}`;
    if (!snapshotSelected(snapshot)) continue;
    const previous = await page.evaluate((pitch) => {
      const h = window.__battleModels,
        frame = h.stats().frame;
      h.set({
        classId: 14,
        clip: "walk",
        phase: 0.25,
        formation: true,
        target: [0, 0.4, 2.15],
        yaw: Math.PI / 3,
        pitch,
        zoom: 44,
      });
      return frame;
    }, pitch);
    await page.waitForFunction((frame) => window.__battleModels.stats().frame > frame, previous);
    await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
    const shot = await page.screenshot({ clip: { x: 128, y: 96, width: 1024, height: 640 } });
    await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
    ctx.check(
      `${snapshot}: frozen formation repeats`,
      shot.equals(await page.screenshot({ clip: { x: 128, y: 96, width: 1024, height: 640 } })),
    );
    await ctx.snap(null, snapshot, { shot, threshold: 0, maxDiffRatio: 0 });
  }
  await writeFile(new URL("submission.json", directory), JSON.stringify(reports, null, 2));
}
