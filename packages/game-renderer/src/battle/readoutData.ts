export type BattleReadoutChipKind = "plain" | "hot" | "bad";

export interface BattleReadoutChip {
  text: string;
  kind?: BattleReadoutChipKind;
}

export interface BattleReadoutInstance {
  unitId: number;
  x: number;
  y: number;
  z: number;
  worldPerPx: number;
  chips: readonly BattleReadoutChip[];
}

export interface ChipInstance {
  anchor: readonly [number, number, number];
  worldPerPx: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  key: string;
}

export interface AtlasEntry {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  width: number;
  height: number;
}

export const QUAD = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]);
export const QUAD_INDEX = [0, 1, 2, 2, 1, 3];
// World-space nudge toward the camera so the standard's own geometry at the
// pole top can never depth-punch through the readout plane.
export const READOUT_CAMERA_BIAS = 0.9;

// Row gap; the first row also clears the finial ball by this margin.
const CHIP_GAP = 2;
const CHIP_ROW_WIDTH = 94;
// The finial ball sits right at the anchor — clear it or it pierces row 1.
const FINIAL_CLEARANCE_PX = 6;

// The readout is text-status chips ONLY — stats live in the unit card and
// faction identity lives on the flag itself. Rows stack upward from the pole
// top (anchor), row-wrapped by layoutChips.
export function layoutReadout(readout: BattleReadoutInstance, chips: ChipInstance[]): void {
  const anchor: [number, number, number] = [readout.x, readout.y, readout.z];
  const chipLayout = layoutChips(readout);
  for (const chip of chipLayout.chips) {
    chips.push({
      anchor,
      worldPerPx: readout.worldPerPx,
      offsetX: chip.x,
      offsetY: FINIAL_CLEARANCE_PX + chip.y,
      width: chip.width,
      height: chip.height,
      key: chip.key,
    });
  }
}

function layoutChips(readout: BattleReadoutInstance) {
  const chips = readout.chips.map((chip) => ({
    key: chipKey(chip.text, chip.kind ?? "plain"),
    width: chipWidth(chip.text),
    height: 11,
    x: 0,
    y: 0,
  }));
  let row: typeof chips = [];
  let rowWidth = 0;
  let y = 0;
  let maxWidth = 0;
  const placed: typeof chips = [];
  const flush = () => {
    if (row.length === 0) return;
    let x = -rowWidth * 0.5;
    for (const chip of row) {
      chip.x = x + chip.width * 0.5;
      chip.y = y + chip.height * 0.5;
      x += chip.width + CHIP_GAP;
      placed.push(chip);
    }
    maxWidth = Math.max(maxWidth, rowWidth);
    y += 13;
    row = [];
    rowWidth = 0;
  };
  for (const chip of chips) {
    const nextWidth = row.length === 0 ? chip.width : rowWidth + CHIP_GAP + chip.width;
    if (nextWidth > CHIP_ROW_WIDTH && row.length > 0) flush();
    rowWidth = row.length === 0 ? chip.width : rowWidth + CHIP_GAP + chip.width;
    row.push(chip);
  }
  flush();
  return { chips: placed, width: maxWidth, height: y > 0 ? y - 2 : 0 };
}

