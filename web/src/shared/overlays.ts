// Line-overlay vertex helpers (x, y, r, g, b per vertex; GL_LINES pairs).

/** Formation-frame outline + facing tick at a prospective destination. */
export function pushGhost(verts: number[], x: number, y: number, facing: number, w: number, d: number, r: number, g: number, b: number) {
  const fx = Math.cos(facing), fy = Math.sin(facing);
  const rx = fy, ry = -fx;
  const hw = w / 2;
  const corners = [
    [x + rx * hw, y + ry * hw],
    [x - rx * hw, y - ry * hw],
    [x - rx * hw - fx * d, y - ry * hw - fy * d],
    [x + rx * hw - fx * d, y + ry * hw - fy * d],
  ];
  for (let k = 0; k < 4; k++) {
    const [x0, y0] = corners[k];
    const [x1, y1] = corners[(k + 1) % 4];
    verts.push(x0, y0, r, g, b, x1, y1, r, g, b);
  }
  verts.push(x, y, r, g, b, x + fx * 5, y + fy * 5, r, g, b);
}

/** Progress pie: an arc of `frac` of a full turn, 16ths, starting at 12 o'clock. */
export function pushPie(verts: number[], x: number, y: number, frac: number, R: number, r: number, g: number, b: number) {
  const segs = Math.max(2, Math.ceil(16 * frac));
  for (let s = 0; s < segs; s++) {
    const a0 = (s / 16) * Math.PI * 2 + Math.PI / 2;
    const a1 = ((s + 1) / 16) * Math.PI * 2 + Math.PI / 2;
    verts.push(
      x + Math.cos(a0) * R, y + Math.sin(a0) * R, r, g, b,
      x + Math.cos(a1) * R, y + Math.sin(a1) * R, r, g, b,
    );
  }
}

/** Full circle outline (selection rings). */
export function pushRing(verts: number[], x: number, y: number, R: number, segs: number, r: number, g: number, b: number) {
  for (let s = 0; s < segs; s++) {
    const a0 = (s / segs) * Math.PI * 2;
    const a1 = ((s + 1) / segs) * Math.PI * 2;
    verts.push(x + Math.cos(a0) * R, y + Math.sin(a0) * R, r, g, b,
               x + Math.cos(a1) * R, y + Math.sin(a1) * R, r, g, b);
  }
}
