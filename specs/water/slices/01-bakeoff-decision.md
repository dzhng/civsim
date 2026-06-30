# Slice 1 decision — Gerstner wins the water bake-off

**Status:** Decided 2026-07-01. Winner: **Gerstner (candidate A)**. IFFT (candidate B)
is retained only through Slice 8; it is deleted in Slice 11 unless a later slice
overrides via the seam.

## The verdict

At civsim's distant, tilted-orthographic camera, the analytic **Gerstner** field is the
equal-or-better look at a fraction of the surface area and zero infrastructure, and it is
the mandated capability/weak-GPU fallback regardless. The compute **IFFT** field's one real
advantage — true per-wavelength dispersion — manifests at this camera as a *unidirectional
"corduroy" streaking* that reads less like an open sea than Gerstner's isotropic chop, not
more. Its compute cost is below GPU-timer resolution on the available real GPU, so perf does
not separate the candidates either. This is exactly the spec's prior ("at this camera IFFT's
true dispersion is largely invisible while its compute cost and weak-GPU risk are real") —
the spike was an honest attempt to disprove it and did not.

Because every later slice is technique-pluggable through `WaterFieldSource`, the call is
reversible: a future slice can pass `tech: 'ifft'` and the look slices (foam/glint/colour)
work unchanged.

## Evidence

### Reference-compare montages (geometry + foam + glint only; ignore colour/mood)

- `slices/bakeoff-shots/candidate-A-gerstner.png` — Gerstner, neutral grey, battle horizon camera, t=2.0
- `slices/bakeoff-shots/candidate-B-ifft.png` — IFFT (128²), same camera/clock
- `slices/bakeoff-shots/compare-dusk.png` — scissored A|B side-by-side (the `?compare=1` route)
- Target: `assets/reference-ifft-ocean-dusk.png`

Both candidates render as a choppy sea receding to a horizon. Gerstner's crests are
scattered and multi-directional like the reference; IFFT collapses into parallel furrows
toward the horizon. Both share low-tessellation foreground faceting — a plane-tessellation
limitation shared by both fields, **not** a technique differentiator (owned by Slice 2/8's
displacement/LOD work).

### Unprimed second opinion (screenshot-critique)

An unprimed reviewer, shown the three frames with no prior conclusion and asked only "which
open ocean reads more like a real choppy sea," independently picked **A (Gerstner)**: "the
reference shows wave crests scattered in many orientations … A reproduces that
multi-directional peakiness, whereas B … collapses into long parallel furrows … its
anisotropic streaking is the dominant realism breaker." Both flagged the shared foreground
faceting.

### Perf table (Apple M-series, Metal, headful Chromium, `VERIFY_GPU_ADAPTER=hardware`)

| Tech | Camera | IFFT res | GPU time (median of 40) | Storage |
|---|---|---|---|---|
| Gerstner | battle | — | ~0.07–0.20 ms | 0 B |
| Gerstner | campaign | — | ~0.07 ms | 0 B |
| IFFT | battle | 128² | ~0.13 ms | 384 KiB (h0 256 KiB + spectrum 128 KiB) |
| IFFT | battle | 256² | ~0.13 ms | 1.5 MiB |
| IFFT | campaign | 256² | ~0.07 ms | 1.5 MiB |

**Read this honestly:** the GPU timestamp on this adapter quantises to ~0.066 ms, and every
configuration — including 256² IFFT — sits at or below a few quanta. The medians jitter
*across* techniques (Gerstner sometimes reads higher than IFFT), which means the per-technique
delta is **below measurement resolution**: on a fast GPU the IFFT compute is effectively free
and does **not** separate from Gerstner on perf. The hard budget gate (IFFT frame < 8 ms at
both cameras) passes by two orders of magnitude.

The **weak-GPU floor — the actual risk in the spec's prior — could not be measured on this
host**: SwiftShader has no working Vulkan adapter on macOS, and headless Chromium exposes no
GPU, so the only real adapter available is Apple Metal (fast). The weak/no-compute case is
therefore handled by *capability fallback* (proven below), not by a measured number. A future
run on a low-end target should re-measure (`VERIFY_GPU_ADAPTER=hardware` on that machine).

### Capability matrix

| Condition | `computeOceanSupported` | `tech: 'ifft'` resolves to | fallback |
|---|---|---|---|
| Capable device (Metal) | true | IFFT (128²) | — |
| `forceNoComputeOcean` / `?computeUnsupported=1` | false | Gerstner | triggered |
| `tech: 'gerstner'` | n/a | Gerstner | never |

`createWaterField` degrades an `ifft` request to Gerstner whenever compute-ocean support is
false, so weak/no-compute adapters always get *some* animated water. Asserted by the
`water-bakeoff` scene (`bakeoff: forced no-compute-ocean falls the IFFT request back to
Gerstner`).

