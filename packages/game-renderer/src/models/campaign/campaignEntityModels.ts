import { MeshBuilder, type MeshData, type Rgb } from "../shared/meshBuilder";

/** Local-space ground height: roofs remain level and walls meet the surface.
 * Omitting it preserves the authored flat model used by model sheets. */
export function buildCityMesh(
  groundAt?: (x: number, y: number) => number,
): MeshData & { standardBase: number } {
  const builder = new MeshBuilder();
  const sandstone: Rgb = [0.82, 0.74, 0.56];
  const roof: Rgb = [0.66, 0.4, 0.3];
  const mastX = 0.08;
  const mastY = 0.04;
  builder.shadow(3.65, 1.95, 0.11, [0.28, -0.54]);
  builder.contactShadow([-0.82, mastY], [1.7, 0.18], 0.052, [0.34, -0.34]);
  const groundLevel = (x: number, y: number, w: number, d: number) => {
    let top = -Infinity,
      bottom = Infinity;
    for (let j = 0; j <= 4; j++)
      for (let i = 0; i <= 4; i++) {
        const z = groundAt?.(x + (i / 4 - 0.5) * w, y + (j / 4 - 0.5) * d) ?? 0;
        top = Math.max(top, z);
        bottom = Math.min(bottom, z);
      }
    return { top, bottom };
  };
  const building = (x: number, y: number, w: number, d: number, h: number) => {
    const { top: ground, bottom } = groundLevel(x, y, w, d);
    // Extend the original walls beneath local troughs. Terrain clips their visible
    // contact line, including slope changes between footprint samples.
    const foundation = groundAt ? bottom - h : 0;
    builder.contactShadow(
      [x, y],
      [w * 1.12, d * 1.08],
      Math.min(0.094, 0.042 + h * 0.011),
      [0.18, -0.22],
    );
    builder.box(
      [x, y, (foundation + ground + h) * 0.5],
      [w, d, ground + h - foundation],
      sandstone,
      1,
    );
    builder.box([x, y, ground + h + h * 0.19], [w * 1.18, d * 1.18, h * 0.38], roof, 1);
  };
  building(0, 0, 2.4, 2.4, 3.0);
  building(0.22, 0.08, 1.28, 1.14, 3.42);
  const mastGround = groundLevel(0.22, 0.08, 1.28, 1.14).top;
  builder.box([mastX, mastY, mastGround + 4.8], [0.54, 0.48, 0.2], sandstone, 1);
  builder.box([mastX, mastY, mastGround + 4.94], [0.34, 0.3, 0.16], roof, 1);
  let seed = 2654435761 | 0;
  const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x80000000;
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.9 + rand() * 3.0;
    building(
      Math.cos(a) * r,
      Math.sin(a) * r,
      0.8 + rand() * 1.0,
      0.8 + rand() * 1.0,
      1.1 + rand() * 1.4,
    );
  }
  building(0.92, -0.02, 1.15, 1.05, 2.85);
  builder.box(
    [1.02, -0.02, groundLevel(0.92, -0.02, 1.15, 1.05).top + 3.96],
    [0.42, 0.34, 0.12],
    [0.35, 0.24, 0.18],
    1,
  );
  return { ...builder.finish("campaign city mesh"), standardBase: mastGround };
}
