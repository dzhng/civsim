import type { RawFrameShell } from '../../../renderer-core/src/frameShell';
import { GerstnerWaterField } from './gerstnerField';
import { IfftWaterField } from './ifftField/ifftField';
import { DEFAULT_OCEAN_SPECTRUM, type OceanSpectrumParams } from './ifftField/spectrum';
import { OCEAN_COMPUTE_MAX_N } from './ifftField/oceanComputeWgsl';

// Clamp the IFFT resolution dial to a power of two within the compute limits.
function ifftParams(resolution?: number): OceanSpectrumParams {
  if (!resolution) return DEFAULT_OCEAN_SPECTRUM;
  const pow2 = 1 << Math.round(Math.log2(Math.max(64, Math.min(OCEAN_COMPUTE_MAX_N, resolution))));
  return { ...DEFAULT_OCEAN_SPECTRUM, n: pow2 };
}

// The A/B firewall for civsim's water look. Every consumer — the open-sea plane
// pass, the look slices (foam/glint/color/haze), and all three production
// surfaces — is written against this seam, never against a technique. A pass
// only ever calls `wgslSample()` (to inline the field into its shader) and binds
// `bindGroup()` (the field's optional resources); it never knows which producer
// is live. Deleting a candidate is deleting its one producer file + its branch
// in `createWaterField`.
//
// The frozen WGSL sampling contract both candidates satisfy:
//
//   struct WaterSample { height: f32, normal: vec3f, foam: f32 };
//   fn waterField(p: vec2f, t: f32) -> WaterSample;
//
// `p` is world XY (metres); `t` is seconds. `height` is vertical displacement
// (metres, ~0 mean); `normal` is the unit surface normal (z-up); `foam` is a
// 0..1 whitecap coverage. The look WGSL (`waterMaterialWgsl`) consumes only this
// struct, so foam/glint/color read identically off either field.

export type WaterFieldId = 'gerstner' | 'ifft';

export interface WaterFieldStats {
  id: WaterFieldId;
  /** Side length of the field's working grid (1 for a purely analytic field). */
  fieldResolution: number;
  /** Bytes of GPU storage the field holds (0 for a purely analytic field). */
  storageBytes: number;
  /** true when this field was selected as a degraded fallback for the request. */
  fallbackFor: WaterFieldId | null;
}

export interface WaterFieldSource {
  readonly id: WaterFieldId;
  /** WGSL injected into a consuming shader: the `WaterSample` struct + the
   *  `waterField(p, t)` function + any `@group(1)` resource declarations. */
  wgslSample(): string;
  /** The bind group layout for the field's resources (group 1), or null for an
   *  analytic field that needs none. */
  bindGroupLayout(): GPUBindGroupLayout | null;
  /** Record any pre-render compute (IFFT dispatch) for time `t` into `enc`.
   *  Analytic fields are a no-op. */
  ensureFrame(enc: GPUCommandEncoder, t: number): void;
  /** The bind group matching `bindGroupLayout()`, or null for an analytic field. */
  bindGroup(): GPUBindGroup | null;
  stats(): WaterFieldStats;
  destroy(): void;
}

export interface CreateWaterFieldOptions {
  tech: WaterFieldId;
  /** Whether the device can run the compute-IFFT field (`caps.computeOceanSupported`).
   *  When false, an `ifft` request degrades to Gerstner. */
  computeSupported: boolean;
  /** IFFT grid resolution dial (power of two, ≤ 256). The spike's perf knob. */
  ifftResolution?: number;
}

export interface CreateWaterFieldResult {
  field: WaterFieldSource;
  /** true when the requested tech was downgraded (ifft → gerstner) for capability. */
  fallbackTriggered: boolean;
}

// The capability firewall: an `ifft` request on a device without compute-ocean
// support degrades to Gerstner so weak/no-compute adapters always get *some*
// animated water. Gerstner itself never falls back.
export function createWaterField(shell: RawFrameShell, opts: CreateWaterFieldOptions): CreateWaterFieldResult {
  if (opts.tech === 'ifft' && opts.computeSupported) {
    return { field: new IfftWaterField(shell, ifftParams(opts.ifftResolution)), fallbackTriggered: false };
  }
  const fallbackTriggered = opts.tech === 'ifft';
  return { field: new GerstnerWaterField(fallbackTriggered ? 'ifft' : null), fallbackTriggered };
}
