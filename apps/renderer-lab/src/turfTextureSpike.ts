import * as THREE from "three/webgpu";
import { cos, float, sin, sqrt, texture, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import {
  smoothstepN,
  vnoiseN,
  type Vec2Node,
  type Vec3Node,
} from "../../../packages/photoreal-renderer/src/battle/battleTsl";

// Workbench-only record of battle-ground-turf slice 00's rejected baked-strand
// experiment. Production must not import this module; slice 03 replaces the
// failed bake/sampler with an in-shader anisotropic detail owner.

export type TurfRgb = readonly [number, number, number];

export interface TurfBakePalette {
  base: TurfRgb;
  root: TurfRgb;
  mid: TurfRgb;
  tip: TurfRgb;
}

export interface TurfBakeSpec {
  sizePx: number;
  tileWorldM: number;
  seed: number;
  strokeCount: number;
  palette: TurfBakePalette;
}

export interface BakedTurfTexture {
  texture: THREE.Texture;
  spec: TurfBakeSpec;
  pixelHash: string;
  bakeMs: number;
}

interface TurfStroke {
  x: number;
  y: number;
  angle: number;
  length: number;
  bend: number;
  width: number;
  colorIndex: 0 | 1 | 2;
}

/** Fixed spike palette, derived from the green-grass cover and blade family. */
export const TURF_SPIKE_PALETTE: TurfBakePalette = {
  base: [0.4, 0.49, 0.26],
  root: [0.29, 0.37, 0.18],
  mid: [0.46, 0.52, 0.27],
  tip: [0.65, 0.62, 0.34],
};

export function bakeTurfStrandTexture(spec: TurfBakeSpec): BakedTurfTexture {
  validateSpec(spec);
  const start = performance.now();
  const canvas = document.createElement("canvas");
  canvas.width = spec.sizePx;
  canvas.height = spec.sizePx;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable for turf strand bake");

  ctx.fillStyle = "rgb(128 128 128)";
  ctx.fillRect(0, 0, spec.sizePx, spec.sizePx);
  for (const stroke of planTurfStrands(spec)) drawToroidalStroke(ctx, spec, stroke);

  const image = ctx.getImageData(0, 0, spec.sizePx, spec.sizePx);
  renormalizeEncodedMean(image.data);
  ctx.putImageData(image, 0, 0);

  const baked = new THREE.CanvasTexture(canvas);
  baked.name = `battle-turf-strands-${spec.sizePx}-${spec.seed >>> 0}`;
  baked.colorSpace = THREE.NoColorSpace;
  baked.wrapS = THREE.RepeatWrapping;
  baked.wrapT = THREE.RepeatWrapping;
  baked.minFilter = THREE.LinearMipmapLinearFilter;
  baked.magFilter = THREE.LinearFilter;
  baked.generateMipmaps = true;
  // WebGPURenderer clamps this request to the adapter limit.
  baked.anisotropy = 4;
  baked.needsUpdate = true;
  return {
    texture: baked,
    spec,
    pixelHash: hashBytes(image.data),
    bakeMs: performance.now() - start,
  };
}

/** Pure stroke plan: the unit-test seam for seed determinism, independent of
 * browser canvas rasterization. The browser scene separately pins final pixel
 * bytes across two cold bakes. */
export function turfBakeSignature(spec: TurfBakeSpec): string {
  validateSpec(spec);
  const values = planTurfStrands(spec).flatMap((stroke) => [
    stroke.x,
    stroke.y,
    stroke.angle,
    stroke.length,
    stroke.bend,
    stroke.width,
    stroke.colorIndex,
  ]);
  return hashBytes(new Uint8Array(new Float32Array(values).buffer));
}

/** Two rotated/offset taps break the generated tile's axis-aligned period.
 * Detail remains centered on one: the variance correction prevents a 50/50
 * blend from washing the strand contrast into a flat field. */
export function turfDetailNode(
  baked: BakedTurfTexture,
  worldXY: Vec2Node,
  opts: { scale: number; strength: number },
): Vec3Node {
  // Global incommensurate transforms keep UV continuous. A macro-cell reset
  // would hide the tile period by replacing it with a hard 12 m phase grid.
  const angle1 = float(seedUnit(baked.spec.seed ^ 0xa511e9b3) * Math.PI * 2);
  const angle2 = float(seedUnit(baked.spec.seed ^ 0x63d83595) * Math.PI * 2 + 1.91);
  const uv1 = rotateNode(worldXY, angle1)
    .div(opts.scale)
    .add(vec2(seedUnit(baked.spec.seed ^ 0x9e3779b9), seedUnit(baked.spec.seed ^ 0x85ebca6b)));
  const uv2 = rotateNode(worldXY, angle2)
    .div(opts.scale)
    .add(vec2(seedUnit(baked.spec.seed ^ 0xc2b2ae35), seedUnit(baked.spec.seed ^ 0x27d4eb2f)));
  // The final trial used a small negative bias. It stabilized the transition,
  // but did not preserve credible turf character; the slice verdict is KILL.
  const a = texture(baked.texture, uv1).bias(float(-0.55)).rgb.mul(2).sub(1).toVar();
  const b = texture(baked.texture, uv2).bias(float(-0.55)).rgb.mul(2).sub(1).toVar();
  const weight = smoothstepN(0.25, 0.75, vnoiseN(worldXY.mul(0.075).add(vec2(4.2, 8.7)))).toVar();
  const invWeight = float(1).sub(weight).toVar();
  const variance = sqrt(weight.mul(weight).add(invWeight.mul(invWeight))).toVar();
  const centered = a.mul(invWeight).add(b.mul(weight)).div(variance);
  return vec3(1).add(centered.mul(opts.strength));
}

/** Deliberately periodic control used only by the spike workbench. */
export function turfNaiveDetailNode(
  baked: BakedTurfTexture,
  worldXY: Vec2Node,
  opts: { scale: number; strength: number },
): Vec3Node {
  const centered = texture(baked.texture, worldXY.div(opts.scale))
    .bias(float(-0.55))
    .rgb.mul(2)
    .sub(1);
  return vec3(1).add(centered.mul(opts.strength));
}

function planTurfStrands(spec: TurfBakeSpec): TurfStroke[] {
  const random = mulberry32(spec.seed);
  const scales = [0.2, 0.6, 1.4] as const;
  const strokes: TurfStroke[] = [];
  for (let i = 0; i < spec.strokeCount; i++) {
    const tier = random() < 0.58 ? 0 : random() < 0.78 ? 1 : 2;
    const pxPerM = spec.sizePx / spec.tileWorldM;
    let x = 0;
    let y = 0;
    // Broad density islands break the evenly sprayed carpet read. Candidate
    // positions are rejected, rather than changing stroke alpha, so sparse
    // pockets genuinely expose the base while tangles overlap in clusters.
    for (let attempt = 0; attempt < 24; attempt++) {
      x = random() * spec.sizePx;
      y = random() * spec.sizePx;
      if (random() <= 0.14 + clusterField(x / spec.sizePx, y / spec.sizePx, spec.seed) * 0.86)
        break;
    }
    strokes.push({
      x,
      y,
      angle: random() * Math.PI * 2,
      length: scales[tier] * pxPerM * (0.45 + random() * 1.3),
      bend: (random() - 0.5) * (0.7 + tier * 0.22),
      width: Math.max(0.7, (0.018 + tier * 0.01) * pxPerM * (0.75 + random() * 0.5)),
      colorIndex: Math.floor(random() * 3) as 0 | 1 | 2,
    });
  }
  return strokes;
}

function drawToroidalStroke(
  ctx: CanvasRenderingContext2D,
  spec: TurfBakeSpec,
  stroke: TurfStroke,
): void {
  const colors = [spec.palette.root, spec.palette.mid, spec.palette.tip] as const;
  const color = multiplierColor(colors[stroke.colorIndex], spec.palette.base);
  const size = spec.sizePx;
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) drawStroke(ctx, stroke, ox, oy, color);
  }
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: TurfStroke,
  ox: number,
  oy: number,
  color: string,
): void {
  const nx = -Math.sin(stroke.angle);
  const ny = Math.cos(stroke.angle);
  const dx = Math.cos(stroke.angle) * stroke.length;
  const dy = Math.sin(stroke.angle) * stroke.length;
  const x0 = stroke.x + ox - dx * 0.5;
  const y0 = stroke.y + oy - dy * 0.5;
  const x1 = stroke.x + ox + dx * 0.5;
  const y1 = stroke.y + oy + dy * 0.5;
  const cx = stroke.x + ox + nx * stroke.bend * stroke.length;
  const cy = stroke.y + oy + ny * stroke.bend * stroke.length;

  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = stroke.width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.45, stroke.width * 0.45);
  ctx.strokeStyle = "rgba(205 194 119 / 0.28)";
  ctx.beginPath();
  ctx.moveTo(stroke.x + ox, stroke.y + oy);
  ctx.quadraticCurveTo((cx + x1) * 0.5, (cy + y1) * 0.5, x1, y1);
  ctx.stroke();
}

