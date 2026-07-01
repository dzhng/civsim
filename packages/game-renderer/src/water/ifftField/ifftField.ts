import type { RawFrameShell } from '../../../../renderer-core/src/frameShell';
import { compileShader } from '../../../../renderer-core/src/compileShader';
import { assertStorageBufferFits } from '../../../../renderer-core/src/capabilities';
import type { WaterFieldId, WaterFieldSource, WaterFieldStats } from '../waterField';
import { bakeOceanSpectrum, DEFAULT_OCEAN_SPECTRUM, type OceanSpectrumParams } from './spectrum';
import { oceanComputeWgsl } from './oceanComputeWgsl';

// Candidate B — a compute-driven IFFT ocean. The baked Phillips spectrum lives
// in a storage buffer; every frame three compute dispatches evolve it by the
// dispersion relation and inverse-FFT it into an rgba16float height texture,
// which the consuming shader samples through `@group(1)`. This is the net-new
// WebGPU compute infrastructure the spike exists to evaluate; it lives entirely
// behind the `WaterFieldSource` seam so it deletes cleanly if it loses.

const HEIGHT_TEX_FORMAT: GPUTextureFormat = 'rgba16float';

export class IfftWaterField implements WaterFieldSource {
  readonly id: WaterFieldId = 'ifft';
  private readonly device: GPUDevice;
  private readonly p: OceanSpectrumParams;

  private readonly paramsBuffer: GPUBuffer;
  private readonly h0Buffer: GPUBuffer;
  private readonly spectrumBuffer: GPUBuffer;
  private readonly oceanTexture: GPUTexture;
  private readonly sampler: GPUSampler;

  private readonly computeLayout: GPUBindGroupLayout;
  private readonly computeGroup: GPUBindGroup;
  private readonly updatePipeline: GPUComputePipeline;
  private readonly fftRowPipeline: GPUComputePipeline;
  private readonly fftColPipeline: GPUComputePipeline;

  private readonly renderLayout: GPUBindGroupLayout;
  private readonly renderGroup: GPUBindGroup;
  private readonly storageBytes: number;

