import { MeshBuilder, type MeshData, type Rgb } from '../shared/meshBuilder';

export function buildCityMesh(): MeshData {
  const builder = new MeshBuilder();
  const sandstone: Rgb = [0.82, 0.74, 0.56];
  const roof: Rgb = [0.66, 0.40, 0.30];
  const timber: Rgb = [0.45, 0.36, 0.28];
  const darkTimber: Rgb = [0.28, 0.20, 0.15];
  const mastX = 0.08;
  const mastY = 0.04;
  builder.shadow(3.65, 1.95, 0.11, [0.28, -0.54]);
  builder.contactShadow([mastX, mastY], [0.42, 0.34], 0.086, [0.28, -0.32]);
  builder.contactShadow([-0.82, mastY], [1.70, 0.18], 0.052, [0.34, -0.34]);
  builder.box([mastX, mastY, 3.46], [0.18, 0.18, 6.92], darkTimber, 1);
  builder.panel3d([
    [mastX + 0.01, mastY, 6.50],
    [1.92, mastY, 6.34],
    [1.62, mastY, 5.78],
    [1.92, mastY, 5.22],
    [mastX + 0.01, mastY, 5.06],
  ], [1, 1, 1], 1);
  builder.box([mastX, mastY, 5.70], [0.14, 0.10, 1.82], darkTimber, 1);
  builder.box([mastX, mastY, 6.98], [0.26, 0.22, 0.18], [0.72, 0.57, 0.28], 1);
  builder.box([1.02, mastY, 6.16], [1.82, 0.09, 0.10], darkTimber, 1);
  builder.box([mastX + 0.08, mastY - 0.05, 5.46], [0.12, 0.12, 1.38], darkTimber, 1);
  builder.box([0.94, mastY - 0.05, 5.16], [1.52, 0.08, 0.08], darkTimber, 1);
  builder.box([mastX, mastY, 3.62], [0.30, 0.22, 0.24], [0.35, 0.24, 0.18], 1);
  builder.panel3d([
    [mastX - 0.02, mastY, 2.05],
    [-0.48, mastY, 1.96],
    [-0.48, mastY, 0.82],
    [mastX - 0.02, mastY, 0.92],
  ], [1, 1, 1], 1);
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

// The army stack's standard: pole, finial, cross-arms, and flag cloth. The
// soldiers that used to be baked into this marker are now the shared skinned
// crowd (buildStackCrowd + SkinnedCrowdPipeline); the standard remains as the
// faction-coloured banner (the flag's white panels take the faction livery),
// and doubles as the marker the LOD collapses to when zoomed out.
export function buildCampaignStandardMesh(): MeshData {
  const builder = new MeshBuilder();
  const timber: Rgb = [0.43, 0.30, 0.17];
  // A small soft shadow anchors the pole base; the figures carry their own
  // shared grounding shadows now, so the wide block footprint is gone.
  builder.shadow(0.62, 0.42, 0.16, [0.06, -0.14]);
  builder.contactShadow([0.06, -0.02], [0.40, 0.30], 0.09, [0.14, -0.20]);
  builder.box([0, 0, 2.38], [0.16, 0.16, 4.76], timber, 1);
  builder.box([0, 0, 4.84], [0.28, 0.28, 0.22], [0.72, 0.57, 0.28], 1);
  builder.box([0.08, -0.11, 3.80], [0.12, 0.12, 1.20], timber, 1);
  builder.box([0.86, -0.06, 4.26], [1.54, 0.08, 0.08], timber, 1);
  builder.box([0.86, -0.04, 3.30], [1.54, 0.08, 0.08], timber, 1);
  builder.panel3d([
    [0.08, -0.10, 4.34],
    [1.02, 0.00, 4.27],
    [1.02, 0.00, 3.28],
    [0.08, -0.10, 3.22],
  ], [1, 1, 1], 1);
  builder.panel3d([
    [1.02, 0.00, 4.27],
    [1.70, 0.20, 4.20],
    [1.42, 0.20, 3.78],
    [1.70, 0.20, 3.36],
    [1.02, 0.00, 3.28],
  ], [1, 1, 1], 1);
  return builder.finish('campaign standard mesh');
}
