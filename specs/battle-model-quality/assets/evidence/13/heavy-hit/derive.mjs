// Review derivatives only; every image comes from the gated production sheet.
import { PNG } from "pngjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { encodeGif } from "../../../../../../web/shots/_gif.mjs";

const sheet = PNG.sync.read(readFileSync(new URL(
  "../../../../../../web/shots/models/shared/soldiers/heavy-kit/hit-motion.png", import.meta.url,
)));
assert.equal(sheet.width, 1280);
assert.equal(sheet.height, 21 * 640);
for (const [column, view] of ["side", "oblique"].entries()) {
  const bodies = Array.from({ length: 21 }, (_, row) => {
    const image = new PNG({ width: 640, height: 560 });
    PNG.bitblt(sheet, image, column * 640, row * 640 + 80, 640, 560, 0, 0);
    return image;
  });
  for (const index of [1, 19, 20])
    assert.ok(bodies[0].data.equals(bodies[index].data), `${view}: ready/hit endpoint ${index}`);
  const directory = new URL(`../../../../../../throwaway/heavy-hit-video/${view}/`, import.meta.url);
  mkdirSync(directory, { recursive: true });
  const rows = [...Array(6).fill(0), ...Array.from({ length: 18 }, (_, i) => i + 1), ...Array(6).fill(20)];
  for (const [frame, row] of rows.entries())
    writeFileSync(new URL(`frame-${String(frame).padStart(2, "0")}.png`, directory), PNG.sync.write(bodies[row]));
  const output = fileURLToPath(new URL(`b/hit-${view}-30fps.mp4`, import.meta.url));
  execFileSync("ffmpeg", ["-y", "-v", "error", "-framerate", "30", "-i",
    fileURLToPath(directory) + "frame-%02d.png", "-c:v", "libx264", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v",
    "-show_entries", "stream=avg_frame_rate,nb_frames,duration", "-of", "json", output]));
  assert.deepEqual(probe.streams.map(({ avg_frame_rate, nb_frames, duration }) =>
    [avg_frame_rate, nb_frames, duration]), [["30/1", "30", "1.000000"]]);
  // Preserve the reviewed GIF derivative. Some players clamp its 10 ms delay;
  // the independently probed MP4, not this GIF, is the timing artifact.
  const gif = Array(20).fill(bodies[0]);
  for (let frame = 0; frame < 18; frame++)
    gif.push(...Array([3, 3, 4][frame % 3]).fill(bodies[frame + 1]));
  gif.push(...Array(20).fill(bodies[20]));
  writeFileSync(new URL(`b/hit-${view}.gif`, import.meta.url), encodeGif(gif, 640, 560, 1));
}
console.log("Exact ready endpoints; both MP4s 30 frames / 30 fps / 1 second");
