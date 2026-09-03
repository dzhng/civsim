export type Rgb = [number, number, number];

interface IndexedMeshData {
  vertices: Float32Array;
  indices: Uint16Array;
  indexCount: number;
  /**
   * Optional per-vertex leaf-atlas UVs (2 floats per vertex). u < 0 marks an
   * untextured vertex (solid vertex color). Absent = whole mesh untextured.
   */
  uvs?: Float32Array;
}

export interface MeshData {
  opaque: IndexedMeshData;
  shadow: IndexedMeshData;
}

export class MeshBuilder {
  private opaqueVertices: number[] = [];
  private opaqueIndices: number[] = [];
  private shadowVertices: number[] = [];
  private shadowIndices: number[] = [];
  private shadowLayer = 0;

  box(center: [number, number, number], size: [number, number, number], color: Rgb, alpha: number) {
    const [cx, cy, cz] = center;
    const [sx, sy, sz] = [size[0] * 0.5, size[1] * 0.5, size[2] * 0.5];
    const corners: [number, number, number][] = [
      [cx - sx, cy - sy, cz - sz], [cx + sx, cy - sy, cz - sz], [cx + sx, cy + sy, cz - sz], [cx - sx, cy + sy, cz - sz],
      [cx - sx, cy - sy, cz + sz], [cx + sx, cy - sy, cz + sz], [cx + sx, cy + sy, cz + sz], [cx - sx, cy + sy, cz + sz],
    ];
    const faces: [number[], [number, number, number]][] = [
      [[0, 1, 2, 3], [0, 0, -1]],
      [[4, 7, 6, 5], [0, 0, 1]],
      [[0, 4, 5, 1], [0, -1, 0]],
      [[1, 5, 6, 2], [1, 0, 0]],
      [[2, 6, 7, 3], [0, 1, 0]],
      [[3, 7, 4, 0], [-1, 0, 0]],
    ];
    for (const [face, normal] of faces) {
      const base = this.opaqueVertices.length / 10;
      for (const idx of face) this.opaqueVertices.push(...corners[idx], ...normal, ...color, alpha);
      this.opaqueIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  shadow(radiusX: number, radiusY = radiusX * 0.62, alpha = 0.14, offset: [number, number] = [0.10, -0.04]) {
    const color: Rgb = [0.06, 0.05, 0.035];
    const center: [number, number, number] = [offset[0], offset[1], this.nextShadowZ()];
    const normal: [number, number, number] = [0, 0, 1];
    const ring: [number, number, number][] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      ring.push([center[0] + Math.cos(a) * radiusX, center[1] + Math.sin(a) * radiusY, center[2]]);
    }
    for (let i = 0; i < ring.length; i++) {
      const base = this.shadowVertices.length / 10;
      this.shadowVertices.push(
        ...center, ...normal, ...color, alpha + 0.05,
        ...ring[i], ...normal, ...color, alpha,
        ...ring[(i + 1) % ring.length], ...normal, ...color, alpha,
      );
      this.shadowIndices.push(base, base + 1, base + 2);
    }
  }

  contactShadow(center: [number, number], size: [number, number], alpha = 0.06, offset: [number, number] = [0.14, -0.18]) {
    const z = this.nextShadowZ();
    this.shadowQuad(center, size, alpha * 0.34, offset, 1.58, z);
    this.shadowQuad(center, size, alpha, offset, 1.0, z + 0.0002);
  }

  peak(center: [number, number, number], radius: number, height: number, sides: number, baseColor: Rgb, topColor: Rgb, seed: number) {
    const ring: [number, number, number][] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const r = radius * (0.78 + hash2(seed + i, 3) * 0.44);
      ring.push([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r, center[2]]);
    }
    const apex: [number, number, number] = [
      center[0] + (hash2(seed, 1) - 0.5) * radius * 0.22,
      center[1] + (hash2(seed, 2) - 0.5) * radius * 0.22,
      center[2] + height,
    ];
    for (let i = 0; i < sides; i++) {
      this.triangle(apex, ring[i], ring[(i + 1) % sides], topColor, baseColor, baseColor, 1);
    }
    for (let i = 1; i + 1 < ring.length; i++) {
      this.triangle(ring[0], ring[i + 1], ring[i], baseColor, baseColor, baseColor, 1);
    }
  }

