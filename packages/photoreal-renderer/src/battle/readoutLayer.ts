import * as THREE from "three/webgpu";
import {
  attribute,
  normalize,
  step,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { factionForTeam } from "../../../game-renderer/src/battle/factionColors";
import { linearAlbedo } from "./battleTsl";
import { RENDER_ORDER } from "./terrainLayer";

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
  team: 0 | 1;
  mine: boolean;
  hp: number;
  cohesion: number;
  morale: number;
  stamina: number;
  chips: readonly BattleReadoutChip[];
  selected: boolean;
}

interface RectInstance {
  anchor: readonly [number, number, number];
  worldPerPx: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  color: readonly [number, number, number, number];
}

interface ChipInstance extends RectInstance {
  key: string;
}

interface AtlasEntry {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  width: number;
  height: number;
}

const QUAD = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]);
const QUAD_INDEX = [0, 1, 2, 2, 1, 3];
// World-space nudge toward the camera so the standard's own geometry at the
// pole top can never depth-punch through the readout plane.
const READOUT_CAMERA_BIAS = 1.6;

const BAR_WIDTH = 58;
const BAR_HEIGHT = 4;
const BAR_GAP = 2;
const CHIP_GAP = 2;
const CHIP_ROW_WIDTH = 94;
const ENEMY_PLATE_WIDTH = 34;
const ENEMY_PLATE_HEIGHT = 7;
const BASELINE_OVERLAP_PX = 0.5;
const BAR_COLORS = {
  cohesion: [0.85, 0.78, 0.35, 0.95],
  morale: [0.5, 0.69, 0.41, 0.95],
  stamina: [0.35, 0.63, 0.85, 0.95],
  track: [0.035, 0.035, 0.045, 0.74],
  frame: [0.02, 0.018, 0.014, 0.78],
  selected: [0.31, 0.82, 0.39, 0.72],
} as const;

