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

const ENTITY_WGSL = `
struct Camera { x:f32, y:f32, zoom:f32, cosP:f32, width:f32, height:f32, cosYaw:f32, sinYaw:f32 };
@group(0) @binding(0) var<uniform> cam: Camera;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) faction: vec3f,
  @location(2) allegiance: vec3f,
  @location(3) entityInfo: vec2f,
};

@vertex
fn vs(@location(0) quad: vec2f, @location(1) inst0: vec4f, @location(2) inst1: vec4f, @location(3) inst2: vec4f) -> VsOut {
  let radius = inst0.z;
  let dx = inst0.x - cam.x;
  let dy = inst0.y - cam.y;
  let rx = dx * cam.cosYaw + dy * cam.sinYaw;
  let ry = -dx * cam.sinYaw + dy * cam.cosYaw;
  let vertical = (quad.y + 1.0) * 0.5 * radius * cam.zoom * select(1.06, 1.62, inst0.w > 0.5);
  let screenX = rx * cam.zoom + quad.x * radius * cam.zoom;
  let screenY = ry * cam.zoom * cam.cosP + vertical - radius * cam.zoom * 0.16;
  var out: VsOut;
  out.pos = vec4f(screenX / (cam.width * 0.5), screenY / (cam.height * 0.5), 0.02, 1.0);
  out.local = quad;
  out.faction = inst1.rgb;
  out.allegiance = vec3f(inst1.a, inst2.r, inst2.g);
  out.entityInfo = vec2f(inst0.w, inst2.b);
  return out;
}

fn rect(p: vec2f, c: vec2f, h: vec2f) -> f32 {
  let q = abs(p - c) - h;
  let outside = length(max(q, vec2f(0.0)));
  return 1.0 - smoothstep(0.0, 0.035, outside);
}

fn ellipse(p: vec2f, c: vec2f, r: vec2f) -> f32 {
  let d = length((p - c) / r);
  return 1.0 - smoothstep(0.74, 1.0, d);
}

fn triRoof(p: vec2f, c: vec2f, size: vec2f) -> f32 {
  let q = (p - c) / size;
  let inside = step(abs(q.x), 1.0 - max(q.y, 0.0)) * step(-1.0, q.y) * step(q.y, 1.0);
  return inside;
}

fn cityShape(p: vec2f) -> vec4f {
  let shadow = ellipse(p, vec2f(0.10, -0.82), vec2f(0.88, 0.20)) * 0.38;
  let keep = max(max(rect(p, vec2f(-0.34, -0.48), vec2f(0.25, 0.28)), rect(p, vec2f(0.05, -0.42), vec2f(0.29, 0.34))), rect(p, vec2f(0.44, -0.50), vec2f(0.19, 0.24)));
  let towers = max(rect(p, vec2f(-0.43, -0.15), vec2f(0.12, 0.28)), rect(p, vec2f(0.28, -0.10), vec2f(0.13, 0.32)));
  let roofs = max(max(triRoof(p, vec2f(-0.34, 0.06), vec2f(0.34, 0.22)), triRoof(p, vec2f(0.07, 0.16), vec2f(0.38, 0.24))), triRoof(p, vec2f(0.44, 0.00), vec2f(0.24, 0.18)));
  let flagPole = rect(p, vec2f(-0.56, 0.20), vec2f(0.025, 0.56));
  let flag = rect(p, vec2f(-0.22, 0.48), vec2f(0.34, 0.17));
  let wall = max(keep, towers);
  let body = max(max(wall, roofs), max(flagPole, flag));
  return vec4f(shadow, wall + flagPole, roofs + flag, body);
}

fn armyShape(p: vec2f) -> vec4f {
  let shadow = ellipse(p, vec2f(0.10, -0.84), vec2f(0.78, 0.19)) * 0.42;
  let pole = rect(p, vec2f(-0.22, 0.12), vec2f(0.035, 0.86));
  let clothA = rect(p, vec2f(0.18, 0.58), vec2f(0.40, 0.18));
  let clothB = rect(p, vec2f(0.08, 0.34), vec2f(0.30, 0.16));
  let notch = triRoof(vec2f(p.x, -p.y), vec2f(0.43, -0.37), vec2f(0.18, 0.14));
  let base = max(rect(p, vec2f(-0.18, -0.70), vec2f(0.28, 0.10)), rect(p, vec2f(0.10, -0.82), vec2f(0.35, 0.07)));
  let soldiers = max(max(ellipse(p, vec2f(-0.34, -0.42), vec2f(0.12, 0.22)), ellipse(p, vec2f(0.02, -0.42), vec2f(0.12, 0.22))), ellipse(p, vec2f(0.36, -0.42), vec2f(0.12, 0.22)));
  let cloth = max(clothA, clothB) * (1.0 - notch * 0.82);
  let body = max(max(max(pole, cloth), base), soldiers);
  return vec4f(shadow, max(pole, soldiers), cloth, body);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let kind = in.entityInfo.x;
  let strength = clamp(in.entityInfo.y, 0.22, 1.0);
  let ink = vec3f(0.13, 0.09, 0.05);
  let shade = vec3f(0.19, 0.14, 0.08);
  let bronze = vec3f(0.84, 0.66, 0.33);
  let limestone = vec3f(0.72, 0.58, 0.38);
  let roof = mix(in.faction, vec3f(0.78, 0.38, 0.24), 0.34);
  let cityTint = mix(mix(limestone, in.faction, 0.28), bronze, 0.18);
  let armyTint = mix(in.faction, vec3f(0.76, 0.62, 0.38), 0.18) * (0.70 + strength * 0.34);
  if (kind < 0.5) {
    let s = cityShape(in.local);
    if (s.w <= 0.01 && s.x <= 0.01) { discard; }
    let wall = mix(shade, cityTint, 0.84);
    let color = select(vec3f(0.06, 0.045, 0.030), mix(wall, roof, s.z * 0.82), s.w > 0.01);
    let outline = smoothstep(0.20, 0.95, s.w) * (1.0 - smoothstep(0.72, 1.0, s.y + s.z));
    return vec4f(mix(color, ink, outline * 0.22), max(s.w, s.x * 0.58));
  }
  let s = armyShape(in.local);
  if (s.w <= 0.01 && s.x <= 0.01) { discard; }
  let stripe = smoothstep(0.06, 0.0, abs(in.local.y - 0.08)) * step(-0.32, in.local.x) * step(in.local.x, 0.58);
  let cloth = mix(armyTint, in.allegiance, stripe * 0.45);
  let pole = mix(vec3f(0.42, 0.29, 0.16), bronze, 0.42);
  let color = select(vec3f(0.06, 0.045, 0.030), mix(mix(pole, cloth, s.z), ink, 0.10), s.w > 0.01);
  return vec4f(color, max(s.w, s.x * 0.58));
}`;

