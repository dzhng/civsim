import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VIEWPORT = { width: 1600, height: 1120 };
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
const OUT_DIR = fileURLToPath(
  new URL("../../../specs/done/battle-map-style/visualizations/", import.meta.url),
);
const OUT_PNG = `${OUT_DIR}seed-browser.png`;
const OUT_HTML = `${OUT_DIR}seed-browser.html`;

export const meta = {
  name: "battle-genmap-browser",
  kind: "visual",
  world: "battle-generated-seed-browser",
  tier: "quick",
  describe:
    "BMS06-SLICE-C1F4: wasm-only generated seed browser writes a 24-seed passability-mask sheet and asserts certificate/variety floors.",
};

export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: "battle-genmap-browser",
  });
  try {
    await page.goto(ctx.target);
    await page.waitForFunction(() => document.readyState === "complete", undefined, {
      timeout: 20000,
    });
    const result = await page.evaluate(
      async ({ seeds, viewport }) => {
        const wasmModule = await import("/src/wasm/game_wasm.js");
        const wasm = await wasmModule.default();

        document.body.innerHTML = "";
        document.body.style.margin = "0";
        document.body.style.background = "#10120f";
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        document.body.appendChild(canvas);
        const g = canvas.getContext("2d");
        g.fillStyle = "#10120f";
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
        g.textBaseline = "top";

        const cols = 6;
        const rows = Math.ceil(seeds.length / cols);
        const pad = 18;
        const labelH = 44;
        const tileW = (canvas.width - pad * (cols + 1)) / cols;
        const tileH = (canvas.height - pad * (rows + 1)) / rows;
        const stats = [];

        for (let index = 0; index < seeds.length; index++) {
          const seed = seeds[index];
          const game = new wasmModule.Game(0x5eed_c0de);
          game.load_generated_map(BigInt(seed));
          const w = game.terrain_w();
          const h = game.terrain_h();
          const cell = game.terrain_cell();
          const ox = game.terrain_origin_x();
          const oy = game.terrain_origin_y();
          const n = w * h;
          const height = new Float32Array(wasm.memory.buffer, game.terrain_height_ptr(), n).slice();
          const speed = new Float32Array(wasm.memory.buffer, game.terrain_speed_ptr(), n).slice();
          const rough = new Float32Array(wasm.memory.buffer, game.terrain_rough_ptr(), n).slice();
          const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), n).slice();
          const manifest = JSON.parse(game.generated_map_manifest());
          const certificates = JSON.parse(game.generated_map_certificates());
          const recipeClass = manifest.recipeClass ?? "full";
          const composition = manifest.edgeSeals?.composition ?? {};
          const pass = certificatesPass(certificates);
          const terrainHash = manifest.terrainHash;
          const fieldHash = hashField(w, h, cell, ox, oy, speed, rough, tint);
          const ratios = ratiosFor(w, h, speed, rough, tint);
          const corridor = corridorRelief(w, h, cell, ox, oy, height, tint);
          game.free();
          stats.push({
            seed,
            recipeClass,
            pass,
            manifest,
            certificates,
            compositionKey: `${composition.west ?? "?"}/${composition.east ?? "?"}`,
            terrainHash,
            fieldHash,
            ratios,
            corridor,
          });

          const col = index % cols;
          const row = (index / cols) | 0;
          const x0 = pad + col * (tileW + pad);
          const y0 = pad + row * (tileH + pad);
          g.fillStyle = "#1a1b15";
          g.fillRect(x0, y0, tileW, tileH);
          drawMask(g, { w, h, speed, rough, tint }, x0, y0 + labelH, tileW, tileH - labelH);
          g.fillStyle = pass ? "#e5e0c8" : "#e06a5a";
          g.fillText(
            `seed ${seed} ${recipeClass} ${composition.west ?? "?"}/${composition.east ?? "?"}`,
            x0 + 7,
            y0 + 6,
          );
          g.fillStyle = "#9aa78c";
          g.fillText(
            `lake ${manifest.featureSummary?.lakeCells ?? 0} relief ${corridor.span.toFixed(1)}m`,
            x0 + 7,
            y0 + 24,
          );
        }

        return {
          stats,
          pngBase64: canvas.toDataURL("image/png").split(",")[1],
        };

        function certificatesPass(c) {
          return (
            c?.southDeployment?.meetsContract === true &&
            c?.northDeployment?.meetsContract === true &&
            c?.corridor === true &&
            c?.westSealed > 0.9 &&
            c?.eastSealed > 0.9 &&
            c?.southOpen > 0.6 &&
            c?.northOpen > 0.6 &&
            c?.westFlankUnreachable > 0.95 &&
            c?.eastFlankUnreachable > 0.95 &&
            c?.orphanBlockedCells === 0 &&
            c?.largestIsolatedPassablePocket <= 96
          );
        }

        function drawMask(ctx, grid, x0, y0, drawW, drawH) {
          const image = ctx.createImageData(Math.round(drawW), Math.round(drawH));
          const scale = Math.min(drawW / grid.w, drawH / grid.h);
          const mapW = grid.w * scale;
          const mapH = grid.h * scale;
          const offX = (drawW - mapW) / 2;
          const offY = (drawH - mapH) / 2;
          for (let py = 0; py < image.height; py++) {
            for (let px = 0; px < image.width; px++) {
              const gx = Math.floor((px - offX) / scale);
              const gy = grid.h - 1 - Math.floor((py - offY) / scale);
              let color = [16, 18, 15];
              if (gx >= 0 && gy >= 0 && gx < grid.w && gy < grid.h) {
                const i = gy * grid.w + gx;
                if (grid.tint[i] === 1) color = [39, 96, 148];
                else if (grid.tint[i] === 4) color = [36, 91, 43];
                else if (grid.tint[i] === 5) color = [168, 105, 42];
                else if (grid.tint[i] === 6) color = [156, 145, 104];
                else if (grid.speed[i] <= 0) color = [18, 18, 17];
                else if (grid.rough[i] >= 0.18) color = [126, 137, 84];
                else if (grid.speed[i] < 0.9) color = [142, 129, 76];
                else color = [78, 139, 76];
              }
              const o = (py * image.width + px) * 4;
              image.data[o] = color[0];
              image.data[o + 1] = color[1];
              image.data[o + 2] = color[2];
              image.data[o + 3] = 255;
            }
          }
          ctx.putImageData(image, Math.round(x0), Math.round(y0));
        }

        function ratiosFor(w, h, speed, rough, tint) {
          const counts = {
            passable: 0,
            slow: 0,
            blocked: 0,
            water: 0,
            forest: 0,
            mud: 0,
            scree: 0,
            rough: 0,
          };
          for (let i = 0; i < w * h; i++) {
            if (tint[i] === 1) counts.water++;
            if (tint[i] === 4 && speed[i] > 0) counts.forest++;
            if (tint[i] === 5) counts.mud++;
            if (tint[i] === 6) counts.scree++;
            if (tint[i] === 0 && speed[i] > 0 && rough[i] >= 0.18) counts.rough++;
            if (speed[i] <= 0) counts.blocked++;
            else if (speed[i] < 0.9) counts.slow++;
            else counts.passable++;
          }
          return Object.fromEntries(
            Object.entries(counts).map(([k, v]) => [k, Number((v / (w * h)).toFixed(4))]),
          );
        }

        function corridorRelief(w, h, cell, ox, oy, height, tint) {
          let lo = Infinity;
          let hi = -Infinity;
          for (let cy = 0; cy < h; cy++) {
            const y = oy + (cy + 0.5) * cell;
            if (Math.abs(y) > 720) continue;
            for (let cx = 0; cx < w; cx++) {
              const x = ox + (cx + 0.5) * cell;
              if (Math.abs(x) > 350) continue;
              const i = cy * w + cx;
              if (tint[i] === 1) continue;
              lo = Math.min(lo, height[i]);
              hi = Math.max(hi, height[i]);
            }
          }
          return {
            lo: Number(lo.toFixed(2)),
            hi: Number(hi.toFixed(2)),
            span: Number((hi - lo).toFixed(2)),
          };
        }

        function hashField(w, h, cell, ox, oy, speed, rough, tint) {
          let hsh = 0x811c9dc5;
          for (let cy = 0; cy < h; cy++) {
            const y = oy + (cy + 0.5) * cell;
            if (Math.abs(y) > 560) continue;
            for (let cx = 0; cx < w; cx++) {
              const x = ox + (cx + 0.5) * cell;
              if (Math.abs(x) > 430) continue;
              const i = cy * w + cx;
              hsh = mix(hsh, tint[i]);
              hsh = mix(hsh, Math.round(speed[i] * 10000));
              hsh = mix(hsh, Math.round(rough[i] * 10000));
            }
          }
          return `0x${(hsh >>> 0).toString(16).padStart(8, "0")}`;
        }

        function mix(hsh, v) {
          hsh ^= v;
          return Math.imul(hsh, 0x01000193);
        }
      },
      { seeds: SEEDS, viewport: VIEWPORT },
    );

    const failed = result.stats.filter((s) => !s.pass);
    const compositions = new Set(result.stats.map((s) => s.compositionKey));
    const classes = new Set(result.stats.map((s) => s.recipeClass));
    const terrainHashes = new Set(result.stats.map((s) => s.terrainHash));
    const fieldHashes = new Set(result.stats.map((s) => s.fieldHash));
    ctx.check(
      "all 24 seed-browser seeds pass generated-map certificates",
      failed.length === 0,
      JSON.stringify(failed),
    );
    ctx.check(
      "seed browser has at least 3 distinct edge compositions",
      compositions.size >= 3,
      JSON.stringify([...compositions]),
    );
    ctx.check(
      "seed browser includes full, dry, and plain recipe classes",
      ["full", "dry", "plain"].every((c) => classes.has(c)),
      JSON.stringify(
        result.stats.map((s) => [
          s.seed,
          s.recipeClass,
          s.manifest.featureSummary?.lakeCells,
          s.corridor,
        ]),
      ),
    );
    ctx.check(
      "dry seed-browser maps have zero lake cells",
      result.stats
        .filter((s) => s.recipeClass === "dry")
        .every((s) => s.manifest.featureSummary?.lakeCells === 0),
      JSON.stringify(
        result.stats
          .filter((s) => s.recipeClass === "dry")
          .map((s) => [s.seed, s.manifest.featureSummary]),
      ),
    );
    ctx.check(
      "plain seed-browser maps stay gently rolling",
      result.stats
        .filter((s) => s.recipeClass === "plain")
        .every((s) => s.corridor.span >= 2.4 && s.corridor.span <= 6.8),
      JSON.stringify(
        result.stats.filter((s) => s.recipeClass === "plain").map((s) => [s.seed, s.corridor]),
      ),
    );
    ctx.check(
      "seed browser terrain hashes are pairwise unique",
      terrainHashes.size === SEEDS.length,
      JSON.stringify(result.stats.map((s) => [s.seed, s.terrainHash])),
    );
    ctx.check(
      "seed browser field hashes are pairwise unique",
      fieldHashes.size === SEEDS.length,
      JSON.stringify(result.stats.map((s) => [s.seed, s.fieldHash])),
    );

    await mkdir(dirname(OUT_PNG), { recursive: true });
    await writeFile(OUT_PNG, Buffer.from(result.pngBase64, "base64"));
    await writeFile(
      OUT_HTML,
      `<!doctype html>
<meta charset="utf-8">
<title>Generated Battle Map Seed Browser</title>
<style>
  body { margin: 0; background: #10120f; color: #e5e0c8; font: 14px ui-monospace, SFMono-Regular, Menlo, monospace; }
  main { width: min-content; margin: 0 auto; padding: 18px; }
  img { display: block; width: ${VIEWPORT.width}px; max-width: calc(100vw - 36px); height: auto; border: 1px solid #3a2c18; }
  table { border-collapse: collapse; margin-top: 14px; }
  td, th { border: 1px solid #3a2c18; padding: 4px 7px; text-align: left; }
  th { color: #c9a461; }
</style>
<main>
  <h1>Generated battle map seed browser</h1>
  <p>BMS06-SLICE-C1F4. ${SEEDS.length} wasm-generated passability-mask thumbnails; certificates pass, classes: ${[...classes].join(", ")}; edge compositions: ${[...compositions].join(", ")}.</p>
  <img src="./seed-browser.png" alt="Generated battle map seed browser">
  <table><thead><tr><th>seed</th><th>class</th><th>edge composition</th><th>lake cells</th><th>corridor relief</th><th>terrain hash</th><th>field hash</th></tr></thead><tbody>
${result.stats.map((r) => `<tr><td>${r.seed}</td><td>${r.recipeClass}</td><td>${r.compositionKey}</td><td>${r.manifest.featureSummary?.lakeCells ?? 0}</td><td>${r.corridor.span.toFixed(2)}m</td><td>${r.terrainHash}</td><td>${r.fieldHash}</td></tr>`).join("\n")}
  </tbody></table>
</main>
`,
    );
  } finally {
    await page.close();
  }
}
