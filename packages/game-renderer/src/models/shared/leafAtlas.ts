import { hash2 } from '../../../../renderer-core/src/math';
// Procedural alpha-cutout atlas for tree foliage. Upstream ez-tree gets its
// "many small leaves" look from alpha-tested cluster textures on each leaf
// quad — an opaque quad can never read finer than its own silhouette. This
// atlas is generated in code (deterministic, no asset pipeline): a broadleaf
// cluster tile and a pine needle-spray tile, alpha 0 between the leaves so the
// cutout does the work. RGB is a luminance multiplier over the mesh's vertex
// color (leaves keep the species palette; the texture only adds per-leaf
// shading grain), so one atlas serves every species.

interface LeafAtlasRegion {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

interface LeafAtlas {
  width: number;
  height: number;
  /** RGBA8, row-major from v=0. */
  rgba: Uint8Array;
  regions: { cluster: LeafAtlasRegion; needle: LeafAtlasRegion };
}

export type LeafStyle = keyof LeafAtlas['regions'];

const W = 256;
const H = 128;
// 2px transparent pad inside each tile so clamped linear sampling never bleeds
// across the tile seam or the quad edge.
const PAD = 2;

let cached: LeafAtlas | null = null;

export function buildLeafAtlas(): LeafAtlas {
  if (cached) return cached;
  const rgba = new Uint8Array(W * H * 4);
  drawClusterTile(rgba, 0, 128);
  drawNeedleTile(rgba, 128, 128);
  cached = {
    width: W,
    height: H,
    rgba,
    regions: {
      cluster: { u0: PAD / W, v0: PAD / H, u1: (128 - PAD) / W, v1: (H - PAD) / H },
      needle: { u0: (128 + PAD) / W, v0: PAD / H, u1: (W - PAD) / W, v1: (H - PAD) / H },
    },
  };
  return cached;
}

/** Overlapping serrated ovals: one quad reads as a handful of small leaves. */
function drawClusterTile(rgba: Uint8Array, x0: number, size: number): void {
  // Leaf centres stay a full leaf-radius inside the tile: a leaf clipped by
  // the tile edge puts a straight hard line back on the quad silhouette,
  // undoing the cutout.
  const leaves: { cx: number; cy: number; rx: number; ry: number; rot: number; lum: number }[] = [];
  for (let i = 0; i < 11; i++) {
    leaves.push({
      cx: 24 + hash2(i, 1) * (size - 48),
      cy: 22 + hash2(i, 2) * (H - 44),
      rx: 13 + hash2(i, 3) * 6,
      ry: 7 + hash2(i, 4) * 4,
      rot: hash2(i, 5) * Math.PI,
      lum: 0.74 + hash2(i, 6) * 0.42,
    });
  }
  for (let y = PAD; y < H - PAD; y++) {
    for (let x = PAD; x < size - PAD; x++) {
      let lum = 0;
      let hit = false;
      for (const leaf of leaves) {
        const dx = x - leaf.cx;
        const dy = y - leaf.cy;
        const lx = dx * Math.cos(leaf.rot) + dy * Math.sin(leaf.rot);
        const ly = -dx * Math.sin(leaf.rot) + dy * Math.cos(leaf.rot);
        const angle = Math.atan2(ly, lx);
        // Lobed edge so the silhouette reads as a leaf, not an egg.
        const serration = 1 + 0.14 * Math.sin(angle * 5 + leaf.rot * 3);
        const d = (lx / (leaf.rx * serration)) ** 2 + (ly / (leaf.ry * serration)) ** 2;
        if (d <= 1) {
          hit = true;
          // Brighter toward the leaf centre; last-drawn (topmost) leaf wins.
          lum = leaf.lum * (1.08 - 0.3 * d);
        }
      }
      if (hit) putTexel(rgba, x0 + x, y, lum);
    }
  }
}

/** Radiating tapered needles: one quad reads as a pine sprig. */
function drawNeedleTile(rgba: Uint8Array, x0: number, size: number): void {
  const needles: { bx: number; by: number; dx: number; dy: number; len: number; lum: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const angle = -Math.PI * 0.82 + hash2(i, 11) * Math.PI * 0.64; // up-ish fan
    needles.push({
      bx: 16 + hash2(i, 12) * (size - 32),
      by: H - 12 - hash2(i, 13) * 60,
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      len: 28 + hash2(i, 14) * 26,
      lum: 0.7 + hash2(i, 15) * 0.45,
    });
  }
  for (let y = PAD; y < H - PAD; y++) {
    for (let x = PAD; x < size - PAD; x++) {
      for (const n of needles) {
        const px = x - n.bx;
        const py = y - n.by;
        const along = px * n.dx + py * n.dy;
        if (along < 0 || along > n.len) continue;
        const across = Math.abs(px * -n.dy + py * n.dx);
        // Needles taper from ~3.2px half-width at the base to a point.
        if (across <= 3.2 * (1 - along / n.len) + 0.7) {
          putTexel(rgba, x0 + x, y, n.lum * (1.05 - (0.35 * along) / n.len));
          break;
        }
      }
    }
  }
}

/**
 * RGB encodes a luminance multiplier at ×1.5 shader gain (lum 1.0 → texel 170
 * → 170/255×1.5 = 1.0), leaving headroom for highlights above 1.
 */
export const LEAF_ATLAS_RGB_GAIN = 1.5;

function putTexel(rgba: Uint8Array, x: number, y: number, lum: number): void {
  const i = (y * W + x) * 4;
  const value = Math.max(0, Math.min(255, Math.round((lum * 255) / LEAF_ATLAS_RGB_GAIN)));
  rgba[i] = value;
  rgba[i + 1] = value;
  rgba[i + 2] = value;
  rgba[i + 3] = 255;
}

