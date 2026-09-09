// Semantic pose rows × eight bearings, sampled by the production model workbench.
// ONLY=0,8 selects appearances; VERIFY_GPU=1 is required for exact baselines.
import {
  snapCheck,
  snapshotSelected,
  beginSnapshotFolderRefresh,
  finishSnapshotFolder,
} from "../../../snapshot.mjs";
import {
  artifactStem,
  montage,
  openSoldierCapture,
  sheetSamples,
  selectedAppearances,
} from "./_soldier-capture.mjs";

const group = "models/shared/soldiers/ingame";
const selected = selectedAppearances().filter((appearance) =>
  snapshotSelected(`${group}/${artifactStem(appearance)}`),
);
const capture = await openSoldierCapture();
let failed = false;
try {
  if (!process.env.ONLY) await beginSnapshotFolderRefresh(group);
  for (const appearance of selected) {
    const asset = capture.assets[appearance.id];
    const images = [];
    for (const { clip, phase } of sheetSamples(asset)) {
      for (let bearing = 0; bearing < 8; bearing++)
        images.push(
          await capture.capture(appearance, clip, phase, {
            yaw: Math.PI + (bearing * Math.PI) / 4,
          }),
        );
    }
    await snapCheck(
      capture.page,
      `${group}/${artifactStem(appearance)}`,
      (name, ok, detail) => {
        console.log(ok ? "PASS" : "FAIL", name, detail);
        failed ||= !ok;
      },
      { shot: montage(images, 8), threshold: 0, maxDiffRatio: 0 },
    );
  }
  if (!process.env.ONLY) await finishSnapshotFolder(group);
} finally {
  await capture.close();
}
if (failed) process.exitCode = 1;