export class CampaignEntityPass {
  private pipeline: GPURenderPipeline;
  private quadBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer;
  private capacity = 0;
  private count = 0;

  constructor(private shell: RawFrameShell) {
    const device = shell.device;
    const module = device.createShaderModule({ label: 'campaign-entity-wgsl', code: ENTITY_WGSL });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-entity-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
          {
            arrayStride: 48,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x4' },
              { shaderLocation: 2, offset: 16, format: 'float32x4' },
              { shaderLocation: 3, offset: 32, format: 'float32x4' },
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
      primitive: { topology: 'triangle-strip' },
    });
    this.quadBuffer = device.createBuffer({
      label: 'campaign-entity-quad',
      size: 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadBuffer, 0, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    this.instanceBuffer = device.createBuffer({
      label: 'campaign-entity-empty',
      size: 12 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  upload(instances: CampaignEntityInstance[]) {
    this.count = instances.length;
    if (instances.length > this.capacity) {
      this.capacity = Math.max(instances.length, this.capacity * 2, 64);
      this.instanceBuffer = this.shell.device.createBuffer({
        label: 'campaign-entity-instances',
        size: this.capacity * 12 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (instances.length === 0) return;
    const data = new Float32Array(instances.length * 12);
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const o = i * 12;
      data[o] = inst.x;
      data[o + 1] = inst.y;
      data[o + 2] = inst.radius;
      data[o + 3] = inst.kind === 'army' ? 1 : 0;
      data.set(inst.faction, o + 4);
      data[o + 7] = inst.allegiance[0];
      data[o + 8] = inst.allegiance[1];
      data[o + 9] = inst.allegiance[2];
      data[o + 10] = inst.strength ?? 1;
    }
    this.shell.device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }

  draw(pass: GPURenderPassEncoder) {
    if (this.count === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.draw(4, this.count);
  }

  stats() {
    return { entities: this.count };
  }
}
