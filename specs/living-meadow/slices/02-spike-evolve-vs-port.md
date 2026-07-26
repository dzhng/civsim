# 02 — SPIKE: evolve vs fresh TSL port (+ verdict)

**Track:** grass · **Gate:** VISUAL (compare-screenshots vs hero + mandatory
screenshot-critique) + FPS · **This is locked decision D1.** The plan does **not**
pre-pick the winner.

## Contract
A committed, recorded decision on the grass-implementation substrate — with the
loser deleted (hard cutover, D5). Two candidates, both aimed at the pen's *soft
translucent, dense-to-horizon* look, judged apples-to-apples:
- **Fork A — evolve:** extend `PhotorealBladeFieldLayer` in place (add a
  backlight/SSS term to its material `Fn`, a first-pass far-density push, read wind
  from `windSignal`).
- **Fork B — fresh port:** new `packages/photoreal-renderer/src/battle/meadowGrassLayer.ts`
  → `MeadowGrassLayer` — a fresh TSL port of the pen's bezier blade + ramp + density
  law, with the **same** ctor shape / `applyPackedRecords` / `routeGpu` / `stats`
  surface and the **same** `battle-grass*` mesh name, so the owner swap in
  `battleWorld.ts` is one line.

Both consume the existing `grassField.ts` records (do **not** fork the record
schema — a port inventing a parallel schema is a red flag it's diverging) and the
same `windSignal`, camera, and environment preset.

## API seam
`?impl=evolve|fresh` on `/renderer/living-meadow` (from `00`); both mounted behind
the `MeadowGrassLayer` interface so the comparison is genuinely A/B.

## What a human can run / see
`/renderer/living-meadow?impl=evolve|fresh&crop=close|vista`, side-by-side with the
hero, FPS readout on each. **Two cameras** (per the `battle-map-reference`
meta-finding): the *close* gate ratifies blade anatomy + translucency; the *vista*
ratifies dense-to-horizon.

## Verification (the verdict)
- **Judged variable:** overall **silhouette + density gestalt** (not color, not the
  final translucency tune — those are `03`–`06`).
- `compare-screenshots` telemetry vs `assets/pen-reference-hero.jpeg` on both crops
  (which impl is *less wrong*), plus `gpuTimeMs`/FPS. **FPS is a loose ≥26 floor,
  not a gate** (D2).
- **Mandatory** unprimed [screenshot-critique](../../../.claude/skills/screenshot-critique/SKILL.md)
  on the winning fork, told it may judge only silhouette/density gestalt, **before**
  the decision is called.
- **Output:** pick the winner; record the rationale in this file; fold the winner
  into `battleWorld.ts`; **delete the loser** and any dead abstraction.

## Must stay green
The close-gate blade-anatomy oracle from `battle-map-reference` (the winner must not
regress it); cargo sim tests (renderer-only).

## Delegated to implementer
All blade math inside each fork; how far to push each within the timebox; **which
fork wins** (the plan does not pre-pick); whether the fresh port reuses the existing
compute-route/draw-indirect plumbing or its own.

## Reslice hooks (HIGH RISK — R8, a fresh TSL port can balloon)
- `02a` evolve-branch backlight proof (smallest change showing translucency).
- `02b` fresh-port single-blade → field proof, **timeboxed**, budgeting for the TSL
  hazards documented in `bladeFieldLayer.ts` (storage reads bind only in the
  position graph; `sin(seed*43758…)` → NaN/white on Metal, use fract hashes;
  GGX env-specular whitens grazing blade normals — shade with the field normal). If
  `02b` overruns its box → **evolve wins by default**, port recorded as rejected.
- `02c` the A/B compare + written verdict.
- If the critique later faults the winner specifically on silhouette or color, split
  a dedicated `06`/`04` pass rather than tuning blind inside another slice.

## Human checkpoint (non-blocking)
Open the A/B shots with [preview-shots](../../../.claude/skills/preview-shots/SKILL.md);
give David ~5 min. If silent, decide on the evidence, record it, close the shots,
proceed.

## VERDICT (2026-07-26): EVOLVE WINS

Evidence (captures in `../assets/02-spike-evidence/`, both candidates at both
crops, fixed t=4, same records/camera/environment):

- **Unprimed neutral judge** (fresh subagent, neutral A/B labels, told to judge
  only density gestalt + silhouette vs the hero): **A (evolve) marginally
  denser** — measured non-ground coverage near 4.2%/mid 24.6% (evolve) vs
  3.1%/21.7% (fresh); **silhouette a tie** (both render blocky flat-cut strips);
  **both far from the hero** — the reference is a continuous carpet with no
  visible ground at any distance, both candidates read as "scattered blades on
  a bald ground plane."
- **Cost:** fresh spent 3.39M (close) / 4.78M (vista) submitted triangles in
  1 draw with no LOD/compute route (documented timebox gap); evolve spent
  739k / 867k across 3 draw-indirect calls with the shipped compute-LOD
  machinery — and still out-covered fresh.
- **Metrics (evolve↔fresh, close):** edgeDiffRatio32 10.6%, edgeEnergyRatio
  0.72, lumDelta +1.1 — the forks genuinely diverged; the divergence did not
  favor the port.

**Rationale:** the gap to the hero is NOT substrate-limited. Look is a
tie-to-evolve at 1/5th the geometry; evolve owns the ratified LOD/perf
machinery. Slices 03–08 build on `PhotorealBladeFieldLayer` + the
`MeadowGrassLayer` interface. The fresh port is deleted (rejected primitive);
its one useful finding — brighter/warmer blade shading reads meadow-softer —
feeds slice 03/04.

**The spike's most important output** (from the unprimed judge): the biggest
gap vs the hero is **near-field bald ground between blades**. Slice 05
(density) owns closing it, and slice 04 should consider the pen's trick of a
meadow-colored ground underlayer beneath the blades — the pen's "carpet"
reading comes substantially from ground color matching the blades, not blade
count alone. Slice 06 owns the flat-cut → tapered tip fix the judge flagged on
both candidates.

Post-cleanup no-op proof: the fixture render after deleting the fresh fork is
byte-identical to the evolve candidate capture.
