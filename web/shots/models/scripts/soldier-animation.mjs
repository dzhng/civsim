// Exact authored phase sheets are the gate; GIFs are quantized, player-timed review derivatives.
// ONLY=0,3 selects appearances. ANGLE=front chooses the opposing front view.
import { mkdir, writeFile } from "node:fs/promises";
import { snapCheck, snapshotSelected } from "../../../snapshot.mjs";
import { encodeGif, pngToRGBA } from "../../_gif.mjs";
import {
  artifactStem,
  montage,
  openSoldierCapture,
  roleClip,
  selectedAppearances,
  motionSamples,
} from "./_soldier-capture.mjs";

const out = new URL("../shared/soldiers/anim/", import.meta.url);
const capture = await openSoldierCapture();
let failed = false;
try {
  await mkdir(out, { recursive: true });
  for (const appearance of selectedAppearances()) {
    const asset = capture.assets[appearance.id];
    for (const [name, role] of [
      ["walk", "walk"],
      ["run", "run"],
      ["attack", "melee"],
      ["shoot", "release"],
      ["hit", "hit"],
      ["die", "death"],
    ]) {
      const stem = `${artifactStem(appearance)}-${name}${process.env.ANGLE === "front" ? "-front" : ""}`;
      if (!snapshotSelected(`models/shared/soldiers/anim/${stem}`)) continue;
      const clip = roleClip(asset, role, { optional: role === "release" || role === "melee" });
      if (!clip) continue;
      const samples = motionSamples(clip);
      const frames = [];
      for (const phase of samples.phases)
        frames.push(
          await capture.capture(appearance, clip, phase, {
            yaw: process.env.ANGLE === "front" ? Math.PI : Math.PI * 1.25,
            pitch: 0.95,
            alive: role !== "death",
          }),
        );
      let matched = true;
      await snapCheck(
        capture.page,
        `models/shared/soldiers/anim/${stem}`,
        (name, ok, detail) => {
          console.log(ok ? "PASS" : "FAIL", name, detail);
          matched &&= ok;
          failed ||= !ok;
        },
        { shot: montage(frames, 8), threshold: 0, maxDiffRatio: 0 },
      );
      if (!matched) continue;
      const rgba = frames.map(pngToRGBA);
      const sequence = clip.loop
        ? [...rgba, ...rgba]
        : role === "death"
          ? [...rgba, ...Array(Math.ceil(500 / samples.delay)).fill(rgba.at(-1))]
          : rgba;
      await writeFile(
        new URL(`${stem}.gif`, out),
        encodeGif(sequence, 360, 360, samples.delay, { loop: role !== "death" }),
      );
    }
  }
} finally {
  await capture.close();
}
if (failed) process.exitCode = 1;