function clusterField(x: number, y: number, seed: number): number {
  const phase = seedUnit(seed ^ 0x51ed270b) * Math.PI * 2;
  const broad = Math.sin((x * 1.7 + y * 0.8) * Math.PI * 2 + phase);
  const cross = Math.sin((x * -0.9 + y * 2.3) * Math.PI * 2 - phase * 0.63);
  const value = broad * 0.58 + cross * 0.42;
  return Math.max(0, Math.min(1, value * 0.5 + 0.5)) ** 1.7;
}

function multiplierColor(color: TurfRgb, base: TurfRgb): string {
  const encoded = color.map((value, channel) =>
    Math.round(Math.max(0.24, Math.min(0.78, value / base[channel] / 2)) * 255),
  );
  return `rgb(${encoded[0]} ${encoded[1]} ${encoded[2]})`;
}

function renormalizeEncodedMean(data: Uint8ClampedArray): void {
  const pixels = data.length / 4;
  for (let channel = 0; channel < 3; channel++) {
    let sum = 0;
    for (let i = channel; i < data.length; i += 4) sum += data[i];
    const target = Math.round(pixels * 127.5);
    const scale = target / sum;
    sum = 0;
    for (let i = channel; i < data.length; i += 4) {
      data[i] = Math.max(1, Math.min(254, Math.round(data[i] * scale)));
      sum += data[i];
    }
    let residual = target - sum;
    for (let pixel = 0; residual !== 0 && pixel < pixels * 3; pixel++) {
      const i = ((pixel * 7919) % pixels) * 4 + channel;
      const step = residual > 0 ? 1 : -1;
      if ((step > 0 && data[i] < 254) || (step < 0 && data[i] > 1)) {
        data[i] += step;
        residual -= step;
      }
    }
  }
}

function rotateNode(value: Vec2Node, angle: Node<"float">): Vec2Node {
  const c = cos(angle);
  const s = sin(angle);
  return vec2(value.x.mul(c).sub(value.y.mul(s)), value.x.mul(s).add(value.y.mul(c)));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seedUnit(seed: number): number {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function hashBytes(bytes: Uint8Array | Uint8ClampedArray): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function validateSpec(spec: TurfBakeSpec): void {
  if (!Number.isInteger(spec.sizePx) || spec.sizePx < 32)
    throw new Error("turf bake sizePx must be an integer >= 32");
  if (!(spec.tileWorldM > 0)) throw new Error("turf bake tileWorldM must be positive");
  if (!Number.isInteger(spec.strokeCount) || spec.strokeCount < 1)
    throw new Error("turf bake strokeCount must be a positive integer");
}
