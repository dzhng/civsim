import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { snapshotSelected } from "../../snapshot.mjs";
import { encodeGif, pngToRGBA } from "../../shots/_gif.mjs";

// Prescribed fixture speeds, not observed simulation travel. Two cycles expose wrap continuity.
const forwardCases = [
  { clip: "walk", speed: 1.7, duration: 0.9 },
  { clip: "run", speed: 3.23, duration: 0.8 },
].flatMap((motion) => [
  { ...motion, view: "side", yaw: -Math.PI / 2 },
  { ...motion, view: "oblique", yaw: -Math.PI / 3 },
]);
const cases = [
  ...forwardCases,
  ...[
    ["front", Math.PI],
    ["oblique", (2 * Math.PI) / 3],
  ].map(([view, yaw]) => ({
    clip: "guarded-left-walk",
    speed: 0.760776176053138,
    duration: 0.6,
    view,
    yaw,
    travelAngleOffset: Math.PI / 2,
  })),
  ...[
    ["front", Math.PI],
    ["rear", 0],
    ["oblique", (4 * Math.PI) / 3],
  ].map(([view, yaw]) => ({
    clip: "guarded-right-walk",
    speed: 0.9253140324024038,
    duration: 0.6,
    view,
    yaw,
    travelAngleOffset: -Math.PI / 2,
  })),
];
const name = (row, frame) =>
  `shared/soldiers/heavy-kit/travel-${row.clip}-${row.view}-${String(frame).padStart(2, "0")}`;
export const heavyTravelSnapshots = cases.flatMap((row) =>
  Array.from({ length: Math.round(row.duration * 40) }, (_, frame) => name(row, frame)),
);

export async function captureHeavyTravel(ctx, page) {
  if (!heavyTravelSnapshots.some((snapshot) => snapshotSelected(snapshot))) return;
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const reports = [];
  for (const row of cases) {
    const frames = Math.round(row.duration * 40);
    if (
      !Array.from({ length: frames }, (_, frame) => name(row, frame)).some((snapshot) =>
        snapshotSelected(snapshot),
      )
    )
      continue;
    await page.evaluate((row) => {
      const h = window.__battleModels;
      h.freeze();
      h.set({
        classId: 0,
        clip: row.clip,
        phase: 0,
        formation: false,
        yaw: row.yaw,
        pitch: 1.4,
        zoom: row.travelAngleOffset ? 150 : 125,
        target: row.travelAngleOffset
          ? [
              row.travelAngleOffset > 0 ? -row.speed * row.duration : row.speed * row.duration,
              0,
              0.9,
            ]
          : [0, row.speed * row.duration, 0.9],
      });
      document.querySelector("#candidate-caption").textContent = row.travelAngleOffset
        ? `Guarded lateral travel · ${row.view}\nPrescribed pure ${row.travelAngleOffset > 0 ? "left" : "right"} ${row.speed.toFixed(6)} m/s · review only`
        : `Heavy candidate · ${row.clip} · ${row.view}\nPrescribed ${row.speed} m/s · fixed camera · review only`;
    }, row);
    await page.waitForFunction(() => !window.__battleModels.stats().pendingDraw, undefined, {
      timeout: 30000,
    });
    const framing = await page.evaluate(
      async ({ root, row }) => {
        const { modelInstances } = await import(
          `/@fs${root}apps/renderer-lab/src/battleModelFixture.ts`
        );
        const { travelInstances } = await import(`/@fs${root}web/scenes/models/_travel-sample.mjs`);
        const h = window.__battleModels,
          w = h.world;
        const camera = structuredClone(w.stats().camera);
        const source = modelInstances(h.stats().pose, w.soldierAssets);
        const clip = w.soldierAssets[0].animation.clips.find((clip) => clip.name === row.clip);
        if (Math.abs(clip.duration - row.duration) > 1e-6)
          throw new Error(`Travel capture timing needs review: ${clip.duration}`);
        window.__heavyTravel = async (seconds) => {
          const instances = travelInstances(
            source,
            seconds,
            row.speed,
            row.travelAngleOffset ? row.duration : clip.duration,
            row.travelAngleOffset,
          );
          w.setTime(0);
          w.drawInstances(instances, camera);
          await w.settlePresentedFrame();
          w.render();
          await w.world.settlePresentedFrame();
          return {
            seconds,
            instance: instances[0],
            sampled: w.debugSoldierAnim(0),
            soldiers: w.stats().soldiers,
            routeFrame: h.stats().frame,
          };
        };
        return { camera, pose: h.stats().pose, catalog: h.stats().catalog };
      },
      { root, row },
    );
    const draw = async (seconds) => {
      const state = await page.evaluate((seconds) => window.__heavyTravel(seconds), seconds);
      return {
        state,
        shot: await page.screenshot({ clip: { x: 128, y: 96, width: 1024, height: 640 } }),
      };
    };
    const first = await draw(0);
    const distant = await draw(row.duration * 1.25);
    const repeat = await draw(0);
    ctx.check(
      `${row.clip}/${row.view}: absolute time repeat after travel is exact`,
      first.shot.equals(repeat.shot) &&
        JSON.stringify(first.state) === JSON.stringify(repeat.state),
    );
    const dx = distant.state.instance.x - first.state.instance.x;
    const dy = distant.state.instance.y - first.state.instance.y;
    ctx.check(
      `${row.clip}/${row.view}: prescribed directional distance reaches submission`,
      Math.abs(Math.hypot(dx, dy) - row.speed * row.duration * 1.25) < 1e-9 &&
        dx * Math.cos(first.state.instance.facing + (row.travelAngleOffset ?? 0)) +
          dy * Math.sin(first.state.instance.facing + (row.travelAngleOffset ?? 0)) >
          0 &&
        distant.state.instance.facing === first.state.instance.facing,
    );
    const images = [],
      states = [];
    for (let frame = 0; frame < frames; frame++) {
      const snapshot = name(row, frame);
      if (!snapshotSelected(snapshot)) continue;
      const sample = await draw(frame / 20);
      const repeated = await draw(frame / 20);
      ctx.check(`${snapshot}: frozen frame repeats`, sample.shot.equals(repeated.shot));
      ctx.check(
        `${snapshot}: intended manual clip reaches production`,
        sample.state.soldiers === 1 &&
          sample.state.sampled.clip === row.clip &&
          Math.abs(sample.state.sampled.phase - sample.state.instance.phase) < 1e-6 &&
          sample.state.routeFrame === first.state.routeFrame,
      );
      await ctx.snap(null, snapshot, { shot: sample.shot, threshold: 0, maxDiffRatio: 0 });
      images.push(pngToRGBA(sample.shot));
      states.push(sample.state);
    }
    if (images.length === frames) {
      const directory = new URL("../../../throwaway/heavy-travel/", import.meta.url);
      await mkdir(directory, { recursive: true });
      await writeFile(
        new URL(`${row.clip}-${row.view}.gif`, directory),
        encodeGif(images, 1024, 640, 5),
      );
    }
    reports.push({ ...row, framing, states });
  }
  const directory = new URL("../../../throwaway/heavy-travel/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("submission.json", directory), JSON.stringify(reports, null, 2));
}
