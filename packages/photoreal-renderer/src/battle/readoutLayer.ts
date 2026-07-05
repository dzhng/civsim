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
  chips: readonly BattleReadoutChip[];
}

interface ChipInstance {
  anchor: readonly [number, number, number];
  worldPerPx: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
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
const READOUT_CAMERA_BIAS = 0.9;

// Row gap; the first row also clears the finial ball by this margin.
const CHIP_GAP = 2;
const CHIP_ROW_WIDTH = 94;
// The finial ball sits right at the anchor — clear it or it pierces row 1.
const FINIAL_CLEARANCE_PX = 6;

export class PhotorealReadoutLayer {
  private readonly chipMesh: THREE.Mesh;
  private readonly chipGeometry: THREE.InstancedBufferGeometry;
  private readonly camRight = uniform(new THREE.Vector3(1, 0, 0));
  private readonly camUp = uniform(new THREE.Vector3(0, 0, 1));
  private readonly camPos = uniform(new THREE.Vector3(0, 0, 0));
  private readonly camFwd = uniform(new THREE.Vector3(0, 1, 0));
  private readonly atlasTexture: THREE.CanvasTexture;
  private chipCapacity = 0;
  private chip0 = new Float32Array(0);
  private chip1 = new Float32Array(0);
  private chipUv = new Float32Array(0);
  private chipCount = 0;
  private readoutCount = 0;
  private atlasKey = "";
  private atlasEntries = new Map<string, AtlasEntry>();
  private sampleAnchors: { unitId: number; x: number; y: number; z: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.chipGeometry = makeBillboardGeometry();

    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    this.atlasTexture = new THREE.CanvasTexture(canvas);
    this.atlasTexture.name = "battle-readout-chip-glyph-atlas";
    // Canvas-space UVs: the default flipY mirrors the multi-row atlas at
    // upload, so every cell samples the wrong row.
    this.atlasTexture.flipY = false;
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    // No mipmaps: chips render at ONE screen size now (constant-size
    // billboards), and mip levels average the dark plates into the
    // transparent padding — a washed-out grey smear.
    this.atlasTexture.minFilter = THREE.LinearFilter;
    this.atlasTexture.magFilter = THREE.LinearFilter;
    this.atlasTexture.generateMipmaps = false;
    this.atlasTexture.needsUpdate = true;

    // OPAQUE + alphaTest cutout, exactly like PhotorealMarkerLayer — the
    // ONE recipe proven to keep UI quads unwashed in this world (a
    // `transparent: true` quad ends up veiled by the transparent-pass
    // ordering against the sky backdrop). UI also opts out of the scene
    // tone-map (AgX desaturates chip colors) and of aerial fog.
    const chipMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    chipMaterial.depthTest = false;
    chipMaterial.depthWrite = false;
    chipMaterial.toneMapped = false;
    chipMaterial.fog = false;
    chipMaterial.alphaTest = 0.5;
    const chipQuad = attribute<"vec3">("position", "vec3");
    const chip0 = attribute<"vec4">("readoutChip0", "vec4");
    const chip1 = attribute<"vec4">("readoutChip1", "vec4");
    const chipUv = attribute<"vec4">("readoutChipUv", "vec4");
    // Anchors behind the camera would rasterize mirrored garbage quads —
    // collapse them to a point instead. Anchors in front are biased toward
    // the camera so the standard's own pole/finial/cloth at the same point
    // cannot depth-punch torn fragments through the readout plane (terrain
    // occlusion still applies — the bias is small).
    const chipAnchor0 = vec3(chip0.x, chip0.y, chip0.z);
    const chipToCam = vec3(this.camPos).sub(chipAnchor0);
    const chipInFront = step(0.0, chipToCam.dot(vec3(this.camFwd)).negate());
    const chipAnchor = chipAnchor0.add(normalize(chipToCam).mul(READOUT_CAMERA_BIAS));
    chipMaterial.positionNode = chipAnchor
      .add(vec3(this.camRight).mul(chip1.x.add(chipQuad.x.mul(chip1.z)).mul(chip0.w)).mul(chipInFront))
      .add(vec3(this.camUp).mul(chip1.y.add(chipQuad.y.mul(chip1.w)).mul(chip0.w)).mul(chipInFront));
    const localUv = varying(chipQuad.xy.add(vec2(0.5))).toVar();
    // Quad-local +y is screen-up but atlas v grows downward: v1 at the
    // quad bottom, v0 at the top.
    const uv = vec2(
      chipUv.x.add(chipUv.z.sub(chipUv.x).mul(localUv.x)),
      chipUv.w.add(chipUv.y.sub(chipUv.w).mul(localUv.y)),
    );
    chipMaterial.colorNode = texture(this.atlasTexture, uv);

    this.chipMesh = new THREE.Mesh(this.chipGeometry, chipMaterial);
    this.chipMesh.name = "battle-unit-readout-chip-glyphs";
    this.chipMesh.frustumCulled = false;
    this.chipMesh.renderOrder = RENDER_ORDER.readout;
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
    this.sampleAnchors = readouts.slice(0, 64).map((r) => ({ unitId: r.unitId, x: r.x, y: r.y, z: r.z }));
    const chips: ChipInstance[] = [];
    for (const readout of readouts) layoutReadout(readout, chips);
    this.ensureAtlas(chips);
    this.uploadChips(chips);
  }

  stats() {
    return {
      readouts: this.readoutCount,
      chips: this.chipCount,
      anchors: this.sampleAnchors,
      atlasWidth: this.atlasTexture.image.width,
      atlasHeight: this.atlasTexture.image.height,
      layer: "photoreal-battle-readout-glyph-atlas" as const,
      depthPolicy: "depth-tested in-scene billboard; toneMapped=false (UI, ungraded); renderOrder after soldiers" as const,
      orientation: "camera-facing basis from the active three camera" as const,
    };
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

// The readout is text-status chips ONLY — stats live in the unit card and
// faction identity lives on the flag itself. Rows stack upward from the pole
// top (anchor), row-wrapped by layoutChips.
function layoutReadout(readout: BattleReadoutInstance, chips: ChipInstance[]): void {
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
  // Kind carries the PLATE tint; the glyphs stay near-white — colored text
  // on a dark slab smears into unreadable blobs at gameplay size.
  ctx.fillStyle =
    kind === "bad" ? "rgba(74,20,14,0.94)" : kind === "hot" ? "rgba(82,54,10,0.94)" : "rgba(12,14,18,0.94)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = kind === "bad" ? "rgba(255,122,107,0.6)" : kind === "hot" ? "rgba(255,196,107,0.6)" : "rgba(232,228,216,0.25)";
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
  const measured = chipMeasureCtx ? Math.ceil(chipMeasureCtx.measureText(text).width) : text.length * 5;
  return Math.min(52, Math.max(18, measured + 8));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function nextPow2(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}
