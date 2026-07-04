import { MeshBuilder, type MeshData, type Rgb } from '../shared/meshBuilder';

export function buildCityMesh(): MeshData {
  const builder = new MeshBuilder();
  const sandstone: Rgb = [0.82, 0.74, 0.56];
  const roof: Rgb = [0.66, 0.40, 0.30];
  const mastX = 0.08;
  const mastY = 0.04;
  builder.shadow(3.65, 1.95, 0.11, [0.28, -0.54]);
  builder.contactShadow([-0.82, mastY], [1.70, 0.18], 0.052, [0.34, -0.34]);
  const building = (x: number, y: number, w: number, d: number, h: number) => {
    builder.contactShadow([x, y], [w * 1.12, d * 1.08], Math.min(0.094, 0.042 + h * 0.011), [0.18, -0.22]);
    builder.box([x, y, h * 0.5], [w, d, h], sandstone, 1);
    builder.box([x, y, h + h * 0.19], [w * 1.18, d * 1.18, h * 0.38], roof, 1);
  };
  building(0, 0, 2.4, 2.4, 3.0);
  building(0.22, 0.08, 1.28, 1.14, 3.42);
  builder.box([mastX, mastY, 4.80], [0.54, 0.48, 0.20], sandstone, 1);
  builder.box([mastX, mastY, 4.94], [0.34, 0.30, 0.16], roof, 1);
  let seed = 2654435761 | 0;
  const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x80000000;
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.9 + rand() * 3.0;
    building(Math.cos(a) * r, Math.sin(a) * r, 0.8 + rand() * 1.0, 0.8 + rand() * 1.0, 1.1 + rand() * 1.4);
  }
  building(0.92, -0.02, 1.15, 1.05, 2.85);
  builder.box([1.02, -0.02, 3.96], [0.42, 0.34, 0.12], [0.35, 0.24, 0.18], 1);
  return builder.finish('campaign city mesh');
}
