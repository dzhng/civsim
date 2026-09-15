import type { CampaignData } from "./data";
import { PALETTE } from "@packages/game-renderer/src/terrain/campaignSource";
import { hash2 } from "@packages/renderer-core/src/math";

export async function buildTestCampaign(): Promise<{ data: CampaignData; mapJson: string }> {
  // y ~ 450 puts the stage in a temperate (green-grass) latitude band.
  const Y = 450;
  const map = {
    half_w: 60,
    half_h: 500,
    attribution: "test",
    nodes: [
      { id: 1, name: "Roma", pos: [-25, Y], kind: "city", tier: 2, port: false, owner: "rome" },
      {
        id: 2,
        name: "Neapolis",
        pos: [25, Y],
        kind: "city",
        tier: 2,
        port: false,
        owner: "independents",
      },
    ],
    edges: [
      {
        a: 1,
        b: 2,
        kind: "road",
        via: [
          [-25, Y],
          [25, Y],
        ],
        tiles: Array(8).fill("open"),
      },
    ],
    ambush_spots: [],
    factions: [
      { id: "rome", name: "Rome", color: [200, 40, 40], playable: true },
      { id: "independents", name: "Independent", color: [130, 130, 130], playable: false },
    ],
    start_armies: [
      {
        faction: "rome",
        at: "Roma",
        roster: [
          ["MediumInfantry", 1000],
          ["MediumSpear", 500],
          ["Archers", 500],
          ["ShockCavalry", 300],
        ],
      },
    ],
  } as unknown as CampaignData["map"];
  const bgRect = {
    min: [-45, Y - 28] as [number, number],
    max: [45, Y + 28] as [number, number],
  };
  const bg = await controlledCampaignBitmap(180, 112);
  const nodeIndex = new Map(map.nodes.map((n, i) => [n.id, i]));
  return { data: { map, bg, bgRect, nodeIndex }, mapJson: JSON.stringify(map) };
}

export async function buildHandoffCampaign(): Promise<{ data: CampaignData; mapJson: string }> {
  const Y = 450;
  const map = {
    half_w: 70,
    half_h: 500,
    attribution: "handoff-test",
    nodes: [
      { id: 1, name: "Roma", pos: [-30, Y], kind: "city", tier: 2, port: false, owner: "rome" },
      {
        id: 2,
        name: "Capua",
        pos: [30, Y],
        kind: "city",
        tier: 2,
        port: false,
        owner: "samnium",
      },
    ],
    edges: [
      {
        a: 1,
        b: 2,
        kind: "road",
        via: [
          [-30, Y],
          [30, Y],
        ],
        tiles: Array(8).fill("open"),
      },
    ],
    ambush_spots: [],
    factions: [
      { id: "rome", name: "Rome", color: [200, 40, 40], playable: true },
      {
        id: "samnium",
        name: "Samnium",
        color: [40, 80, 190],
        playable: true,
        ai_persona: "neutral",
      },
      { id: "independents", name: "Independent", color: [130, 130, 130], playable: false },
    ],
    start_armies: [
      { faction: "rome", at: "Roma", roster: [["LightSpear", 16]] },
      { faction: "samnium", at: "Capua", roster: [["LightSpear", 16]] },
    ],
  } as unknown as CampaignData["map"];
  const bgRect = {
    min: [-54, Y - 32] as [number, number],
    max: [54, Y + 32] as [number, number],
  };
  const bg = await controlledCampaignBitmap(216, 128);
  const nodeIndex = new Map(map.nodes.map((n, i) => [n.id, i]));
  return { data: { map, bg, bgRect, nodeIndex }, mapJson: JSON.stringify(map) };
}

export async function buildAlignmentCampaign(): Promise<{ data: CampaignData; mapJson: string }> {
  const map = {
    half_w: 120,
    half_h: 80,
    attribution: "alignment-test",
    nodes: [
      { id: 1, name: "Roma", pos: [-62, 18], kind: "city", tier: 2, port: false, owner: "rome" },
      { id: 2, name: "Tibur", pos: [-28, 22], kind: "city", tier: 1, port: false, owner: "rome" },
      {
        id: 3,
        name: "Narnia",
        pos: [-42, 46],
        kind: "city",
        tier: 1,
        port: false,
        owner: "rome",
      },
      {
        id: 4,
        name: "Ostia/Portus",
        pos: [-76, -8],
        kind: "city",
        tier: 1,
        port: true,
        owner: "rome",
      },
    ],
    edges: [
      {
        a: 1,
        b: 2,
        kind: "road",
        via: [
          [-62, 18],
          [-46, 19],
          [-28, 22],
        ],
        tiles: Array(7).fill("open"),
      },
      {
        a: 1,
        b: 3,
        kind: "road",
        via: [
          [-62, 18],
          [-55, 34],
          [-42, 46],
        ],
        tiles: Array(7).fill("open"),
      },
      {
        a: 1,
        b: 4,
        kind: "road",
        via: [
          [-62, 18],
          [-70, 5],
          [-76, -8],
        ],
        tiles: Array(7).fill("open"),
      },
    ],
    ambush_spots: [],
    factions: [
      { id: "rome", name: "Rome", color: [200, 40, 40], playable: true },
      { id: "independents", name: "Independent", color: [130, 130, 130], playable: false },
    ],
    start_armies: [
      {
        faction: "rome",
        at: "Roma",
        roster: [
          ["MediumInfantry", 1000],
          ["MediumSpear", 500],
          ["Archers", 500],
        ],
      },
    ],
  } as unknown as CampaignData["map"];
  const bgRect = { min: [-100, -60] as [number, number], max: [100, 70] as [number, number] };
  const bg = await alignmentCampaignBitmap(256, 166);
  const nodeIndex = new Map(map.nodes.map((n, i) => [n.id, i]));
  return { data: { map, bg, bgRect, nodeIndex }, mapJson: JSON.stringify(map) };
}

// The bitmap supplies geographic classes, not painted color. Natural material
// comes from the terrain's moisture; art-green RGB can classify as mountains.
async function controlledCampaignBitmap(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const land = [...PALETTE[1].c, 255];
  for (let i = 0; i < width * height; i++) pixels.set(land, i * 4);
  return createImageBitmap(new ImageData(pixels, width, height));
}

async function alignmentCampaignBitmap(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const land: [number, number, number] = [196, 178, 138];
  const sea: [number, number, number] = [38, 60, 84];
  const mountain: [number, number, number] = [142, 120, 96];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const isSea = nx > 0.68;
      const isMountain = !isSea && nx > 0.2 && nx < 0.36 && ny < 0.3;
      const rgb = isSea ? sea : isMountain ? mountain : land;
      const shade = (smoothNoise(nx * 8.1 + 0.7, ny * 6.7 + 3.2) - 0.5) * 10;
      const o = (y * width + x) * 4;
      pixels[o] = clampByte(rgb[0] + shade);
      pixels[o + 1] = clampByte(rgb[1] + shade);
      pixels[o + 2] = clampByte(rgb[2] + shade);
      pixels[o + 3] = 255;
    }
  }
  return createImageBitmap(new ImageData(pixels, width, height));
}

function smoothNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
