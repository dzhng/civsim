import type { RawFrameShell } from '../../../webgpu-core/src/frameShell';
import { WORLD_CAMERA_WGSL } from '../../../webgpu-core/src/cameraWgsl';

export type CampaignSceneryKind = 'mountain' | 'tree' | 'conifer' | 'broadleaf' | 'rock';

export interface CampaignSceneryInstance {
  x: number;
  y: number;
  size: number;
  kind: CampaignSceneryKind;
  shade?: number;
}

interface MeshData {
  vertices: Float32Array;
  indices: Uint16Array;
  indexCount: number;
}

type Rgb = [number, number, number];

const SCENERY_WGSL = `
${WORLD_CAMERA_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
  @location(1) alpha: f32,
  @location(2) light: f32,
  @location(3) shade: f32,
};

@vertex
fn vs(
  @location(0) local: vec3f,
  @location(1) normal: vec3f,
  @location(2) colorAndAlpha: vec4f,
  @location(3) inst: vec4f,
) -> VsOut {
  let scale = inst.z;
  let world = vec3f(inst.x + local.x * scale, inst.y + local.y * scale, local.z * scale);
  var out: VsOut;
  out.pos = projectWorld3d(world, civsimCampaignWorldDepth3d(world));
  let sun = normalize(vec3f(-0.42, -0.34, 0.84));
  out.color = colorAndAlpha.rgb;
  out.alpha = colorAndAlpha.a;
  out.light = clamp(dot(normalize(normal), sun) * 0.34 + 0.78, 0.48, 1.14);
  out.shade = clamp(inst.w, 0.0, 1.0);
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let warmKey = vec3f(1.08, 1.00, 0.82);
  let coolFill = vec3f(0.72, 0.77, 0.82);
  let grade = mix(coolFill, warmKey, clamp((in.light - 0.48) / 0.66, 0.0, 1.0));
  let variation = 0.88 + in.shade * 0.18;
  let col = clamp(in.color * in.light * grade * variation, vec3f(0.0), vec3f(1.0));
  return vec4f(col, in.alpha);
}`;

