import { UNIT_INFO } from "@packages/game-renderer/src/battle/unitInfoLayout";
import type { Game, InitOutput } from "../wasm/game_wasm.js";
import type { Camera } from "../shared/camera";

export interface BattleMinimap {
  drawMinimap(): void;
  terrainDebug(): unknown;
}

export function createBattleMinimap({
  canvas,
  camera,
  game,
  generatedMap,
  minimap,
  signal,
  stride,
  unitInfo,
  wasm,
}: {
  canvas: HTMLCanvasElement;
  camera: Camera;
  game: Game;
  generatedMap: unknown;
  minimap: HTMLCanvasElement;
  signal: AbortSignal;
  stride: number;
  unitInfo: () => Float32Array;
  wasm: InitOutput;
}): BattleMinimap {
  const miniBack = document.createElement("canvas");
  {
    const tw = game.terrain_w();
    const th = game.terrain_h();
    miniBack.width = minimap.width;
    miniBack.height = minimap.height;
    const g = miniBack.getContext("2d")!;
    const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), tw * th);
    const palette = ["#5a6a40", "#2c455c", "#6f6c66", "#7a6c5b", "#37512c", "#56503c", "#6e6651"];
    const img = g.createImageData(minimap.width, minimap.height);
    for (let py = 0; py < minimap.height; py++) {
      for (let px = 0; px < minimap.width; px++) {
        const cx = Math.floor((px / minimap.width) * tw);
        const cy = Math.floor(((minimap.height - 1 - py) / minimap.height) * th);
        const color = palette[tint[cy * tw + cx]] ?? palette[0];
        const n = parseInt(color.slice(1), 16);
        const o = (py * minimap.width + px) * 4;
        img.data[o] = n >> 16;
        img.data[o + 1] = (n >> 8) & 0xff;
        img.data[o + 2] = n & 0xff;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }

  const worldToMini = (x: number, y: number): [number, number] => {
    const [ox, oy] = [game.terrain_origin_x(), game.terrain_origin_y()];
    const w = game.terrain_w() * game.terrain_cell();
    const h = game.terrain_h() * game.terrain_cell();
    return [((x - ox) / w) * minimap.width, (1 - (y - oy) / h) * minimap.height];
  };

  minimap.addEventListener(
    "mousedown",
    (event) => {
      const rect = minimap.getBoundingClientRect();
      const fx = (event.clientX - rect.left) / rect.width;
      const fy = (event.clientY - rect.top) / rect.height;
      camera.setViewCenter(
        game.terrain_origin_x() + fx * game.terrain_w() * game.terrain_cell(),
        game.terrain_origin_y() + (1 - fy) * game.terrain_h() * game.terrain_cell(),
      );
      camera.clampView();
    },
    { signal },
  );

  return {
    drawMinimap() {
      const g = minimap.getContext("2d")!;
      g.drawImage(miniBack, 0, 0);
      const info = unitInfo();
      for (let u = 0; u < game.unit_count(); u++) {
        const o = u * stride;
        if (info[o + UNIT_INFO.alive] === 0) continue;
        const [mx, my] = worldToMini(info[o], info[o + UNIT_INFO.y]);
        g.fillStyle =
          info[o + UNIT_INFO.routing] > 0.5
            ? "#888"
            : info[o + UNIT_INFO.team] === 0
              ? "#6f9ae8"
              : "#e0604f";
        g.fillRect(mx - 1.5, my - 1.5, 3, 3);
      }
      const [ax, ay] = camera.screenToWorld(0, 0);
      const [bx, by] = camera.screenToWorld(canvas.width, canvas.height);
      const [m0x, m0y] = worldToMini(ax, ay);
      const [m1x, m1y] = worldToMini(bx, by);
      g.strokeStyle = "rgba(255,255,255,0.8)";
      g.lineWidth = 1;
      g.strokeRect(
        Math.min(m0x, m1x),
        Math.min(m0y, m1y),
        Math.abs(m1x - m0x),
        Math.abs(m1y - m0y),
      );
    },
    terrainDebug() {
      const w = game.terrain_w();
      const h = game.terrain_h();
      const cell = game.terrain_cell();
      const ox = game.terrain_origin_x();
      const oy = game.terrain_origin_y();
      const tint = new Uint8Array(wasm.memory.buffer, game.terrain_tint_ptr(), w * h);
      const counts = Array.from({ length: 7 }, () => 0);
      const sums = Array.from({ length: 7 }, () => ({ x: 0, y: 0, n: 0 }));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const kind = tint[y * w + x] ?? 0;
          counts[kind] = (counts[kind] ?? 0) + 1;
          const sum = sums[kind];
          if (sum) {
            sum.x += x;
            sum.y += y;
            sum.n++;
          }
        }
      }
      const feature = (kind: number) => {
        const sum = sums[kind];
        if (!sum || sum.n === 0) return null;
        const x = ox + (sum.x / sum.n + 0.5) * cell;
        const y = oy + (sum.y / sum.n + 0.5) * cell;
        const [miniX, miniY] = worldToMini(x, y);
        return { kind, cells: sum.n, x, y, miniX, miniY };
      };
      return {
        w,
        h,
        cell,
        ox,
        oy,
        worldWidth: w * cell,
        worldHeight: h * cell,
        generatedMap,
        certificates: generatedMap
          ? (JSON.parse(game.generated_map_certificates()) as Record<string, number | boolean>)
          : null,
        counts,
        features: {
          water: feature(1),
          rock: feature(2),
          forest: feature(4),
          mud: feature(5),
          scree: feature(6),
        },
      };
    },
  };
}
