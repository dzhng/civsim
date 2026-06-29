// Turn any folder of time-series PNG frames into one looping GIF you can WATCH —
// the companion to a /screenshot-regression timeline that isn't a vibe scenario
// (vibe timelines already auto-emit shots/vibe/<name>/timeline.gif; this is for
// ad-hoc series you shot yourself). Frames are ordered by filename, so name them
// so they sort (t000s.png, t012s.png, … or 00.png, 01.png, …).
//
//   node vibe/gif.mjs shots/campaign/charge          # -> shots/campaign/charge/timeline.gif
//   node vibe/gif.mjs shots/my-series out.gif 200 2 # explicit out, 200 ms/frame, downscale 2
//
// Args: <dir> [outPath] [delayMs=200] [downscale=2]. Default delay is ~200 ms/frame
// (5 fps) so the whole sequence is easy to follow.
import fs from 'node:fs';
import path from 'node:path';
import { encodeGif, pngToRGBA, downscaleRGBA } from '../shots/_gif.mjs';

const [dir, outArg, delayArg, scaleArg] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node vibe/gif.mjs <dir> [outPath] [delayMs=200] [downscale=2]');
  process.exit(2);
}
const delayMs = Number(delayArg ?? 200);
const downscale = Number(scaleArg ?? 2);
const out = outArg ?? path.join(dir, 'timeline.gif');

const files = fs.readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .sort();
if (files.length === 0) {
  console.error(`no PNG frames in ${dir}`);
  process.exit(1);
}
const frames = files.map((f) => downscaleRGBA(pngToRGBA(fs.readFileSync(path.join(dir, f))), downscale));
const gif = encodeGif(frames, frames[0].width, frames[0].height, Math.round(delayMs / 10));
fs.writeFileSync(out, gif);
console.log(`wrote ${out}  ${frames.length}f @ ${delayMs}ms  ${(gif.length / 1024).toFixed(0)}kb`);
