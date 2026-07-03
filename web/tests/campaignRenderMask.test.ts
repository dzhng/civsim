import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";
import { RenderMask, type BgWorldRect } from "../src/campaign/terrain.ts";

interface MaskProbe {
  meta: {
    bg_rect: BgWorldRect;
    px_per_km: { x: number; y: number };
    grid_step_km: number;
  };
  grid: Array<[number, number, boolean]>;
  cities: Array<{ name: string; x: number; y: number; land: boolean; coast_km: number }>;
}

const repoRoot = resolve(process.cwd(), "..");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

test("render mask agrees with the baked campaign-bg probe", () => {
  const bgPath = resolve(process.cwd(), "public/data/campaign-bg.png");
  const bgRectPath = resolve(process.cwd(), "public/data/campaign-bg.json");
  const probePath = resolve(repoRoot, "specs/campaign-map-bugs/assets/probe/mask-probe.json");

  const bg = PNG.sync.read(readFileSync(bgPath));
  const bgRect = readJson<BgWorldRect>(bgRectPath);
  const probe = readJson<MaskProbe>(probePath);
  assert.deepEqual(
    bgRect,
    probe.meta.bg_rect,
    "probe rect must match the committed campaign bg rect",
  );

  const mask = new RenderMask(bg.data, bg.width, bg.height, bgRect);

  for (let i = 0; i < probe.grid.length; i++) {
    const [x, y, expected] = probe.grid[i];
    const actual = mask.landAt(x, y);
    assert.equal(
      actual,
      expected,
      `grid[${i}] (${x}, ${y}) classifier=${actual} probe=${expected}`,
    );
  }

  for (const city of probe.cities) {
    const actual = mask.landAt(city.x, city.y);
    assert.equal(
      actual,
      city.land,
      `city ${city.name} (${city.x}, ${city.y}) classifier=${actual} probe=${city.land}`,
    );
  }
});
