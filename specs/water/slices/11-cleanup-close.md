# Slice 11 — Delete the IFFT loser + close-spec

The look shipped (S2–S7) and integrated into all three surfaces (S8–S10). This slice removes the
dead technique the bake-off rejected and archives the plan into a durable rationale record. It
changes **no visible pixel**.

## Why the IFFT deletion is clean (do not relitigate)
Gerstner **won** the Slice 1 bake-off. Gerstner is purely analytic — `bindGroupLayout()` returns
null, no GPU compute, no storage buffers — so it runs on **every** adapter and is its own
weak-GPU/no-compute fallback. The IFFT field is only ever built when `tech === 'ifft'`, and after
integration nothing in `web/` ever requests it. **There is no device on which `ifft` is selected in
production** → `ifftField/` and its compute plumbing are dead code. (The spec's original asymmetry:
"Gerstner wins → delete IFFT entirely.")

## Work — owner: game-renderer/water + renderer-core
- Delete `water/ifftField/` (`ifftField.ts`, `oceanComputeWgsl.ts`, `spectrum.ts`).
- Collapse `createWaterField` (`water/waterField.ts`) to always construct `GerstnerWaterField`; drop
  the `ifft` branch, `ifftParams`, `computeSupported`/`ifftResolution`, and `CreateWaterFieldOptions.tech`.
  **Keep the `WaterFieldSource` interface + `createWaterField`** — the firewall the production
  surfaces are written against (cheap to retain, keeps consumers untouched). Its `id` union drops to
  `'gerstner'`.
- Remove `capabilities.computeOceanSupported` (+ `forceNoComputeOcean`) and the `frameShell`
  precompute-dispatch hook **iff `grep` proves no other consumer** (the `precompute` frame hook may
  be reusable — check before deleting).
- Delete the IFFT/bake-off lab route (`/renderer/water-bakeoff`) and `web/scenes/system/water-bakeoff.mjs`.
- Confirm `CampaignWaterPass` already deleted (Slice 10).
- **Grep-prove zero residual inline water colour** outside `waterPalette.ts` at all four former
  sites: `horizonPass.ts:22–23` (S9), `groundPass.ts:23` (S8), `terrainPass.ts` water kinds (S8),
  `mapPass.ts:222` (S10).

## Verification gates
- Full snapshot suite green; `fullGameRenderGraphReport().ok`; perf unchanged (no visible pixel moves).
- Run the [`review`](../../../.claude/skills/review) skill + `/code-review` on the diff — clean.
- `grep` proves no dead `ifft` imports / no inline water colours remain.
- **`screenshot-critique` is not needed** (no visual change) — but do one final `preview-shots`
  sitting across all three surfaces (~5 min, non-blocking) to confirm nothing regressed.

## Close-spec
Run the [`close-spec`](../../../.claude/skills/close-spec) skill: archive `specs/water/` →
`specs/done/` and rewrite this README from a build-ladder into a durable **rationale record** — the
`WaterFieldSource` seam, "mood lives in the light, not the albedo", and the shoreline
**material-coupling** insight that killed the seam (field water and open sea are one material via
`waterShoreRamp`) — pointing at the real shipped code, not the how.

## What must stay green
Everything — this slice changes no visible pixel; it only removes dead code and archives the spec.

## Feedback that would change this slice
"Keep IFFT for a future high-end preset" → then don't delete; leave the seam + factory branch and
record it as a deliberate retention (but the bake-off found no fidelity gain at this camera).
