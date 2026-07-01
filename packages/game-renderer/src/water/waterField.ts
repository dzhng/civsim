import type { RawFrameShell } from '../../../renderer-core/src/frameShell';
import { GerstnerWaterField } from './gerstnerField';

// The water-field firewall for civsim's water look. Every consumer — the open-sea
// plane pass and (through it) the production surfaces — is written against this seam,
// never against a technique: a pass only ever calls `wgslSample()` (to inline the
// field into its shader) and binds `bindGroup()` (the field's optional resources).
//
// The Slice 1 bake-off picked **Gerstner** (analytic sum-of-waves) as the single
// production field: it is closed-form, needs no GPU compute or per-frame upload, and
// therefore runs on every adapter — it is its own weak-GPU fallback. The IFFT loser
// was deleted in Slice 11. The seam and this factory are kept anyway (collapsed to the
// one producer): they are cheap, they keep consumers untouched, and they are the
// contract the look and production surfaces are written against.
//
// The frozen WGSL sampling contract the field satisfies:
//
//   struct WaterSample { height: f32, normal: vec3f, foam: f32 };
//   fn waterField(p: vec2f, t: f32) -> WaterSample;
//
// `p` is world XY (metres); `t` is seconds. `height` is vertical displacement
// (metres, ~0 mean); `normal` is the unit surface normal (z-up); `foam` is a 0..1
// whitecap coverage. The look WGSL (`waterMaterialWgsl`) consumes only this struct.

export type WaterFieldId = 'gerstner';

export interface WaterFieldStats {
  id: WaterFieldId;
  /** Side length of the field's working grid (1 for a purely analytic field). */
  fieldResolution: number;
  /** Bytes of GPU storage the field holds (0 for a purely analytic field). */
  storageBytes: number;
}

export interface WaterFieldSource {
  readonly id: WaterFieldId;
  /** WGSL injected into a consuming shader: the `WaterSample` struct + the
   *  `waterField(p, t)` function + any `@group(1)` resource declarations. */
  wgslSample(): string;
  /** The bind group layout for the field's resources (group 1), or null for an
   *  analytic field that needs none. */
  bindGroupLayout(): GPUBindGroupLayout | null;
  /** Record any pre-render compute for time `t` into `enc`. Analytic fields are a no-op. */
  ensureFrame(enc: GPUCommandEncoder, t: number): void;
  /** The bind group matching `bindGroupLayout()`, or null for an analytic field. */
  bindGroup(): GPUBindGroup | null;
  stats(): WaterFieldStats;
  destroy(): void;
}

// The one producer. `shell` is unused by the analytic field but kept in the signature
// so a future GPU-backed field could slot in behind the seam without touching callers.
export function createWaterField(_shell: RawFrameShell): WaterFieldSource {
  return new GerstnerWaterField();
}
