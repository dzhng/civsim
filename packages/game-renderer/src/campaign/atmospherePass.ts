import { WORLD_CAMERA_WGSL } from '@packages/renderer-core/src/cameraWgsl';
import type { BackgroundRenderPass, OverlayRenderPass, RawFrameShell } from '@packages/renderer-core/src/frameShell';
import { NOISE_WGSL } from '@packages/renderer-core/src/noiseWgsl';

interface CampaignAtmosphereRect {
  min: [number, number];
  max: [number, number];
}

// The overlay atmosphere quads (cloud veil / fog-of-war) sit on the ground
// plane and project through the one real camera3d projector like every other
// campaign pass.
const CLOUD_WGSL = `
${WORLD_CAMERA_WGSL}
${NOISE_WGSL}

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) world: vec2f,
};

@vertex
fn vs(@location(0) world: vec2f, @location(1) uv: vec2f) -> VsOut {
  var out: VsOut;
  out.pos = projectWorld(vec3f(world, 0.0));
  out.uv = uv;
  out.world = world;
  return out;
}

fn cloudFbm(p: vec2f, w: vec3f) -> f32 {
  return vnoise(p) * w.x + vnoise(p * 2.17 + vec2f(7.1, 3.4)) * w.y + vnoise(p * 4.31 + vec2f(1.8, 9.2)) * w.z;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let edge = min(min(in.uv.x, 1.0 - in.uv.x), min(in.uv.y, 1.0 - in.uv.y));
  let rim = 1.0 - smoothstep(0.0, 0.26, edge);
  let topBias = smoothstep(0.24, 0.0, in.uv.y) * 0.72;
  let bottomBias = smoothstep(0.26, 0.0, 1.0 - in.uv.y) * 0.82;
  let cornerBias = smoothstep(0.44, 0.12, distance(in.uv, vec2f(0.05, 0.09))) * 0.7
    + smoothstep(0.42, 0.12, distance(in.uv, vec2f(0.88, 0.92))) * 0.45
    + smoothstep(0.42, 0.12, distance(in.uv, vec2f(0.18, 0.94))) * 0.52;
  let n = cloudFbm(in.world * 0.0018 + vec2f(2.7, 8.2), vec3f(0.54, 0.31, 0.15));
  let veil = smoothstep(0.42 - rim * 0.34, 0.86 - rim * 0.26, n);
  let body = clamp((rim * 0.82 + topBias + bottomBias + cornerBias) * veil, 0.0, 1.0);
  let color = mix(vec3f(0.80, 0.84, 0.83), vec3f(0.97, 0.98, 0.96), smoothstep(0.35, 0.82, n));
  return vec4f(color, body * 0.40 * __CLOUD_ALPHA_SCALE__);
}`;

export class CampaignCloudPass {
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;

  constructor(private shell: RawFrameShell, rect: CampaignAtmosphereRect, alphaScale = 1) {
    const device = shell.device;
    const code = CLOUD_WGSL.replace('__CLOUD_ALPHA_SCALE__', alphaScale.toFixed(3));
    const module = device.createShaderModule({ label: 'campaign-cloud-wgsl', code });
    this.pipeline = device.createRenderPipeline({
      label: 'campaign-cloud-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shell.cameraBindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 16,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
          ],
        }],
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
    const [x0, y0] = rect.min;
    const [x1, y1] = rect.max;
    const vertices = new Float32Array([
      x0, y0, 0, 1,
      x1, y0, 1, 1,
      x0, y1, 0, 0,
      x1, y1, 1, 0,
    ]);
    this.vertexBuffer = device.createBuffer({
      label: 'campaign-cloud-quad',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
  }

  draw(pass: OverlayRenderPass) {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shell.cameraBindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(4);
  }

  stats() {
    return { cloudQuads: 1 };
  }
}