export class PhotorealReadoutLayer {
  private readonly rectMesh: THREE.Mesh;
  private readonly rectGeometry: THREE.InstancedBufferGeometry;
  private readonly chipMesh: THREE.Mesh;
  private readonly chipGeometry: THREE.InstancedBufferGeometry;
  private readonly camRight = uniform(new THREE.Vector3(1, 0, 0));
  private readonly camUp = uniform(new THREE.Vector3(0, 0, 1));
  private readonly camPos = uniform(new THREE.Vector3(0, 0, 0));
  private readonly camFwd = uniform(new THREE.Vector3(0, 1, 0));
  private readonly atlasTexture: THREE.CanvasTexture;
  private rectCapacity = 0;
  private chipCapacity = 0;
  private rect0 = new Float32Array(0);
  private rect1 = new Float32Array(0);
  private rectColor = new Float32Array(0);
  private chip0 = new Float32Array(0);
  private chip1 = new Float32Array(0);
  private chipUv = new Float32Array(0);
  private rectCount = 0;
  private chipCount = 0;
  private readoutCount = 0;
  private ownBars = 0;
  private enemyMarkers = 0;
  private selected = 0;
  private atlasKey = "";
  private atlasEntries = new Map<string, AtlasEntry>();
  private sampleAnchors: { unitId: number; x: number; y: number; z: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.rectGeometry = makeBillboardGeometry();
    this.chipGeometry = makeBillboardGeometry();

    const rectMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide });
    rectMaterial.depthTest = true;
    rectMaterial.depthWrite = false;
    rectMaterial.fog = false;
    const quad = attribute<"vec3">("position", "vec3");
    const rect0 = attribute<"vec4">("readoutRect0", "vec4");
    const rect1 = attribute<"vec4">("readoutRect1", "vec4");
    const color = varying(attribute<"vec4">("readoutColor", "vec4"));
    // Anchors behind the camera would rasterize mirrored garbage quads —
    // collapse them to a point instead. Anchors in front are biased toward
    // the camera so the standard's own pole/finial/cloth at the same point
    // cannot depth-punch torn fragments through the readout plane (terrain
    // occlusion still applies — the bias is small).
    const rectAnchor0 = vec3(rect0.x, rect0.y, rect0.z);
    const rectToCam = vec3(this.camPos).sub(rectAnchor0);
    const rectInFront = step(0.0, rectToCam.dot(vec3(this.camFwd)).negate());
    const rectAnchor = rectAnchor0.add(normalize(rectToCam).mul(READOUT_CAMERA_BIAS));
    rectMaterial.positionNode = rectAnchor
      .add(vec3(this.camRight).mul(rect1.x.add(quad.x.mul(rect1.z)).mul(rect0.w)).mul(rectInFront))
      .add(vec3(this.camUp).mul(rect1.y.add(quad.y.mul(rect1.w)).mul(rect0.w)).mul(rectInFront));
    rectMaterial.colorNode = vec4(linearAlbedo(color.rgb), color.a);

    this.rectMesh = new THREE.Mesh(this.rectGeometry, rectMaterial);
    this.rectMesh.name = "battle-unit-readout-bars";
    this.rectMesh.frustumCulled = false;
    this.rectMesh.renderOrder = RENDER_ORDER.worldOpaque + 1;
    this.rectMesh.visible = false;
    scene.add(this.rectMesh);

    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    this.atlasTexture = new THREE.CanvasTexture(canvas);
    this.atlasTexture.name = "battle-readout-chip-glyph-atlas";
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    // Mipmapped: chips minify hard for distant units, and linear-only
    // sampling eats the glyphs into torn strips.
    this.atlasTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.atlasTexture.magFilter = THREE.LinearFilter;
    this.atlasTexture.generateMipmaps = true;
    this.atlasTexture.needsUpdate = true;

    const chipMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide });
    chipMaterial.depthTest = true;
    chipMaterial.depthWrite = false;
    chipMaterial.fog = false;
    chipMaterial.alphaTest = 0.04;
    const chipQuad = attribute<"vec3">("position", "vec3");
    const chip0 = attribute<"vec4">("readoutChip0", "vec4");
    const chip1 = attribute<"vec4">("readoutChip1", "vec4");
    const chipUv = attribute<"vec4">("readoutChipUv", "vec4");
    const chipAnchor0 = vec3(chip0.x, chip0.y, chip0.z);
    const chipToCam = vec3(this.camPos).sub(chipAnchor0);
    const chipInFront = step(0.0, chipToCam.dot(vec3(this.camFwd)).negate());
    const chipAnchor = chipAnchor0.add(normalize(chipToCam).mul(READOUT_CAMERA_BIAS));
    chipMaterial.positionNode = chipAnchor
      .add(vec3(this.camRight).mul(chip1.x.add(chipQuad.x.mul(chip1.z)).mul(chip0.w)).mul(chipInFront))
      .add(vec3(this.camUp).mul(chip1.y.add(chipQuad.y.mul(chip1.w)).mul(chip0.w)).mul(chipInFront));
    const localUv = varying(chipQuad.xy.add(vec2(0.5))).toVar();
    const uv = vec2(
      chipUv.x.add(chipUv.z.sub(chipUv.x).mul(localUv.x)),
      chipUv.y.add(chipUv.w.sub(chipUv.y).mul(localUv.y)),
    );
    chipMaterial.colorNode = texture(this.atlasTexture, uv);

    this.chipMesh = new THREE.Mesh(this.chipGeometry, chipMaterial);
    this.chipMesh.name = "battle-unit-readout-chip-glyphs";
    this.chipMesh.frustumCulled = false;
    this.chipMesh.renderOrder = RENDER_ORDER.worldOpaque + 2;
    this.chipMesh.visible = false;
    scene.add(this.chipMesh);
  }

  setCameraBasis(camera: THREE.Camera): void {
    const m = camera.matrixWorld.elements;
    this.camRight.value.set(m[0], m[1], m[2]).normalize();
    this.camUp.value.set(m[4], m[5], m[6]).normalize();
    this.camPos.value.set(m[12], m[13], m[14]);
    // Column 2 is the camera's +z (backward); forward is its negation.
    this.camFwd.value.set(-m[8], -m[9], -m[10]).normalize();
  }

  upload(readouts: readonly BattleReadoutInstance[]): void {
    this.readoutCount = readouts.length;
    this.ownBars = 0;
    this.enemyMarkers = 0;
    this.selected = 0;
    this.sampleAnchors = readouts.slice(0, 64).map((r) => ({ unitId: r.unitId, x: r.x, y: r.y, z: r.z }));
    const rects: RectInstance[] = [];
    const chips: ChipInstance[] = [];
    for (const readout of readouts) {
      if (readout.selected) this.selected++;
      layoutReadout(readout, rects, chips);
      if (readout.mine) this.ownBars++;
      else this.enemyMarkers++;
    }
    this.ensureAtlas(chips);
    this.uploadRects(rects);
    this.uploadChips(chips);
  }

  stats() {
    return {
      readouts: this.readoutCount,
      rects: this.rectCount,
      chips: this.chipCount,
      ownBars: this.ownBars,
      enemyMarkers: this.enemyMarkers,
      selected: this.selected,
      anchors: this.sampleAnchors,
      atlasWidth: this.atlasTexture.image.width,
      atlasHeight: this.atlasTexture.image.height,
      layer: "photoreal-battle-readout-glyph-atlas" as const,
      depthPolicy: "depth-tested in-scene billboard; depthWrite=false; renderOrder after soldiers" as const,
      orientation: "camera-facing basis from the active three camera" as const,
    };
  }

  private uploadRects(rects: readonly RectInstance[]): void {
    this.rectCount = rects.length;
    this.rectMesh.visible = rects.length > 0;
    if (rects.length === 0) {
      this.rectGeometry.instanceCount = 0;
      return;
    }
    if (rects.length > this.rectCapacity) {
      this.rectCapacity = Math.max(rects.length, this.rectCapacity * 2, 128);
      this.rect0 = new Float32Array(this.rectCapacity * 4);
      this.rect1 = new Float32Array(this.rectCapacity * 4);
      this.rectColor = new Float32Array(this.rectCapacity * 4);
      this.rectGeometry.setAttribute("readoutRect0", new THREE.InstancedBufferAttribute(this.rect0, 4));
      this.rectGeometry.setAttribute("readoutRect1", new THREE.InstancedBufferAttribute(this.rect1, 4));
      this.rectGeometry.setAttribute("readoutColor", new THREE.InstancedBufferAttribute(this.rectColor, 4));
    }
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      const o = i * 4;
      this.rect0[o] = rect.anchor[0];
      this.rect0[o + 1] = rect.anchor[1];
      this.rect0[o + 2] = rect.anchor[2];
      this.rect0[o + 3] = rect.worldPerPx;
      this.rect1[o] = rect.offsetX;
      this.rect1[o + 1] = rect.offsetY;
      this.rect1[o + 2] = rect.width;
      this.rect1[o + 3] = rect.height;
      this.rectColor.set(rect.color, o);
    }
    for (const name of ["readoutRect0", "readoutRect1", "readoutColor"] as const) {
      (this.rectGeometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.rectGeometry.instanceCount = rects.length;
  }

  private uploadChips(chips: readonly ChipInstance[]): void {
    this.chipCount = chips.length;
    this.chipMesh.visible = chips.length > 0;
    if (chips.length === 0) {
      this.chipGeometry.instanceCount = 0;
      return;
    }
    if (chips.length > this.chipCapacity) {
      this.chipCapacity = Math.max(chips.length, this.chipCapacity * 2, 128);
      this.chip0 = new Float32Array(this.chipCapacity * 4);
      this.chip1 = new Float32Array(this.chipCapacity * 4);
      this.chipUv = new Float32Array(this.chipCapacity * 4);
      this.chipGeometry.setAttribute("readoutChip0", new THREE.InstancedBufferAttribute(this.chip0, 4));
      this.chipGeometry.setAttribute("readoutChip1", new THREE.InstancedBufferAttribute(this.chip1, 4));
      this.chipGeometry.setAttribute("readoutChipUv", new THREE.InstancedBufferAttribute(this.chipUv, 4));
    }
    for (let i = 0; i < chips.length; i++) {
      const chip = chips[i];
      const o = i * 4;
      const entry = this.atlasEntries.get(chip.key);
      if (!entry) {
        // Zero the slot — skipping leaves stale instance data from an earlier
        // frame rasterizing as orphan slivers at ghost anchors.
        this.chip0.fill(0, o, o + 4);
        this.chip1.fill(0, o, o + 4);
        this.chipUv.fill(0, o, o + 4);
        continue;
      }
      this.chip0[o] = chip.anchor[0];
      this.chip0[o + 1] = chip.anchor[1];
      this.chip0[o + 2] = chip.anchor[2];
      this.chip0[o + 3] = chip.worldPerPx;
      this.chip1[o] = chip.offsetX;
      this.chip1[o + 1] = chip.offsetY;
      this.chip1[o + 2] = entry.width;
      this.chip1[o + 3] = entry.height;
      this.chipUv[o] = entry.u0;
      this.chipUv[o + 1] = entry.v0;
      this.chipUv[o + 2] = entry.u1;
      this.chipUv[o + 3] = entry.v1;
    }
    for (const name of ["readoutChip0", "readoutChip1", "readoutChipUv"] as const) {
      (this.chipGeometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.chipGeometry.instanceCount = chips.length;
  }

  private ensureAtlas(chips: readonly ChipInstance[]): void {
    const keys = [...new Set(chips.map((chip) => chip.key))].sort();
    const key = keys.join("|");
    if (key === this.atlasKey) return;
    this.atlasKey = key;
    this.atlasEntries = buildChipAtlas(keys, this.atlasTexture);
  }
}

function makeBillboardGeometry(): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(QUAD, 3));
  geometry.setIndex(QUAD_INDEX);
  geometry.instanceCount = 0;
  return geometry;
}