## The frozen seam (do not relitigate)

```ts
// packages/game-renderer/src/water/waterField.ts
type WaterFieldId = 'gerstner' | 'ifft';
interface WaterFieldSource {
  readonly id: WaterFieldId;
  wgslSample(): string;                          // injects: struct WaterSample + fn waterField(p,t) + @group(1) decls
  bindGroupLayout(): GPUBindGroupLayout | null;  // null for analytic Gerstner; the ocean texture+sampler for IFFT
  ensureFrame(enc: GPUCommandEncoder, t: number): void; // no-op for Gerstner; the IFFT compute dispatch
  bindGroup(): GPUBindGroup | null;
  stats(): WaterFieldStats;
  destroy(): void;
}
createWaterField(shell, { tech, computeSupported, ifftResolution? })
  : { field: WaterFieldSource; fallbackTriggered: boolean };
```

Frozen WGSL sampling contract both candidates satisfy:

```wgsl
struct WaterSample { height: f32, normal: vec3f, foam: f32 };
fn waterField(p: vec2f, t: f32) -> WaterSample;   // p = world XY (m); t = seconds
```

- `height` is vertical displacement in metres (~0 mean); `normal` is the unit z-up surface
  normal; `foam` is 0..1 whitecap coverage. The look slices (foam/glint/colour/haze) and all
  three production surfaces consume **only** this struct, so they read identically off either
  field.
- **Bind-group index:** the field owns **`@group(1)`** (not the spec draft's `@group(2)` — a
  contiguous index avoids an empty group(1) layout on the analytic path). `bindGroupLayout()`
  returns null when the field needs none; `waterPlanePass` binds group(1) only when present.
- **Asymmetry (locked):** if Gerstner wins (it did), IFFT is deleted in S11. The look slices
  must still read acceptably off *either* field, because if a later slice flips the pick,
  Gerstner remains the fallback.

## The clock choice (known unknown #1 — resolved)

**Chosen: a `time` float in the camera uniform's first free pad + widen the camera bind-group
layout to `VERTEX | FRAGMENT`.** (`packages/renderer-core/src/cameraWgsl.ts` renames `pad0` →
`time`; `cameraUniform.ts` writes `camera.time`; `frameShell.setTime(seconds)` updates it;
the BGL visibility widens in `frameShell.ts`.) This is the cheapest option — no new bind group
on every pipeline — and it realises the render graph's already-declared logical `frameConstants`
resource (written by the `camera` pass) without a second GPU resource.

**Zero existing pixels move**, and this is load-bearing: no existing shader reads `pad0`; the
pad stays 0 until `setTime()` is called; and widening BGL visibility changes no output. Proven
by the existing battle/campaign snapshot scenes passing unchanged (no `UPDATE_SHOTS`).

The compute-dispatch hook (IFFT only) is `FrameGraphCommands.precompute?: (enc) => void`,
recorded into the frame's single command encoder before the background pass.

## Other resolved unknowns

- **Deterministic snapshotting (#3):** `shell.setTime(t)` with a fixed `t` freezes both fields
  (Gerstner reads `cam.time`; the IFFT texture is recomputed for the same `t` each frame). The
  `water-bakeoff` scene snaps `?t=2.0`. `snapCheck` stays green.
- **Depth/MSAA/perspective (#4):** the displaced plane goes through `projectWorld3d` +
  `civsimBattleWorldDepth3d` in the `world-depth` slot, `read-write` depth, and calls
  `gpuMultisample(shell.sampleCount)` (MSAA-safe though battle is MSAA=1 today). No z-fight or
  horizon seam observed at the bake-off camera. Foreground faceting is a tessellation/LOD item
  for Slice 2/8, not a depth problem.
- **Campaign single mesh vs overlay (#6):** deferred to Slice 10 (the campaign sea is a
  different, subtler surface). The bake-off's campaign-camera measurement only confirms the
  same field renders affordably there.

## Where the code lives

- Seam + factory: `packages/game-renderer/src/water/waterField.ts`
- Candidate A: `packages/game-renderer/src/water/gerstnerField.ts`
- Candidate B: `packages/game-renderer/src/water/ifftField/{spectrum,oceanComputeWgsl,ifftField}.ts`
- Candidate-agnostic pass: `packages/game-renderer/src/water/waterPlanePass.ts`
- Capability: `packages/renderer-core/src/capabilities.ts` (`computeOceanSupported`, `forceNoComputeOcean`)
- Clock: `packages/renderer-core/src/{cameraWgsl,cameraUniform,frameShell}.ts`
- Lab route: `apps/renderer-lab/src/router.ts` → `/renderer/water-bakeoff`
- Gate: `web/scenes/system/water-bakeoff.mjs` (VERIFY_GPU; baseline `web/shots/misc/water/bakeoff-compare-dusk.png`)