  constructor(shell: RawFrameShell, params: OceanSpectrumParams = DEFAULT_OCEAN_SPECTRUM) {
    const device = shell.device;
    this.device = device;
    this.p = params;
    const n = params.n;
    const logN = Math.round(Math.log2(n));

    const h0 = bakeOceanSpectrum(params);
    assertStorageBufferFits(h0.byteLength, shell.info.caps, 'ocean-ifft-spectrum');
    this.storageBytes = h0.byteLength + n * n * 2 * 4;

    this.h0Buffer = device.createBuffer({ label: 'ocean-h0', size: h0.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.h0Buffer, 0, h0);
    this.spectrumBuffer = device.createBuffer({ label: 'ocean-spectrum', size: n * n * 2 * 4, usage: GPUBufferUsage.STORAGE });
    this.paramsBuffer = device.createBuffer({ label: 'ocean-params', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // n, logN packed as u32; time, patch as f32 — one 16-byte uniform.
    device.queue.writeBuffer(this.paramsBuffer, 0, new Uint32Array([n, logN, 0, 0]));
    device.queue.writeBuffer(this.paramsBuffer, 8, new Float32Array([0, params.patch]));

    this.oceanTexture = device.createTexture({
      label: 'ocean-height',
      size: { width: n, height: n },
      format: HEIGHT_TEX_FORMAT,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.sampler = device.createSampler({ label: 'ocean-sampler', magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });

    this.computeLayout = device.createBindGroupLayout({
      label: 'ocean-compute-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: HEIGHT_TEX_FORMAT, viewDimension: '2d' } },
      ],
    });
    this.computeGroup = device.createBindGroup({
      label: 'ocean-compute-bg',
      layout: this.computeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: { buffer: this.h0Buffer } },
        { binding: 2, resource: { buffer: this.spectrumBuffer } },
        { binding: 3, resource: this.oceanTexture.createView() },
      ],
    });

    const module = compileShader(device, oceanComputeWgsl(), 'ocean-ifft-compute');
    const computeLayoutDesc = device.createPipelineLayout({ bindGroupLayouts: [this.computeLayout] });
    this.updatePipeline = device.createComputePipeline({ label: 'ocean-update', layout: computeLayoutDesc, compute: { module, entryPoint: 'update' } });
    this.fftRowPipeline = device.createComputePipeline({ label: 'ocean-fft-row', layout: computeLayoutDesc, compute: { module, entryPoint: 'fftRow', constants: { WG: n } } });
    this.fftColPipeline = device.createComputePipeline({ label: 'ocean-fft-col', layout: computeLayoutDesc, compute: { module, entryPoint: 'fftCol', constants: { WG: n } } });

    this.renderLayout = device.createBindGroupLayout({
      label: 'ocean-render-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    this.renderGroup = device.createBindGroup({
      label: 'ocean-render-bg',
      layout: this.renderLayout,
      entries: [
        { binding: 0, resource: this.oceanTexture.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });
  }

  wgslSample(): string {
    // Height comes from the precomputed texture; the normal is a finite-diff of
    // the same texture and foam is a curvature (negative Laplacian) proxy, so a
    // single height channel drives the whole WaterSample. `t` is unused — the
    // motion already lives in the texture for this frame's time.
    return `
struct WaterSample { height: f32, normal: vec3f, foam: f32 };

@group(1) @binding(0) var oceanTex: texture_2d<f32>;
@group(1) @binding(1) var oceanSampler: sampler;

const OCEAN_PATCH: f32 = ${this.p.patch.toFixed(1)};
const OCEAN_HEIGHT_SCALE: f32 = 260.0;
const OCEAN_FOAM_SCALE: f32 = 24.0;
const OCEAN_FOAM_BIAS: f32 = 0.10;

fn oceanH(uv: vec2f) -> f32 {
  return textureSampleLevel(oceanTex, oceanSampler, uv, 0.0).r;
}

fn waterField(p: vec2f, t: f32) -> WaterSample {
  let uv = p / OCEAN_PATCH;
  let e = 1.0 / ${this.p.n.toFixed(1)};
  let hC = oceanH(uv);
  let hL = oceanH(uv - vec2f(e, 0.0));
  let hR = oceanH(uv + vec2f(e, 0.0));
  let hD = oceanH(uv - vec2f(0.0, e));
  let hU = oceanH(uv + vec2f(0.0, e));
  let worldStep = 2.0 * e * OCEAN_PATCH;
  let dx = (hR - hL) * OCEAN_HEIGHT_SCALE / worldStep;
  let dy = (hU - hD) * OCEAN_HEIGHT_SCALE / worldStep;
  let lap = (hL + hR + hD + hU - 4.0 * hC) * OCEAN_HEIGHT_SCALE;
  var out: WaterSample;
  out.height = hC * OCEAN_HEIGHT_SCALE;
  out.normal = normalize(vec3f(-dx, -dy, 1.0));
  out.foam = clamp(-lap * OCEAN_FOAM_SCALE - OCEAN_FOAM_BIAS, 0.0, 1.0);
  return out;
}`;
  }

  bindGroupLayout(): GPUBindGroupLayout | null {
    return this.renderLayout;
  }

  bindGroup(): GPUBindGroup | null {
    return this.renderGroup;
  }

  ensureFrame(enc: GPUCommandEncoder, t: number): void {
    // Update only the time field of the params uniform; the encoder is submitted
    // after this returns, so the queue write is ordered before the dispatch.
    this.device.queue.writeBuffer(this.paramsBuffer, 8, new Float32Array([t]));
    const n = this.p.n;
    const pass = enc.beginComputePass({ label: 'ocean-ifft' });
    pass.setBindGroup(0, this.computeGroup);
    pass.setPipeline(this.updatePipeline);
    pass.dispatchWorkgroups(Math.ceil(n / 16), Math.ceil(n / 16));
    pass.setPipeline(this.fftRowPipeline);
    pass.dispatchWorkgroups(n);
    pass.setPipeline(this.fftColPipeline);
    pass.dispatchWorkgroups(n);
    pass.end();
  }

  stats(): WaterFieldStats {
    return { id: this.id, fieldResolution: this.p.n, storageBytes: this.storageBytes, fallbackFor: null };
  }

  destroy(): void {
    this.h0Buffer.destroy();
    this.spectrumBuffer.destroy();
    this.paramsBuffer.destroy();
    this.oceanTexture.destroy();
  }
}
