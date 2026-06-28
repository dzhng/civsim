import type { RawFrameShell, WorldRenderPass } from '../../../webgpu-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../webgpu-core/src/cameraWgsl';
import { webGpuAlphaBlendColorTarget, webGpuOpaqueColorTarget, webGpuWorldDepthStencil } from '../../../webgpu-core/src/pipelineContracts';

export interface CampaignEntityInstance {
  x: number;
  y: number;
  radius: number;
  faction: [number, number, number];
  allegiance: [number, number, number];
  kind: 'city' | 'army';
  strength?: number;
}

interface MeshData {
  opaque: IndexedMeshData;
  shadow: IndexedMeshData;
}

interface IndexedMeshData {
  vertices: Float32Array;
  indices: Uint16Array;
  indexCount: number;
}

type Rgb = [number, number, number];

const ENTITY_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) light: f32,
  @location(2) livery: f32,
  @location(3) faction: vec3f,
  @location(4) allegiance: vec3f,
  @location(5) shade: f32,
  @location(6) alpha: f32,
};

@vertex
fn vs(
  @location(0) local: vec3f,
  @location(1) normal: vec3f,
  @location(2) colorAndAlpha: vec4f,
  @location(3) inst0: vec4f,
  @location(4) inst1: vec4f,
  @location(5) inst2: vec4f,
) -> VsOut {
  let scale = inst0.z;
  let world = vec3f(inst0.x + local.x * scale, inst0.y + local.y * scale, local.z * scale);
  var out: VsOut;
  out.pos = projectWorld3d(world, civsimCampaignWorldDepth3d(world));
  out.color = colorAndAlpha.rgb;
  out.livery = smoothstep(0.94, 0.99, min(colorAndAlpha.r, min(colorAndAlpha.g, colorAndAlpha.b)));
  out.alpha = colorAndAlpha.a;
  out.faction = inst1.rgb;
  out.allegiance = vec3f(inst1.a, inst2.r, inst2.g);
  let sun = normalize(vec3f(-0.42, -0.34, 0.84));
  let n = normalize(normal);
  out.light = clamp(dot(n, sun) * 0.38 + 0.76, 0.42, 1.12);
  out.shade = clamp(world.z / max(scale * 8.5, 0.001), 0.0, 1.0);
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let ownership = mix(in.color, in.faction, in.livery);
  let bronze = vec3f(0.84, 0.66, 0.34);
  let warmKey = vec3f(1.10, 1.00, 0.80);
  let coolFill = vec3f(0.70, 0.76, 0.86);
  let grade = mix(coolFill, warmKey, clamp((in.light - 0.42) / 0.70, 0.0, 1.0));
  var shaded = ownership * in.light * grade;
  shaded += bronze * smoothstep(0.64, 0.82, ownership.r) * smoothstep(0.42, 0.62, ownership.g) * 0.05;
  shaded = mix(shaded, vec3f(0.92, 0.82, 0.58), (1.0 - in.shade) * 0.025);
  return vec4f(clamp(shaded, vec3f(0.0), vec3f(1.0)), in.alpha);
}`;

export class CampaignEntityPass {
  private opaquePipeline: GPURenderPipeline;
  private shadowPipeline: GPURenderPipeline;
  private cityVertexBuffer: GPUBuffer;
  private cityIndexBuffer: GPUBuffer;
  private cityShadowVertexBuffer: GPUBuffer;
  private cityShadowIndexBuffer: GPUBuffer;
  private armyVertexBuffer: GPUBuffer;
  private armyIndexBuffer: GPUBuffer;
  private armyShadowVertexBuffer: GPUBuffer;
  private armyShadowIndexBuffer: GPUBuffer;
  private cityInstanceBuffer: GPUBuffer;
  private armyInstanceBuffer: GPUBuffer;
  private cityCapacity = 0;
  private armyCapacity = 0;
  private cityCount = 0;
  private armyCount = 0;
  private cityMesh = buildCityMesh();
  private armyMesh = buildArmyMesh();

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-entity-mesh-wgsl', code: ENTITY_WGSL });
    this.opaquePipeline = this.makePipeline(module, 'opaque');
    this.shadowPipeline = this.makePipeline(module, 'shadow');
    this.cityVertexBuffer = makeVertexBuffer(device, 'campaign-city-model-vertices', this.cityMesh.opaque.vertices);
    this.cityIndexBuffer = makeIndexBuffer(device, 'campaign-city-model-indices', this.cityMesh.opaque.indices);
    this.cityShadowVertexBuffer = makeVertexBuffer(device, 'campaign-city-shadow-vertices', this.cityMesh.shadow.vertices);
    this.cityShadowIndexBuffer = makeIndexBuffer(device, 'campaign-city-shadow-indices', this.cityMesh.shadow.indices);
    this.armyVertexBuffer = makeVertexBuffer(device, 'campaign-army-model-vertices', this.armyMesh.opaque.vertices);
    this.armyIndexBuffer = makeIndexBuffer(device, 'campaign-army-model-indices', this.armyMesh.opaque.indices);
    this.armyShadowVertexBuffer = makeVertexBuffer(device, 'campaign-army-shadow-vertices', this.armyMesh.shadow.vertices);
    this.armyShadowIndexBuffer = makeIndexBuffer(device, 'campaign-army-shadow-indices', this.armyMesh.shadow.indices);
    this.cityInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-city-empty-instances');
    this.armyInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-army-empty-instances');
  }

  private makePipeline(module: GPUShaderModule, material: 'opaque' | 'shadow') {
    const device = this.shell.device;
    return device.createRenderPipeline({
      label: material === 'opaque' ? 'campaign-entity-opaque-depth-pipeline' : 'campaign-entity-shadow-decal-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: 40,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x4' },
            ],
          },
          {
            arrayStride: 48,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 3, offset: 0, format: 'float32x4' },
              { shaderLocation: 4, offset: 16, format: 'float32x4' },
              { shaderLocation: 5, offset: 32, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          material === 'opaque'
            ? webGpuOpaqueColorTarget(this.shell.info.format)
            : webGpuAlphaBlendColorTarget(this.shell.info.format),
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: webGpuWorldDepthStencil(material === 'opaque' ? 'read-write' : 'read'),
    });
  }

  upload(instances: CampaignEntityInstance[]) {
    const cities = instances.filter((inst) => inst.kind === 'city');
    const armies = instances.filter((inst) => inst.kind === 'army');
    this.cityCount = cities.length;
    this.armyCount = armies.length;
    this.cityInstanceBuffer = this.ensureInstanceBuffer(this.cityInstanceBuffer, 'campaign-city-instances', cities.length, 'city');
    this.armyInstanceBuffer = this.ensureInstanceBuffer(this.armyInstanceBuffer, 'campaign-army-instances', armies.length, 'army');
    if (cities.length > 0) this.shell.device.queue.writeBuffer(this.cityInstanceBuffer, 0, packInstances(cities, 5.0));
    if (armies.length > 0) this.shell.device.queue.writeBuffer(this.armyInstanceBuffer, 0, packInstances(armies, 4.4));
  }

  draw(pass: WorldRenderPass) {
    this.drawShadows(pass);
    this.drawOpaque(pass);
  }

  private drawShadows(pass: WorldRenderPass) {
    if (this.cityCount === 0 && this.armyCount === 0) return;
    pass.setPipeline(this.shadowPipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    if (this.cityCount > 0) {
      pass.setVertexBuffer(0, this.cityShadowVertexBuffer);
      pass.setVertexBuffer(1, this.cityInstanceBuffer);
      pass.setIndexBuffer(this.cityShadowIndexBuffer, 'uint16');
      pass.drawIndexed(this.cityMesh.shadow.indexCount, this.cityCount);
    }
    if (this.armyCount > 0) {
      pass.setVertexBuffer(0, this.armyShadowVertexBuffer);
      pass.setVertexBuffer(1, this.armyInstanceBuffer);
      pass.setIndexBuffer(this.armyShadowIndexBuffer, 'uint16');
      pass.drawIndexed(this.armyMesh.shadow.indexCount, this.armyCount);
    }
  }

  private drawOpaque(pass: WorldRenderPass) {
    if (this.cityCount === 0 && this.armyCount === 0) return;
    pass.setPipeline(this.opaquePipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    if (this.cityCount > 0) {
      pass.setVertexBuffer(0, this.cityVertexBuffer);
      pass.setVertexBuffer(1, this.cityInstanceBuffer);
      pass.setIndexBuffer(this.cityIndexBuffer, 'uint16');
      pass.drawIndexed(this.cityMesh.opaque.indexCount, this.cityCount);
    }
    if (this.armyCount > 0) {
      pass.setVertexBuffer(0, this.armyVertexBuffer);
      pass.setVertexBuffer(1, this.armyInstanceBuffer);
      pass.setIndexBuffer(this.armyIndexBuffer, 'uint16');
      pass.drawIndexed(this.armyMesh.opaque.indexCount, this.armyCount);
    }
  }

  stats() {
    return {
      entities: this.cityCount + this.armyCount,
      cityMeshes: this.cityCount,
      armyMeshes: this.armyCount,
      cityModelVertices: (this.cityMesh.opaque.vertices.length + this.cityMesh.shadow.vertices.length) / 10,
      armyModelVertices: (this.armyMesh.opaque.vertices.length + this.armyMesh.shadow.vertices.length) / 10,
      materialClasses: ['opaque-depth-write', 'shadow-depth-read'] as const,
      layer: 'raw-webgpu-legacy-model-meshes',
    };
  }

  private ensureInstanceBuffer(buffer: GPUBuffer, label: string, count: number, bucket: 'city' | 'army') {
    const current = bucket === 'city' ? this.cityCapacity : this.armyCapacity;
    if (count <= current) return buffer;
    const next = Math.max(count, current * 2, 64);
    if (bucket === 'city') this.cityCapacity = next;
    else this.armyCapacity = next;
    return this.shell.device.createBuffer({
      label,
      size: next * 12 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
}

function packInstances(instances: CampaignEntityInstance[], radiusToScale: number) {
  const data = new Float32Array(instances.length * 12);
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const o = i * 12;
    data[o] = inst.x;
    data[o + 1] = inst.y;
    data[o + 2] = inst.radius / radiusToScale;
    data[o + 3] = inst.strength ?? 1;
    data.set(inst.faction, o + 4);
    data[o + 7] = inst.allegiance[0];
    data[o + 8] = inst.allegiance[1];
    data[o + 9] = inst.allegiance[2];
    data[o + 10] = inst.strength ?? 1;
  }
  return data;
}

function makeVertexBuffer(device: GPUDevice, label: string, data: Float32Array) {
  const buffer = device.createBuffer({ label, size: Math.max(4, data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  if (data.byteLength > 0) device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function makeIndexBuffer(device: GPUDevice, label: string, data: Uint16Array) {
  const upload = data.byteLength % 4 === 0 ? data : new Uint16Array(data.length + 1);
  if (upload !== data) upload.set(data);
  const buffer = device.createBuffer({ label, size: Math.max(4, upload.byteLength), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  if (upload.byteLength > 0) device.queue.writeBuffer(buffer, 0, upload);
  return buffer;
}

function makeEmptyInstanceBuffer(device: GPUDevice, label: string) {
  return device.createBuffer({ label, size: 12 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
}

function buildCityMesh(): MeshData {
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
  builder.box([mastX, mastY, 3.18], [0.18, 0.18, 6.36], darkTimber, 1);
  builder.panel3d([
    [mastX + 0.01, mastY, 6.42],
    [1.92, mastY, 6.26],
    [1.62, mastY, 5.70],
    [1.92, mastY, 5.14],
    [mastX + 0.01, mastY, 4.98],
  ], [1, 1, 1], 1);
  builder.box([mastX, mastY, 5.62], [0.14, 0.10, 1.82], darkTimber, 1);
  builder.box([1.02, mastY, 6.08], [1.82, 0.09, 0.10], darkTimber, 1);
  builder.box([mastX + 0.08, mastY - 0.05, 5.38], [0.12, 0.12, 1.38], darkTimber, 1);
  builder.box([0.94, mastY - 0.05, 5.08], [1.52, 0.08, 0.08], darkTimber, 1);
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
  return builder.finish();
}

function buildArmyMesh(): MeshData {
  const builder = new MeshBuilder();
  const timber: Rgb = [0.43, 0.30, 0.17];
  const linen: Rgb = [0.76, 0.64, 0.42];
  builder.shadow(2.20, 1.18, 0.18, [0.08, -0.24]);
  builder.contactShadow([0.08, -0.02], [1.92, 0.56], 0.115, [0.18, -0.24]);
  builder.contactShadow([0.06, -0.02], [0.48, 0.38], 0.096, [0.22, -0.28]);
  builder.contactShadow([0.90, 0.02], [1.68, 0.20], 0.064, [0.26, -0.30]);
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
  const slots: [number, number, boolean, boolean][] = [
    [-1.10, -0.70, true, true], [-0.38, -0.78, false, true], [0.34, -0.76, true, true], [1.04, -0.66, false, true],
    [-1.20, -0.12, false, true], [-0.48, -0.20, true, false], [0.24, -0.22, false, true], [0.96, -0.14, true, false],
    [-0.78, 0.48, false, true], [-0.08, 0.44, true, false], [0.62, 0.40, false, true],
  ];
  const orderedSlots = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => b.slot[1] - a.slot[1]);
  for (const { slot: [x, y, spear, shield] } of orderedSlots) {
    soldier(builder, x, y - 0.12, shield, spear, linen);
  }
  return builder.finish();
}

function soldier(builder: MeshBuilder, x: number, y: number, shield: boolean, spear: boolean, tunic: Rgb) {
  const skin: Rgb = [0.79, 0.60, 0.47];
  const bronze: Rgb = [0.72, 0.57, 0.28];
  const leather: Rgb = [0.34, 0.23, 0.14];
  const wood: Rgb = [0.47, 0.33, 0.19];
  builder.contactShadow([x, y], [0.48, 0.30], 0.074, [0.08, -0.12]);
  builder.box([x - 0.12, y, 0.34], [0.13, 0.14, 0.68], leather, 1);
  builder.box([x + 0.12, y, 0.34], [0.13, 0.14, 0.68], leather, 1);
  builder.box([x, y + 0.01, 0.96], [0.40, 0.30, 0.66], tunic, 1);
  builder.box([x, y + 0.02, 1.36], [0.25, 0.22, 0.24], skin, 1);
  builder.box([x, y + 0.03, 1.57], [0.27, 0.24, 0.17], bronze, 1);
  if (spear) builder.box([x + 0.30, y + 0.07, 1.02], [0.06, 0.07, 1.42], wood, 1);
  if (shield) builder.box([x - 0.31, y + 0.11, 0.88], [0.32, 0.10, 0.66], [1, 1, 1], 1);
}

class MeshBuilder {
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

  verticalPanel(points: [number, number][], y: number, depth: number, color: Rgb, alpha: number) {
    if (points.length < 3) return;
    const halfDepth = depth * 0.5;
    this.panelFace(points, y - halfDepth, [0, -1, 0], color, alpha, false);
    this.panelFace(points, y + halfDepth, [0, 1, 0], color, alpha, true);
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      const normal: [number, number, number] = [-dz / len, 0, dx / len];
      const base = this.opaqueVertices.length / 10;
      this.opaqueVertices.push(
        a[0], y - halfDepth, a[1], ...normal, ...color, alpha,
        b[0], y - halfDepth, b[1], ...normal, ...color, alpha,
        b[0], y + halfDepth, b[1], ...normal, ...color, alpha,
        a[0], y + halfDepth, a[1], ...normal, ...color, alpha,
      );
      this.opaqueIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
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

  private panelFace(points: [number, number][], y: number, normal: [number, number, number], color: Rgb, alpha: number, reverse: boolean) {
    const base = this.opaqueVertices.length / 10;
    for (const [x, z] of points) this.opaqueVertices.push(x, y, z, ...normal, ...color, alpha);
    for (let i = 1; i < points.length - 1; i++) {
      if (reverse) this.opaqueIndices.push(base, base + i + 1, base + i);
      else this.opaqueIndices.push(base, base + i, base + i + 1);
    }
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

  finish(): MeshData {
    if (this.opaqueIndices.length > 65535 || this.shadowIndices.length > 65535) throw new Error('campaign mesh exceeds uint16 index range');
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