  cone(center: [number, number, number], radius: number, height: number, sides: number, baseColor: Rgb, topColor: Rgb, seed: number) {
    const baseZ = center[2] - height * 0.5;
    const apex: [number, number, number] = [center[0], center[1], center[2] + height * 0.5];
    const ring: [number, number, number][] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const r = radius * (0.88 + hash2(seed + i, 7) * 0.22);
      ring.push([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r, baseZ]);
    }
    for (let i = 0; i < sides; i++) {
      this.triangle(apex, ring[i], ring[(i + 1) % sides], topColor, baseColor, baseColor, 1);
    }
  }

  blob(center: [number, number, number], radius: [number, number, number], color: Rgb, seed: number) {
    const [cx, cy, cz] = center;
    const [rx, ry, rz] = radius;
    const top: [number, number, number] = [cx + jitter(seed, 1, rx * 0.10), cy + jitter(seed, 2, ry * 0.10), cz + rz];
    const bottom: [number, number, number] = [cx + jitter(seed, 3, rx * 0.08), cy + jitter(seed, 4, ry * 0.08), cz - rz * 0.58];
    const ring: [number, number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const wave = 0.82 + hash2(seed + i, 19) * 0.30;
      ring.push([
        cx + Math.cos(a) * rx * wave,
        cy + Math.sin(a) * ry * (0.90 + hash2(seed, i + 29) * 0.18),
        cz + Math.sin(a * 1.7) * rz * 0.12,
      ]);
    }
    const topColor = scaleColor(color, 1.15);
    const sideColor = scaleColor(color, 0.88);
    for (let i = 0; i < ring.length; i++) {
      this.triangle(top, ring[i], ring[(i + 1) % ring.length], topColor, color, color, 1);
      this.triangle(bottom, ring[(i + 1) % ring.length], ring[i], sideColor, color, color, 1);
    }
  }

  // A filled disc (both faces) centered at `center`, facing along `axis`. Used
  // for things that must read as round at the game camera — cart wheels — where
  // a box would read as a leg.
  disc(center: [number, number, number], radius: number, axis: 'x' | 'y' | 'z', color: Rgb, alpha = 1, sides = 12) {
    const ring: [number, number, number][] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const c = Math.cos(a) * radius;
      const s = Math.sin(a) * radius;
      if (axis === 'x') ring.push([center[0], center[1] + c, center[2] + s]);
      else if (axis === 'y') ring.push([center[0] + c, center[1], center[2] + s]);
      else ring.push([center[0] + c, center[1] + s, center[2]]);
    }
    for (let i = 0; i < sides; i++) {
      const n = (i + 1) % sides;
      this.triangle(center, ring[i], ring[n], color, color, color, alpha);
      this.triangle(center, ring[n], ring[i], color, color, color, alpha);
    }
  }

  panel3d(points: [number, number, number][], color: Rgb, alpha: number) {
    if (points.length < 3) return;
    const normal = faceNormal(points[0], points[1], points[2]);
    const base = this.opaqueVertices.length / 10;
    for (const point of points) this.opaqueVertices.push(...point, ...normal, ...color, alpha);
    for (let i = 1; i < points.length - 1; i++) this.opaqueIndices.push(base, base + i, base + i + 1);
    const backBase = this.opaqueVertices.length / 10;
    const backNormal: [number, number, number] = [-normal[0], -normal[1], -normal[2]];
    for (const point of points) this.opaqueVertices.push(...point, ...backNormal, ...color, alpha);
    for (let i = 1; i < points.length - 1; i++) this.opaqueIndices.push(backBase, backBase + i + 1, backBase + i);
  }

  groundPanel(points: [number, number, number][], color: Rgb, alpha: number) {
    if (points.length < 3) return;
    const normal: [number, number, number] = [0, 0, 1];
    const base = this.opaqueVertices.length / 10;
    for (const point of points) this.opaqueVertices.push(...point, ...normal, ...color, alpha);
    for (let i = 1; i < points.length - 1; i++) this.opaqueIndices.push(base, base + i, base + i + 1);
  }

  // A flat quad graded from a near colour (p0,p3 edge) to a far colour (p1,p2
  // edge): used for receding backdrops (sea, distant slopes) that should darken
  // and haze into the horizon rather than read as one flat swatch.
  gradQuad(p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number], near: Rgb, far: Rgb) {
    this.triangle(p0, p1, p2, near, far, far, 1);
    this.triangle(p0, p2, p3, near, far, near, 1);
  }

  finish(label = 'mesh'): MeshData {
    if (this.opaqueIndices.length > 65535 || this.shadowIndices.length > 65535) throw new Error(`${label} exceeds uint16 index range`);
    return {
      opaque: {
        vertices: new Float32Array(this.opaqueVertices),
        indices: new Uint16Array(this.opaqueIndices),
        indexCount: this.opaqueIndices.length,
      },
      shadow: {
        vertices: new Float32Array(this.shadowVertices),
        indices: new Uint16Array(this.shadowIndices),
        indexCount: this.shadowIndices.length,
      },
    };
  }

  private triangle(a: [number, number, number], b: [number, number, number], c: [number, number, number], ca: Rgb, cb: Rgb, cc: Rgb, alpha: number) {
    const normal = faceNormal(a, b, c);
    const base = this.opaqueVertices.length / 10;
    this.opaqueVertices.push(...a, ...normal, ...ca, alpha, ...b, ...normal, ...cb, alpha, ...c, ...normal, ...cc, alpha);
    this.opaqueIndices.push(base, base + 1, base + 2);
  }

  private nextShadowZ() {
    return 0.024 + this.shadowLayer++ * 0.00045;
  }

  private shadowQuad(center: [number, number], size: [number, number], alpha: number, offset: [number, number], spread: number, z: number) {
    const color: Rgb = [0.055, 0.047, 0.035];
    const normal: [number, number, number] = [0, 0, 1];
    const cx = center[0] + offset[0];
    const cy = center[1] + offset[1];
    const sx = size[0] * spread * 0.5;
    const sy = size[1] * spread * 0.5;
    const base = this.shadowVertices.length / 10;
    this.shadowVertices.push(
      cx - sx, cy - sy, z, ...normal, ...color, alpha,
      cx + sx, cy - sy, z, ...normal, ...color, alpha,
      cx + sx, cy + sy, z, ...normal, ...color, alpha,
      cx - sx, cy + sy, z, ...normal, ...color, alpha,
    );
    this.shadowIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function faceNormal(a: [number, number, number], b: [number, number, number], c: [number, number, number]): [number, number, number] {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function hash2(x: number, y: number): number {
  let n = ((x * 374761393) | 0) + ((y * 668265263) | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function jitter(seed: number, salt: number, amount: number) {
  return (hash2(seed, salt) - 0.5) * amount;
}

function scaleColor(color: Rgb, scale: number): Rgb {
  return [
    Math.min(1, color[0] * scale),
    Math.min(1, color[1] * scale),
    Math.min(1, color[2] * scale),
  ];
}