function layoutReadout(
  readout: BattleReadoutInstance,
  rects: RectInstance[],
  chips: ChipInstance[],
): void {
  const anchor: [number, number, number] = [readout.x, readout.y, readout.z];
  const faction = factionForTeam(readout.team).primary;
  let cursorY = -BASELINE_OVERLAP_PX;
  let width = readout.mine ? BAR_WIDTH : ENEMY_PLATE_WIDTH;
  if (readout.mine) {
    pushSelection(readout, rects, anchor, width, 4 * BAR_HEIGHT + 3 * BAR_GAP);
    pushBarStack(readout, rects, anchor, faction, cursorY);
    cursorY += 4 * BAR_HEIGHT + 3 * BAR_GAP + CHIP_GAP;
  } else {
    const h = ENEMY_PLATE_HEIGHT;
    rects.push({
      anchor,
      worldPerPx: readout.worldPerPx,
      offsetX: 0,
      offsetY: cursorY + h * 0.5,
      width: ENEMY_PLATE_WIDTH,
      height: h,
      color: [faction[0], faction[1], faction[2], 0.9],
    });
    pushSelection(readout, rects, anchor, ENEMY_PLATE_WIDTH, h);
    cursorY += h + CHIP_GAP;
  }
  const chipLayout = layoutChips(readout);
  width = Math.max(width, chipLayout.width);
  for (const chip of chipLayout.chips) {
    chips.push({
      anchor,
      worldPerPx: readout.worldPerPx,
      offsetX: chip.x,
      offsetY: cursorY + chip.y,
      width: chip.width,
      height: chip.height,
      color: [1, 1, 1, 1],
      key: chip.key,
    });
  }
  if (readout.selected && chipLayout.height > 0) {
    pushSelection(readout, rects, anchor, width, cursorY + chipLayout.height + BASELINE_OVERLAP_PX);
  }
}

