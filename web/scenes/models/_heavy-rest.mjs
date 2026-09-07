import { mkdir, writeFile } from "node:fs/promises";
import { snapshotSelected } from "../../snapshot.mjs";
import { encodeGif, pngToRGBA } from "../../shots/_gif.mjs";

const rows = ["idle", "ready"].flatMap((clip) => [
  { clip, view: "oblique", yaw: Math.PI / 4 },
  { clip, view: "side", yaw: -Math.PI / 2 },
]);
const name = (row, frame) =>
  `shared/soldiers/heavy-kit/rest-${row.clip}-${row.view}-${String(frame).padStart(2, "0")}`;
export const heavyRestSnapshots = rows.flatMap((row) =>
  Array.from({ length: 31 }, (_, frame) => name(row, frame)),
);

/** One complete six-second stationary loop; endpoint is checked but omitted from GIFs. */
export async function captureHeavyRest(ctx, page) {
  // Donor films use an unobstructed whole-body crop. Restore the sheet label
  // afterward so later travel and detail captures retain their normal captions.
  await page.evaluate(() => {
    document.querySelector("#candidate-caption").style.display = "none";
  });
  for (const row of rows) {
    if (
      !heavyRestSnapshots.some(
        (key) => key.includes(`rest-${row.clip}-${row.view}`) && snapshotSelected(key),
      )
    )
      continue;
    const images = [];
    for (let frame = 0; frame <= 30; frame++) {
      const snapshot = name(row, frame);
      if (!snapshotSelected(snapshot)) continue;
      const before = await page.evaluate(
        ({ row, phase }) => {
          const h = window.__battleModels;
          const before = h.stats().frame;
          h.set({
            classId: 0,
            clip: row.clip,
            phase,
            formation: false,
            target: [0, 0, 0.95],
            yaw: row.yaw + Math.PI,
            pitch: 1.4,
            zoom: 230,
          });
          return before;
        },
        { row, phase: frame / 30 },
      );
      await page.waitForFunction((before) => window.__battleModels.stats().frame > before, before);
      await page.evaluate(() => window.__battleModels.world.settlePresentedFrame());
      await page.evaluate(() => {
        if (!document.querySelector("#candidate-caption"))
          throw new Error("Stationary capture lost the candidate-sheet caption owner");
      });
      const stats = await page.evaluate(() => window.__battleModels.stats());
      ctx.check(
        `${snapshot}: stationary clip reaches production`,
        stats.sampled.clip === row.clip &&
          stats.sampled.phase === frame / 30 &&
          stats.sampled.duration === 6 &&
          stats.render.soldiers === 1,
      );
      const shot = await page.screenshot({ clip: { x: 320, y: 96, width: 640, height: 640 } });
      await ctx.snap(null, snapshot, { shot, threshold: 0, maxDiffRatio: 0 });
      images.push(pngToRGBA(shot));
    }
    if (images.length === 31) {
      ctx.check(
        `${row.clip}/${row.view}: stationary loop closes exactly`,
        Buffer.from(images[0].data).equals(Buffer.from(images.at(-1).data)),
      );
      const directory = new URL("../../../throwaway/heavy-rest/", import.meta.url);
      await mkdir(directory, { recursive: true });
      await writeFile(
        new URL(`${row.clip}-${row.view}.gif`, directory),
        encodeGif(images.slice(0, -1), 640, 640, 20),
      );
    }
  }
  await page.evaluate(() => {
    document.querySelector("#candidate-caption").style.display = "";
  });
}
