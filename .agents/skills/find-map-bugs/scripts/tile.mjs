#!/usr/bin/env node
// Deterministic tiling + cropping for map-shot bug hunts.
//   slice <image> <outdir> [--cols 3 --rows 3 --overlap 0.18]
//     -> writes tile-<r>-<c>.png + manifest.json [{file,x,y,w,h}] (full-image offsets)
//   crop <image> <out.png> <x> <y> <w> <h> [--margin 40 --scale 2]
//     -> writes a margin-padded crop (nearest-neighbor upscaled for legibility)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(join(process.cwd(), "web", "package.json"));
const { PNG } = require("pngjs");

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}

const [, , mode, imagePath, ...rest] = process.argv;
if (!mode || !imagePath) {
  console.error("usage: tile.mjs slice <image> <outdir> | crop <image> <out.png> <x> <y> <w> <h>");
  process.exit(1);
}
const src = PNG.sync.read(readFileSync(imagePath));

function copyRegion(sx, sy, w, h, scale = 1) {
  const out = new PNG({ width: w * scale, height: h * scale });
  for (let y = 0; y < h * scale; y++) {
    for (let x = 0; x < w * scale; x++) {
      const px = Math.min(src.width - 1, Math.max(0, sx + Math.floor(x / scale)));
      const py = Math.min(src.height - 1, Math.max(0, sy + Math.floor(y / scale)));
      const si = (py * src.width + px) * 4;
      const di = (y * out.width + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k];
    }
  }
  return out;
}

if (mode === "slice") {
  const outdir = rest[0];
  mkdirSync(outdir, { recursive: true });
  const cols = arg("cols", 3);
  const rows = arg("rows", 3);
  const overlap = arg("overlap", 0.18);
  const tw = Math.ceil(src.width / (cols - (cols - 1) * overlap));
  const th = Math.ceil(src.height / (rows - (rows - 1) * overlap));
  const stepX = Math.floor(tw * (1 - overlap));
  const stepY = Math.floor(th * (1 - overlap));
  const manifest = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.min(c * stepX, src.width - tw);
      const y = Math.min(r * stepY, src.height - th);
      const w = Math.min(tw, src.width - x);
      const h = Math.min(th, src.height - y);
      const file = `tile-${r}-${c}.png`;
      writeFileSync(join(outdir, file), PNG.sync.write(copyRegion(x, y, w, h)));
      manifest.push({ file, x, y, w, h });
    }
  }
  writeFileSync(join(outdir, "manifest.json"), JSON.stringify({ image: imagePath, width: src.width, height: src.height, tiles: manifest }, null, 1));
  console.log(JSON.stringify({ tiles: manifest.length, tileSize: [tw, th], outdir }));
} else if (mode === "crop") {
  const [out, xs, ys, ws, hs] = rest;
  const margin = arg("margin", 40);
  const scale = arg("scale", 2);
  const x = Math.max(0, Number(xs) - margin);
  const y = Math.max(0, Number(ys) - margin);
  const w = Math.min(src.width - x, Number(ws) + margin * 2);
  const h = Math.min(src.height - y, Number(hs) + margin * 2);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, PNG.sync.write(copyRegion(x, y, w, h, scale)));
  console.log(JSON.stringify({ out, x, y, w, h, scale }));
} else {
  console.error(`unknown mode ${mode}`);
  process.exit(1);
}