function pushBarStack(
  readout: BattleReadoutInstance,
  rects: RectInstance[],
  anchor: readonly [number, number, number],
  faction: readonly [number, number, number],
  baseY: number,
): void {
  const values = [
    { value: readout.hp, color: [faction[0], faction[1], faction[2], 0.98] as const },
    { value: readout.cohesion, color: BAR_COLORS.cohesion },
    { value: readout.morale, color: BAR_COLORS.morale },
    { value: readout.stamina, color: BAR_COLORS.stamina },
  ];
  for (let i = 0; i < values.length; i++) {
    const y = baseY + BAR_HEIGHT * 0.5 + i * (BAR_HEIGHT + BAR_GAP);
    rects.push({
      anchor,
      worldPerPx: readout.worldPerPx,
      offsetX: 0,
      offsetY: y,
      width: BAR_WIDTH + 3,
      height: BAR_HEIGHT + 2,
      color: BAR_COLORS.frame,
    });
    rects.push({
      anchor,
      worldPerPx: readout.worldPerPx,
      offsetX: 0,
      offsetY: y,
      width: BAR_WIDTH,
      height: BAR_HEIGHT,
      color: BAR_COLORS.track,
    });
    const fill = clamp01(values[i].value);
    rects.push({
      anchor,
      worldPerPx: readout.worldPerPx,
      offsetX: (fill - 1) * BAR_WIDTH * 0.5,
      offsetY: y,
      width: BAR_WIDTH * fill,
      height: BAR_HEIGHT,
      color: values[i].color,
    });
  }
}