export function buildChipAtlas(
  keys: readonly string[],
  canvas: HTMLCanvasElement,
): Map<string, AtlasEntry> {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const padding = Math.ceil(2 * dpr);
  const entries = new Map<string, AtlasEntry>();
  const metrics = keys.map((key) => {
    const text = keyText(key);
    return { key, text, width: Math.ceil(chipWidth(text) * dpr), height: Math.ceil(11 * dpr) };
  });
  const atlasWidth = Math.max(
    1,
    nextPow2(Math.max(64, ...metrics.map((m) => m.width + padding * 2))),
  );
  let x = padding;
  let y = padding;
  let rowH = 0;
  for (const m of metrics) {
    if (x + m.width + padding > atlasWidth) {
      x = padding;
      y += rowH + padding;
      rowH = 0;
    }
    rowH = Math.max(rowH, m.height);
    x += m.width + padding;
  }
  const atlasHeight = Math.max(1, nextPow2(y + rowH + padding));
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for battle readout glyph atlas");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(8 * dpr)}px ui-monospace, Menlo, monospace`;
  x = padding;
  y = padding;
  rowH = 0;
  for (const m of metrics) {
    if (x + m.width + padding > atlasWidth) {
      x = padding;
      y += rowH + padding;
      rowH = 0;
    }
    rowH = Math.max(rowH, m.height);
    drawChip(ctx, keyText(m.key), keyKind(m.key), x, y, m.width, m.height, dpr);
    entries.set(m.key, {
      u0: x / atlasWidth,
      v0: y / atlasHeight,
      u1: (x + m.width) / atlasWidth,
      v1: (y + m.height) / atlasHeight,
      width: m.width / dpr,
      height: m.height / dpr,
    });
    x += m.width + padding;
  }
  return entries;
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  text: string,
  kind: BattleReadoutChipKind,
  x: number,
  y: number,
  w: number,
  h: number,
  dpr: number,
): void {
  const r = Math.max(2, Math.round(2 * dpr));
  // Kind carries the PLATE tint; the glyphs stay near-white — colored text
  // on a dark slab smears into unreadable blobs at gameplay size.
  ctx.fillStyle =
    kind === "bad"
      ? "rgba(74,20,14,0.94)"
      : kind === "hot"
        ? "rgba(82,54,10,0.94)"
        : "rgba(12,14,18,0.94)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle =
    kind === "bad"
      ? "rgba(255,122,107,0.6)"
      : kind === "hot"
        ? "rgba(255,196,107,0.6)"
        : "rgba(232,228,216,0.25)";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();
  ctx.fillStyle = "#f4f0e6";
  ctx.fillText(text, x + w * 0.5, y + h * 0.53);
}

function chipKey(text: string, kind: BattleReadoutChipKind): string {
  return `${kind}:${text}`;
}

function keyKind(key: string): BattleReadoutChipKind {
  const kind = key.slice(0, key.indexOf(":"));
  return kind === "hot" || kind === "bad" ? kind : "plain";
}

function keyText(key: string): string {
  return key.slice(key.indexOf(":") + 1);
}

// Real text metrics — a length*k estimate under-sizes wide glyphs (the
// gallery's swords chip), which then overflow their atlas cell and bleed
// torn pixels into neighboring chips.
let chipMeasureCtx: CanvasRenderingContext2D | null = null;

function chipWidth(text: string): number {
  if (!chipMeasureCtx) {
    chipMeasureCtx = document.createElement("canvas").getContext("2d");
    if (chipMeasureCtx) chipMeasureCtx.font = "8px ui-monospace, Menlo, monospace";
  }
  const measured = chipMeasureCtx
    ? Math.ceil(chipMeasureCtx.measureText(text).width)
    : text.length * 5;
  return Math.min(52, Math.max(18, measured + 8));
}

function nextPow2(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

export function packReadoutChips(
  chips: readonly ChipInstance[],
  entries: ReadonlyMap<string, AtlasEntry>,
  chip0 = new Float32Array(chips.length * 4),
  chip1 = new Float32Array(chips.length * 4),
  chipUv = new Float32Array(chips.length * 4),
) {
  for (let i = 0; i < chips.length; i++) {
    const chip = chips[i];
    const o = i * 4;
    const entry = entries.get(chip.key);
    if (!entry) {
      // Zero the slot — skipping leaves stale instance data from an earlier
      // frame rasterizing as orphan slivers at ghost anchors.
      chip0.fill(0, o, o + 4);
      chip1.fill(0, o, o + 4);
      chipUv.fill(0, o, o + 4);
      continue;
    }
    chip0[o] = chip.anchor[0];
    chip0[o + 1] = chip.anchor[1];
    chip0[o + 2] = chip.anchor[2];
    chip0[o + 3] = chip.worldPerPx;
    chip1[o] = chip.offsetX;
    chip1[o + 1] = chip.offsetY;
    chip1[o + 2] = entry.width;
    chip1[o + 3] = entry.height;
    chipUv[o] = entry.u0;
    chipUv[o + 1] = entry.v0;
    chipUv[o + 2] = entry.u1;
    chipUv[o + 3] = entry.v1;
  }
  return { chip0, chip1, chipUv };
}
