# Slice 11 — Loser deletion + close-spec

## Contract unlocked
Exactly one technique survives in production; the dead candidate, the dormant prototype, and
all migrated inline constants are gone; the spec is archived as durable rationale.

## Work
- **If Gerstner won:** delete `water/ifftField/`, the compute additions to `frameShell.ts` /
  `capabilities.ts` (if unused elsewhere), and the IFFT lab route. Consuming passes untouched
  (the seam guarantees this).
- **If IFFT won:** **keep `water/gerstnerField.ts`** as the documented capability/weak-GPU
  fallback (firewall #1) — delete only the bake-off scaffolding route.
- **Always:** delete the dormant `CampaignWaterPass` / `WATER_WGSL` / `campaignWaterFeatures`
  (`atmospherePass.ts`) and its `apps/renderer-lab` reference if not already done in S10.
- Confirm **no inline water color constant remains** outside `waterPalette.ts` (grep the 4
  former sites).

## Verification gates
- Full snapshot suite green; perf unchanged; `fullGameRenderGraphReport().ok`.
- Run the `review` skill (and `/code-review`) — clean.
- Grep proves zero residual inline water colors / dead candidate imports.
- Run the `close-spec` skill: archive `specs/water/` → `specs/done/`, rewrite the plan from a
  build ladder into a durable rationale record pointing at the real code.

## What must stay green
Everything — this is cleanup; it changes no visible pixel.

## Human review checkpoint (NON-BLOCKING)
A final pass over all three surfaces in one sitting; ~5 min; record and proceed if silent.