function pushSelection(
  readout: BattleReadoutInstance,
  rects: RectInstance[],
  anchor: readonly [number, number, number],
  width: number,
  height: number,
): void {
  if (!readout.selected) return;
  rects.push({
    anchor,
    worldPerPx: readout.worldPerPx,
    offsetX: 0,
    offsetY: height * 0.5 - BASELINE_OVERLAP_PX,
    width: width + 8,
    height: height + 7,
    color: [BAR_COLORS.selected[0], BAR_COLORS.selected[1], BAR_COLORS.selected[2], 0.16],
  });
  const line = 2;
  const y0 = -BASELINE_OVERLAP_PX;
  const y1 = height - BASELINE_OVERLAP_PX;
  for (const [x, y, w, h] of [
    [0, y0, width + 8, line],
    [0, y1, width + 8, line],
    [-(width + 8) * 0.5, height * 0.5 - BASELINE_OVERLAP_PX, line, height + 6],
    [(width + 8) * 0.5, height * 0.5 - BASELINE_OVERLAP_PX, line, height + 6],
  ] as const) {
    rects.push({
      anchor,
      worldPerPx: readout.worldPerPx,
      offsetX: x,
      offsetY: y,
      width: w,
      height: h,
      color: BAR_COLORS.selected,
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

function buildChipAtlas(keys: readonly string[], textureAtlas: THREE.CanvasTexture): Map<string, AtlasEntry> {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const padding = Math.ceil(2 * dpr);
  const entries = new Map<string, AtlasEntry>();
  const metrics = keys.map((key) => {
    const text = keyText(key);
    return { key, text, width: Math.ceil(chipWidth(text) * dpr), height: Math.ceil(11 * dpr) };
  });
  const atlasWidth = Math.max(1, nextPow2(Math.max(64, ...metrics.map((m) => m.width + padding * 2))));
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
  const canvas = textureAtlas.image as HTMLCanvasElement;
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
  textureAtlas.needsUpdate = true;
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
  ctx.fillStyle = "rgba(14,16,20,0.82)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = kind === "bad" ? "rgba(255,122,107,0.45)" : kind === "hot" ? "rgba(255,196,107,0.45)" : "rgba(232,228,216,0.2)";
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();
  ctx.fillStyle = kind === "bad" ? "#ff7a6b" : kind === "hot" ? "#ffc46b" : "#e8e4d8";
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
  const measured = chipMeasureCtx ? Math.ceil(chipMeasureCtx.measureText(text).width) : text.length * 5;
  return Math.min(52, Math.max(18, measured + 8));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function nextPow2(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}
