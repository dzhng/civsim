import { fileURLToPath } from "node:url";

const VIEWPORT = { width: 1280, height: 800 };
const SEEDS = [1, 3, 7, 8];
const TERRAIN_FEATURES_PATH = fileURLToPath(
  new URL("../../../packages/game-renderer/src/battle/terrainFeatures.ts", import.meta.url),
);

export const meta = {
  name: "battle-genmap-seeds",
  kind: "visual",
  world: "battle-generated-seed-montage",
  tier: "quick",
  snapshots: ["battle-genmap-seeds"],
  describe:
    "Generated-map seed montage shows cliff, forest-belt, and water-reach flank seals from sim passability/tint pointers.",
};

export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: "battle-genmap-seeds",
  });
  try {
    await page.goto(ctx.target);
    await page.waitForFunction(() => document.readyState === "complete", undefined, {
      timeout: 20000,
    });
    const result = await page.evaluate(
      async ({ seeds, viewport, terrainFeaturesPath }) => {
        const wasmModule = await import("/src/wasm/game_wasm.js");
        const wasm = await wasmModule.default();
        const features = await import(`/@fs${terrainFeaturesPath}`);

        document.body.innerHTML = "";
        document.body.style.margin = "0";
        document.body.style.background = "#10120f";
        const canvas = document.createElement("canvas");
        canvas.id = "genmap-seeds";
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        document.body.appendChild(canvas);
        const g = canvas.getContext("2d");
        g.fillStyle = "#10120f";
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.font = "18px ui-monospace, SFMono-Regular, Menlo, monospace";
        g.textBaseline = "top";

        const pad = 34;
        const labelH = 32;
        const cellW = (canvas.width - pad * 3) / 2;
        const cellH = (canvas.height - pad * 3) / 2;
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
          const speed = new Float32Array(wasm.memory.buffer, game.terrain_speed_ptr(), n).slice();
          const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), n).slice();
          const grid = { w, h, cell, ox, oy, speed, tint };
          const descriptor = JSON.parse(game.generated_map_descriptor());
          const certificates = JSON.parse(game.generated_map_certificates());
          const roles = features.deriveBattleEdgeRoles(grid);
          const mismatches = features.edgeSealMismatches(grid, roles);
          const expectedRoles = descriptor.edgeSeals?.expectedRoles ?? {};
          const composition = descriptor.edgeSeals?.composition ?? {};
          const ratios = ratiosFor(grid);
          game.free();
          stats.push({ seed, descriptor, certificates, roles, mismatches, expectedRoles, ratios });

          const col = index % 2;
          const row = (index / 2) | 0;
          const x0 = pad + col * (cellW + pad);
          const y0 = pad + row * (cellH + pad);
          const drawW = cellW;
          const drawH = cellH - labelH;
          drawMask(g, grid, x0, y0 + labelH, drawW, drawH);
          g.fillStyle = "#e5e0c8";
          const label = `seed ${seed}: W ${composition.west ?? "?"} / E ${composition.east ?? "?"}`;
          g.fillText(label, x0, y0);
          g.fillStyle = "#9aa78c";
          g.fillText(`roles W ${roles.west} / E ${roles.east}`, x0, y0 + 17);
        }

        return { stats };

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
              let color = [18, 20, 17];
              if (gx >= 0 && gy >= 0 && gx < grid.w && gy < grid.h) {
                const i = gy * grid.w + gx;
                if (grid.tint[i] === 1) color = [39, 96, 148];
                else if (grid.tint[i] === 4) color = [32, 78, 36];
                else if (grid.tint[i] === 5) color = [178, 117, 42];
                else if (grid.speed[i] <= 0) color = [18, 18, 17];
                else if (grid.speed[i] < 0.9) color = [150, 130, 78];
                else color = [76, 142, 76];
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

        function ratiosFor(grid) {
          const counts = { passable: 0, slow: 0, blocked: 0, water: 0, forest: 0, mud: 0 };
          for (let i = 0; i < grid.w * grid.h; i++) {
            if (grid.tint[i] === 1) counts.water++;
            if (grid.tint[i] === 4) counts.forest++;
            if (grid.tint[i] === 5) counts.mud++;
            if (grid.speed[i] <= 0) counts.blocked++;
            else if (grid.speed[i] < 0.9) counts.slow++;
            else counts.passable++;
          }
          return Object.fromEntries(
            Object.entries(counts).map(([k, v]) => [k, Number((v / (grid.w * grid.h)).toFixed(4))]),
          );
        }
      },
      { seeds: SEEDS, viewport: VIEWPORT, terrainFeaturesPath: TERRAIN_FEATURES_PATH },
    );

    for (const stat of result.stats) {
      ctx.check(
        `seed ${stat.seed} west edge role follows recipe`,
        stat.roles.west === stat.expectedRoles.west,
        JSON.stringify({
          composition: stat.descriptor.edgeSeals?.composition,
          expected: stat.expectedRoles,
          roles: stat.roles,
        }),
      );
      ctx.check(
        `seed ${stat.seed} east edge role follows recipe`,
        stat.roles.east === stat.expectedRoles.east,
        JSON.stringify({
          composition: stat.descriptor.edgeSeals?.composition,
          expected: stat.expectedRoles,
          roles: stat.roles,
        }),
      );
      ctx.check(
        `seed ${stat.seed} edge role derivation has no seal mismatches`,
        stat.mismatches.length === 0,
        JSON.stringify(stat.mismatches),
      );
      ctx.check(
        `seed ${stat.seed} deployment certificates stay green`,
        stat.certificates.southDeployment?.meetsContract === true &&
          stat.certificates.northDeployment?.meetsContract === true,
        JSON.stringify(stat.certificates),
      );
    }
    await ctx.snap(page, "battle-genmap-seeds");
  } finally {
    await page.close();
  }
}