export class CampaignSceneryPass {
  private pipeline: GPURenderPipeline;
  private mountainMesh = buildMountainMesh();
  private coniferMesh = buildConiferTreeMesh();
  private broadleafMesh = buildBroadleafTreeMesh();
  private rockMesh = buildRockMesh();
  private mountainVertexBuffer: GPUBuffer;
  private mountainIndexBuffer: GPUBuffer;
  private coniferVertexBuffer: GPUBuffer;
  private coniferIndexBuffer: GPUBuffer;
  private broadleafVertexBuffer: GPUBuffer;
  private broadleafIndexBuffer: GPUBuffer;
  private rockVertexBuffer: GPUBuffer;
  private rockIndexBuffer: GPUBuffer;
  private mountainInstanceBuffer: GPUBuffer;
  private coniferInstanceBuffer: GPUBuffer;
  private broadleafInstanceBuffer: GPUBuffer;
  private rockInstanceBuffer: GPUBuffer;
  private mountainCapacity = 0;
  private coniferCapacity = 0;
  private broadleafCapacity = 0;
  private rockCapacity = 0;
  private mountainCount = 0;
  private coniferCount = 0;
  private broadleafCount = 0;
  private rockCount = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-scenery-mesh-wgsl', code: SCENERY_WGSL });
    this.pipeline = this.makePipeline(module);
    this.mountainVertexBuffer = makeVertexBuffer(device, 'campaign-mountain-vertices', this.mountainMesh.vertices);
    this.mountainIndexBuffer = makeIndexBuffer(device, 'campaign-mountain-indices', this.mountainMesh.indices);
    this.coniferVertexBuffer = makeVertexBuffer(device, 'campaign-conifer-vertices', this.coniferMesh.vertices);
    this.coniferIndexBuffer = makeIndexBuffer(device, 'campaign-conifer-indices', this.coniferMesh.indices);
    this.broadleafVertexBuffer = makeVertexBuffer(device, 'campaign-broadleaf-vertices', this.broadleafMesh.vertices);
    this.broadleafIndexBuffer = makeIndexBuffer(device, 'campaign-broadleaf-indices', this.broadleafMesh.indices);
    this.rockVertexBuffer = makeVertexBuffer(device, 'campaign-rock-vertices', this.rockMesh.vertices);
    this.rockIndexBuffer = makeIndexBuffer(device, 'campaign-rock-indices', this.rockMesh.indices);
    this.mountainInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-mountain-empty-instances');
    this.coniferInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-conifer-empty-instances');
    this.broadleafInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-broadleaf-empty-instances');
    this.rockInstanceBuffer = makeEmptyInstanceBuffer(device, 'campaign-rock-empty-instances');
  }

  private makePipeline(module: GPUShaderModule) {
    const device = this.shell.device;
    return device.createRenderPipeline({
      label: 'campaign-scenery-mesh-depth-pipeline',
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
            arrayStride: 16,
            stepMode: 'instance',
            attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x4' }],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
          format: this.shell.info.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });
  }

  upload(instances: CampaignSceneryInstance[]) {
    const mountains = instances.filter((inst) => inst.kind === 'mountain');
    const conifers = instances.filter((inst) => inst.kind === 'tree' || inst.kind === 'conifer');
    const broadleafs = instances.filter((inst) => inst.kind === 'broadleaf');
    const rocks = instances.filter((inst) => inst.kind === 'rock');
    this.mountainCount = mountains.length;
    this.coniferCount = conifers.length;
    this.broadleafCount = broadleafs.length;
    this.rockCount = rocks.length;
    this.mountainInstanceBuffer = this.ensureInstanceBuffer(this.mountainInstanceBuffer, 'campaign-mountain-instances', mountains.length, 'mountain');
    this.coniferInstanceBuffer = this.ensureInstanceBuffer(this.coniferInstanceBuffer, 'campaign-conifer-instances', conifers.length, 'conifer');
    this.broadleafInstanceBuffer = this.ensureInstanceBuffer(this.broadleafInstanceBuffer, 'campaign-broadleaf-instances', broadleafs.length, 'broadleaf');
    this.rockInstanceBuffer = this.ensureInstanceBuffer(this.rockInstanceBuffer, 'campaign-rock-instances', rocks.length, 'rock');
    if (mountains.length > 0) this.shell.device.queue.writeBuffer(this.mountainInstanceBuffer, 0, packInstances(mountains, 3.8));
    if (conifers.length > 0) this.shell.device.queue.writeBuffer(this.coniferInstanceBuffer, 0, packInstances(conifers, 3.0));
    if (broadleafs.length > 0) this.shell.device.queue.writeBuffer(this.broadleafInstanceBuffer, 0, packInstances(broadleafs, 3.0));
    if (rocks.length > 0) this.shell.device.queue.writeBuffer(this.rockInstanceBuffer, 0, packInstances(rocks, 3.0));
  }

  draw(pass: GPURenderPassEncoder) {
    this.drawWithPipeline(pass, this.pipeline);
  }

  private drawWithPipeline(pass: GPURenderPassEncoder, pipeline: GPURenderPipeline) {
    if (this.mountainCount + this.coniferCount + this.broadleafCount + this.rockCount === 0) return;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    if (this.mountainCount > 0) {
      pass.setVertexBuffer(0, this.mountainVertexBuffer);
      pass.setVertexBuffer(1, this.mountainInstanceBuffer);
      pass.setIndexBuffer(this.mountainIndexBuffer, 'uint16');
      pass.drawIndexed(this.mountainMesh.indexCount, this.mountainCount);
    }
    if (this.coniferCount > 0) {
      pass.setVertexBuffer(0, this.coniferVertexBuffer);
      pass.setVertexBuffer(1, this.coniferInstanceBuffer);
      pass.setIndexBuffer(this.coniferIndexBuffer, 'uint16');
      pass.drawIndexed(this.coniferMesh.indexCount, this.coniferCount);
    }
    if (this.broadleafCount > 0) {
      pass.setVertexBuffer(0, this.broadleafVertexBuffer);
      pass.setVertexBuffer(1, this.broadleafInstanceBuffer);
      pass.setIndexBuffer(this.broadleafIndexBuffer, 'uint16');
      pass.drawIndexed(this.broadleafMesh.indexCount, this.broadleafCount);
    }
    if (this.rockCount > 0) {
      pass.setVertexBuffer(0, this.rockVertexBuffer);
      pass.setVertexBuffer(1, this.rockInstanceBuffer);
      pass.setIndexBuffer(this.rockIndexBuffer, 'uint16');
      pass.drawIndexed(this.rockMesh.indexCount, this.rockCount);
    }
  }

  stats() {
    return {
      scenery: this.mountainCount + this.coniferCount + this.broadleafCount + this.rockCount,
      mountains: this.mountainCount,
      trees: this.coniferCount + this.broadleafCount,
      conifers: this.coniferCount,
      broadleafs: this.broadleafCount,
      rocks: this.rockCount,
      mountainModelVertices: this.mountainMesh.vertices.length / 10,
      coniferModelVertices: this.coniferMesh.vertices.length / 10,
      broadleafModelVertices: this.broadleafMesh.vertices.length / 10,
      rockModelVertices: this.rockMesh.vertices.length / 10,
      layer: 'raw-webgpu-legacy-scenery-meshes',
    };
  }

  private ensureInstanceBuffer(buffer: GPUBuffer, label: string, count: number, bucket: CampaignSceneryKind) {
    const current = bucket === 'mountain'
      ? this.mountainCapacity
      : bucket === 'broadleaf'
        ? this.broadleafCapacity
        : bucket === 'tree' || bucket === 'conifer'
          ? this.coniferCapacity
          : this.rockCapacity;
    if (count <= current) return buffer;
    const next = Math.max(count, current * 2, 128);
    if (bucket === 'mountain') this.mountainCapacity = next;
    else if (bucket === 'broadleaf') this.broadleafCapacity = next;
    else if (bucket === 'tree' || bucket === 'conifer') this.coniferCapacity = next;
    else this.rockCapacity = next;
    return this.shell.device.createBuffer({
      label,
      size: next * 4 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
}

function packInstances(instances: CampaignSceneryInstance[], sizeDivisor: number) {
  const data = new Float32Array(instances.length * 4);
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const o = i * 4;
    data[o] = inst.x;
    data[o + 1] = inst.y;
    data[o + 2] = inst.size / sizeDivisor;
    data[o + 3] = inst.shade ?? hash2(inst.x, inst.y);
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
  return device.createBuffer({ label, size: 4 * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
}

function buildMountainMesh() {
  const builder = new MeshBuilder();
  builder.shadow(1.0, 0.62, 0.22);
  builder.peak([-0.18, -0.02, 0], 0.80, 1.0, 7, [0.42, 0.38, 0.31], [0.62, 0.58, 0.50], 11);
  builder.peak([0.55, 0.22, 0], 0.48, 0.62, 6, [0.40, 0.36, 0.30], [0.57, 0.53, 0.46], 23);
  builder.peak([-0.70, -0.28, 0], 0.42, 0.50, 6, [0.36, 0.33, 0.28], [0.52, 0.49, 0.43], 37);
  return builder.finish();
}

function buildRockMesh() {
  const builder = new MeshBuilder();
  builder.shadow(0.86, 0.44, 0.18);
  builder.peak([-0.32, -0.08, 0], 0.58, 0.44, 6, [0.39, 0.36, 0.30], [0.48, 0.44, 0.38], 5);
  builder.peak([0.24, 0.10, 0], 0.50, 0.34, 6, [0.34, 0.32, 0.27], [0.44, 0.41, 0.35], 17);
  builder.peak([0.64, -0.20, 0], 0.30, 0.24, 5, [0.30, 0.28, 0.24], [0.40, 0.38, 0.33], 29);
  return builder.finish();
}

function buildConiferTreeMesh() {
  const builder = new MeshBuilder();
  builder.shadow(0.62, 0.44, 0.18);
  builder.box([0, 0, 0.36], [0.16, 0.16, 0.72], [0.32, 0.21, 0.12], 1);
  builder.cone([0, 0, 0.78], 0.58, 0.58, 7, [0.10, 0.18, 0.09], [0.20, 0.29, 0.15], 41);
  builder.cone([0, 0, 1.18], 0.46, 0.54, 7, [0.09, 0.17, 0.09], [0.22, 0.31, 0.16], 53);
  builder.cone([0, 0, 1.54], 0.34, 0.46, 7, [0.08, 0.15, 0.08], [0.24, 0.33, 0.17], 67);
  builder.box([-0.18, -0.08, 1.07], [0.38, 0.34, 0.28], [0.14, 0.24, 0.12], 1);
  builder.box([0.18, 0.10, 1.26], [0.34, 0.30, 0.26], [0.16, 0.27, 0.13], 1);
  return builder.finish();
}

function buildBroadleafTreeMesh() {
  const builder = new MeshBuilder();
  builder.shadow(0.76, 0.46, 0.17);
  builder.box([0, 0, 0.34], [0.18, 0.18, 0.68], [0.34, 0.22, 0.12], 1);
  builder.blob([-0.22, -0.04, 1.06], [0.46, 0.38, 0.34], [0.15, 0.27, 0.13], 101);
  builder.blob([0.24, 0.02, 1.12], [0.50, 0.40, 0.38], [0.18, 0.31, 0.15], 113);
  builder.blob([0.02, 0.16, 1.36], [0.42, 0.34, 0.36], [0.21, 0.35, 0.17], 127);
  builder.blob([0.0, -0.16, 1.24], [0.38, 0.32, 0.30], [0.12, 0.23, 0.11], 139);
  return builder.finish();
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

  shadow(radiusX: number, radiusY: number, alpha: number) {
    const center: [number, number, number] = [0.10, -0.06, 0.015];
    const ring: [number, number, number][] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      ring.push([center[0] + Math.cos(a) * radiusX, center[1] + Math.sin(a) * radiusY, center[2]]);
    }
    for (let i = 0; i < ring.length; i++) {
      this.triangle(center, ring[i], ring[(i + 1) % ring.length], [0.055, 0.046, 0.032], [0.055, 0.046, 0.032], [0.055, 0.046, 0.032], alpha);
    }
  }

  finish(): MeshData {
    if (this.indices.length > 65535) throw new Error('campaign scenery mesh exceeds uint16 index range');
    return {
      vertices: new Float32Array(this.vertices),
      indices: new Uint16Array(this.indices),
      indexCount: this.indices.length,
    };
  }

  private triangle(a: [number, number, number], b: [number, number, number], c: [number, number, number], ca: Rgb, cb: Rgb, cc: Rgb, alpha: number) {
    const normal = faceNormal(a, b, c);
    const base = this.vertices.length / 10;
    this.vertices.push(...a, ...normal, ...ca, alpha, ...b, ...normal, ...cb, alpha, ...c, ...normal, ...cc, alpha);
    this.indices.push(base, base + 1, base + 2);
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
