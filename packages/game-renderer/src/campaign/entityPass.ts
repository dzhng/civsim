import type { RawFrameShell } from '../../../webgpu-core/src/frameShell';

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
  vertices: Float32Array;
  indices: Uint16Array;
  indexCount: number;
}

type Rgb = [number, number, number];

const ENTITY_WGSL = `
struct Camera { x:f32, y:f32, zoom:f32, cosP:f32, width:f32, height:f32, cosYaw:f32, sinYaw:f32, perspective:f32, pad0:f32, pad1:f32, pad2:f32 };
@group(0) @binding(0) var<uniform> cam: Camera;

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

fn projectWorld(world: vec3f, z: f32) -> vec4f {
  let dx = world.x - cam.x;
  let dy = world.y - cam.y;
  let rx = dx * cam.cosYaw + dy * cam.sinYaw;
  let ry = -dx * cam.sinYaw + dy * cam.cosYaw;
  let depth = max(0.32, 1.0 + ry * cam.perspective);
  return vec4f(
    (rx * cam.zoom) / (cam.width * 0.5),
    (ry * cam.zoom * cam.cosP + world.z * cam.zoom) / (cam.height * 0.5),
    z * depth,
    depth
  );
}

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
  out.pos = projectWorld(world, 0.02);
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
  private pipeline: GPURenderPipeline;
  private cityVertexBuffer: GPUBuffer;
  private cityIndexBuffer: GPUBuffer;
  private armyVertexBuffer: GPUBuffer;
  private armyIndexBuffer: GPUBuffer;
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
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-entity-mesh-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
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
        targets: [{
          format: shell.info.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    this.cityVertexBuffer = makeVertexBuffer(device, 'campaign-city-model-vertices', this.cityMesh.vertices);
    this.cityIndexBuffer = makeIndexBuffer(device, 'campaign-city-model-indices', this.cityMesh.indices);
    this.armyVertexBuffer = makeVertexBuffer(device, 'campaign-army-model-vertices', this.armyMesh.vertices);
    this.armyIndexBuffer = makeIndexBuffer(device, 'campaign-army-model-indices', this.armyMesh.indices);
    this.cityInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-city-empty-instances');
    this.armyInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-army-empty-instances');
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

  draw(pass: GPURenderPassEncoder) {
    if (this.cityCount === 0 && this.armyCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    if (this.cityCount > 0) {
      pass.setVertexBuffer(0, this.cityVertexBuffer);
      pass.setVertexBuffer(1, this.cityInstanceBuffer);
      pass.setIndexBuffer(this.cityIndexBuffer, 'uint16');
      pass.drawIndexed(this.cityMesh.indexCount, this.cityCount);
    }
    if (this.armyCount > 0) {
      pass.setVertexBuffer(0, this.armyVertexBuffer);
      pass.setVertexBuffer(1, this.armyInstanceBuffer);
      pass.setIndexBuffer(this.armyIndexBuffer, 'uint16');
      pass.drawIndexed(this.armyMesh.indexCount, this.armyCount);
    }
  }

  stats() {
    return {
      entities: this.cityCount + this.armyCount,
      cityMeshes: this.cityCount,
      armyMeshes: this.armyCount,
      cityModelVertices: this.cityMesh.vertices.length / 10,
      armyModelVertices: this.armyMesh.vertices.length / 10,
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
  const buffer = device.createBuffer({ label, size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function makeIndexBuffer(device: GPUDevice, label: string, data: Uint16Array) {
  const upload = data.byteLength % 4 === 0 ? data : new Uint16Array(data.length + 1);
  if (upload !== data) upload.set(data);
  const buffer = device.createBuffer({ label, size: upload.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buffer, 0, upload);
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
  builder.shadow(3.65, 1.95, 0.14, [0.28, -0.54]);
  builder.box([0.46, 0.02, 4.70], [0.20, 0.20, 9.4], timber, 1);
  const building = (x: number, y: number, w: number, d: number, h: number) => {
    builder.box([x, y, h * 0.5], [w, d, h], sandstone, 1);
    builder.box([x, y, h + h * 0.19], [w * 1.18, d * 1.18, h * 0.38], roof, 1);
  };
  building(0, 0, 2.4, 2.4, 3.0);
  let seed = 2654435761 | 0;
  const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x80000000;
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const r = 0.9 + rand() * 3.0;
    building(Math.cos(a) * r, Math.sin(a) * r, 0.8 + rand() * 1.0, 0.8 + rand() * 1.0, 1.1 + rand() * 1.4);
  }
  builder.panel3d([
    [0.36, 0.02, 8.38],
    [3.05, 0.02, 8.30],
    [2.70, 0.02, 7.60],
    [3.05, 0.02, 6.90],
    [0.36, 0.02, 6.78],
  ], [1, 1, 1], 1);
  builder.box([0.46, -0.02, 7.58], [0.12, 0.08, 1.62], timber, 1);
  return builder.finish();
}

function buildArmyMesh(): MeshData {
  const builder = new MeshBuilder();
  const timber: Rgb = [0.43, 0.30, 0.17];
  const linen: Rgb = [0.76, 0.64, 0.42];
  builder.shadow(1.95, 1.08, 0.16, [0.08, -0.24]);
  builder.box([0, 0, 2.38], [0.16, 0.16, 4.76], timber, 1);
  builder.box([0, 0, 4.84], [0.28, 0.28, 0.22], [0.72, 0.57, 0.28], 1);
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
  const slots: [number, number][] = [
    [-0.78, -0.58], [-0.26, -0.64], [0.28, -0.62], [0.82, -0.54],
    [-0.96, -0.10], [-0.44, -0.16], [0.10, -0.18], [0.62, -0.12],
    [-0.62, 0.36], [-0.08, 0.34], [0.46, 0.30],
  ];
  const orderedSlots = slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => b.slot[1] - a.slot[1]);
  for (const { slot: [x, y], index } of orderedSlots) {
    soldier(builder, x, y - 0.12, index % 2 === 0, linen);
  }
  return builder.finish();
}

function soldier(builder: MeshBuilder, x: number, y: number, shield: boolean, tunic: Rgb) {
  const skin: Rgb = [0.79, 0.60, 0.47];
  const bronze: Rgb = [0.72, 0.57, 0.28];
  const leather: Rgb = [0.34, 0.23, 0.14];
  const wood: Rgb = [0.47, 0.33, 0.19];
  builder.box([x - 0.12, y, 0.34], [0.13, 0.14, 0.68], leather, 1);
  builder.box([x + 0.12, y, 0.34], [0.13, 0.14, 0.68], leather, 1);
  builder.box([x, y + 0.01, 0.96], [0.40, 0.30, 0.66], tunic, 1);
  builder.box([x, y + 0.02, 1.36], [0.25, 0.22, 0.24], skin, 1);
  builder.box([x, y + 0.03, 1.57], [0.27, 0.24, 0.17], bronze, 1);
  builder.box([x + 0.30, y + 0.07, 1.02], [0.06, 0.07, 1.42], wood, 1);
  if (shield) builder.box([x - 0.31, y + 0.11, 0.88], [0.32, 0.10, 0.66], [1, 1, 1], 1);
}

class MeshBuilder {
  private vertices: number[] = [];
  private indices: number[] = [];

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
      const base = this.vertices.length / 10;
      for (const idx of face) this.vertices.push(...corners[idx], ...normal, ...color, alpha);
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  shadow(radiusX: number, radiusY = radiusX * 0.62, alpha = 0.14, offset: [number, number] = [0.10, -0.04]) {
    const color: Rgb = [0.06, 0.05, 0.035];
    const center: [number, number, number] = [offset[0], offset[1], 0.025];
    const normal: [number, number, number] = [0, 0, 1];
    const ring: [number, number, number][] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      ring.push([center[0] + Math.cos(a) * radiusX, center[1] + Math.sin(a) * radiusY, center[2]]);
    }
    for (let i = 0; i < ring.length; i++) {
      const base = this.vertices.length / 10;
      this.vertices.push(
        ...center, ...normal, ...color, alpha + 0.05,
        ...ring[i], ...normal, ...color, alpha,
        ...ring[(i + 1) % ring.length], ...normal, ...color, alpha,
      );
      this.indices.push(base, base + 1, base + 2);
    }
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
      const base = this.vertices.length / 10;
      this.vertices.push(
        a[0], y - halfDepth, a[1], ...normal, ...color, alpha,
        b[0], y - halfDepth, b[1], ...normal, ...color, alpha,
        b[0], y + halfDepth, b[1], ...normal, ...color, alpha,
        a[0], y + halfDepth, a[1], ...normal, ...color, alpha,
      );
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  panel3d(points: [number, number, number][], color: Rgb, alpha: number) {
    if (points.length < 3) return;
    const normal = faceNormal(points[0], points[1], points[2]);
    const base = this.vertices.length / 10;
    for (const point of points) this.vertices.push(...point, ...normal, ...color, alpha);
    for (let i = 1; i < points.length - 1; i++) this.indices.push(base, base + i, base + i + 1);
    const backBase = this.vertices.length / 10;
    const backNormal: [number, number, number] = [-normal[0], -normal[1], -normal[2]];
    for (const point of points) this.vertices.push(...point, ...backNormal, ...color, alpha);
    for (let i = 1; i < points.length - 1; i++) this.indices.push(backBase, backBase + i + 1, backBase + i);
  }

  private panelFace(points: [number, number][], y: number, normal: [number, number, number], color: Rgb, alpha: number, reverse: boolean) {
    const base = this.vertices.length / 10;
    for (const [x, z] of points) this.vertices.push(x, y, z, ...normal, ...color, alpha);
    for (let i = 1; i < points.length - 1; i++) {
      if (reverse) this.indices.push(base, base + i + 1, base + i);
      else this.indices.push(base, base + i, base + i + 1);
    }
  }

  finish(): MeshData {
    if (this.indices.length > 65535) throw new Error('campaign mesh exceeds uint16 index range');
    return {
      vertices: new Float32Array(this.vertices),
      indices: new Uint16Array(this.indices),
      indexCount: this.indices.length,
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
