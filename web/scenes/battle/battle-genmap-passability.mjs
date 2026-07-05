const SEED = 7;
const VIEWPORT = { width: 1280, height: 800 };
const WINDOWS = {
  passable: [0.5, 0.66],
  slow: [0.08, 0.13],
  blocked: [0.3, 0.36],
  water: [0.005, 0.05],
  mud: [0.008, 0.025],
};

export const meta = {
  name: "battle-genmap-passability",
  kind: "visual",
  world: "battle-generated-seed-7-passability-mask",
  tier: "quick",
  snapshots: ["battle-genmap-passability"],
  describe:
    "BMS04-SLICE-B6D9: generated map passability mask colored directly from sim speed/tint pointers, including lake and marsh drainage classes.",
};

export async function run(ctx) {
  const page = await ctx.newPage({
    viewport: VIEWPORT,
    errorPrefix: "battle-genmap-passability",
  });
  try {
    await page.goto(`${ctx.target}/?map=gen&seed=${SEED}&ai=off`);
    await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 20000 });
    const result = await page.evaluate(
      async ({ seed, viewport }) => {
        const wasmModule = await import("/src/wasm/game_wasm.js");
        const wasm = await wasmModule.default();
        const game = new wasmModule.Game(0x5eed_c0de);
        game.start_battle_generated(BigInt(seed));
        const w = game.terrain_w();
        const h = game.terrain_h();
        const cell = game.terrain_cell();
        const ox = game.terrain_origin_x();
        const oy = game.terrain_origin_y();
        const n = w * h;
        const speed = new Float32Array(wasm.memory.buffer, game.terrain_speed_ptr(), n).slice();
        const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), n).slice();
        const certificates = JSON.parse(game.generated_map_certificates());
        const descriptor = JSON.parse(game.generated_map_descriptor());

        document.body.innerHTML = "";
        document.body.style.margin = "0";
        document.body.style.background = "#11130f";
        const canvas = document.createElement("canvas");
        canvas.id = "passability-mask";
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        document.body.appendChild(canvas);
        const g = canvas.getContext("2d");
        const img = g.createImageData(canvas.width, canvas.height);
        const worldW = w * cell;
        const worldH = h * cell;
        const scale = Math.min(canvas.width / worldW, canvas.height / worldH);
        const drawW = worldW * scale;
        const drawH = worldH * scale;
        const offX = (canvas.width - drawW) / 2;
        const offY = (canvas.height - drawH) / 2;
        const counts = { passable: 0, slow: 0, blocked: 0, water: 0, mud: 0 };
        for (let i = 0; i < n; i++) {
          if (tint[i] === 1) counts.water++;
          else if (tint[i] === 5) {
            counts.mud++;
            if (speed[i] > 0 && speed[i] < 0.9) counts.slow++;
            else if (speed[i] <= 0) counts.blocked++;
            else counts.passable++;
          } else if (speed[i] <= 0) counts.blocked++;
          else if (speed[i] < 0.9) counts.slow++;
          else counts.passable++;
        }
        for (let py = 0; py < canvas.height; py++) {
          for (let px = 0; px < canvas.width; px++) {
            const wx = ox + (px - offX) / scale;
            const wy = oy + worldH - (py - offY) / scale;
            let color = [17, 19, 15];
            if (wx >= ox && wx < ox + worldW && wy >= oy && wy < oy + worldH) {
              const cx = Math.max(0, Math.min(w - 1, Math.floor((wx - ox) / cell)));
              const cy = Math.max(0, Math.min(h - 1, Math.floor((wy - oy) / cell)));
              const i = cy * w + cx;
              if (tint[i] === 1) color = [35, 92, 145];
              else if (tint[i] === 5) color = [190, 126, 42];
              else if (speed[i] <= 0) color = [13, 14, 13];
              else if (speed[i] < 0.9) color = [153, 132, 76];
              else color = [71, 142, 75];
            }
            const o = (py * canvas.width + px) * 4;
            img.data[o] = color[0];
            img.data[o + 1] = color[1];
            img.data[o + 2] = color[2];
            img.data[o + 3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
        return {
          dimensions: { w, h, cell, ox, oy, worldW, worldH },
          descriptor,
          certificates,
          ratios: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n])),
        };
      },
      { seed: SEED, viewport: VIEWPORT },
    );

    ctx.check(
      "passability mask uses the generated seed-7 terrain",
      result.dimensions.w === 600 &&
        result.dimensions.h === 400 &&
        result.dimensions.cell === 4 &&
        result.descriptor.seed === SEED &&
        result.descriptor.terrainHash === "0x9053a4fa78867b91",
      JSON.stringify(result),
    );
    for (const [name, [lo, hi]] of Object.entries(WINDOWS)) {
      const value = result.ratios[name];
      ctx.check(
        `passability ${name} ratio stays in the slice-03 window`,
        value >= lo && value <= hi,
        JSON.stringify({ value, window: [lo, hi], ratios: result.ratios }),
      );
    }
    ctx.check(
      "passability certificates agree with the cargo sweep",
      result.certificates.westSealed > 0.9 &&
        result.certificates.eastSealed > 0.9 &&
        result.certificates.southOpen > 0.6 &&
        result.certificates.northOpen > 0.6 &&
        result.certificates.corridor === true &&
        result.certificates.westFlankUnreachable > 0.95 &&
        result.certificates.eastFlankUnreachable > 0.95 &&
        result.certificates.orphanBlockedCells === 0 &&
        result.certificates.largestIsolatedPassablePocket <= 96,
      JSON.stringify(result.certificates),
    );
    ctx.check(
      "drainage stats and invariants are exported by the sim certificate owner",
      result.certificates.drainage?.lakeCount >= 1 &&
        result.certificates.drainage?.lakeCells > 0 &&
        result.certificates.drainage?.playableLakeCount >= 1 &&
        result.certificates.drainage?.playableLakeCount <= 2 &&
        result.certificates.drainage?.largestPlayableLakeCells >= 1500 &&
        result.certificates.drainage?.streamCount >= 1 &&
        result.certificates.drainage?.streamCells > 0 &&
        result.certificates.drainage?.streamDeadEnds === 0 &&
        result.certificates.drainage?.streamImpassableCells === 0 &&
        result.certificates.drainage?.streamLakeConnections +
          result.certificates.drainage?.streamRunoffConnections ===
          result.certificates.drainage?.streamCount &&
        result.certificates.drainage?.waterLevelSet === true &&
        result.certificates.drainage?.streamsDescend === true,
      JSON.stringify(result.certificates.drainage),
    );
    await ctx.snap(page, "battle-genmap-passability");
  } finally {
    await page.close();
  }
}
