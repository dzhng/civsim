# battle-ground-turf — ground reads as dry turf, not camo

Make the battle-map ground at RTS zoom read as a dry tangled turf meadow instead of
isotropic camouflage blobs. Technique target (not palette target): SeloSlav's
"Manor Lords for the web" video — see `assets/ref-*.png`. Our Bronze-Age Aegean
olive family stays authoritative.

Synthesized 2026-07-16 from three independent drafts (fewest-slices / seam-quality /
risk-first[codex]) after repo recon. Decisions locked with David: baked procedural
strand texture (no photographic asset), scope = battle playable ground + vista +
backdrop quad band (campaign untouched), keep hues / fix contrast.

## Next Agent Prompt

Status: spec drafted 2026-07-16, no implementation begun. Last updated: 2026-07-16.

You are implementing this spec. Start with **slice 00** (`slices/00-strand-spike.md`)
— it is a kill-or-commit spike; do not start slices 02+ production work until its
verdict is recorded here. Slice 01 is independent of 00 and may be done in the same
pass. Read the Ownership Map and Shared Verification Protocol below before any slice;
every slice inherits them. Before ending your pass: update this section (status, date,
verdict/warnings, next pickup point, checklist), and run the
[change-report](../../.claude/skills/change-report/SKILL.md) ledger if any test or
baseline moved.

Global TODO:
- [ ] 00 — strand-readability + anti-tiling spike (kill/commit) → `slices/00-strand-spike.md`
- [ ] 01 — meadow palette owner, zero-diff → `slices/01-meadow-palette.md`
- [ ] 02 — camo attribution + mottle contrast down → `slices/02-mottle-contrast.md`
- [ ] 03 — production turf integration → `slices/03-turf-integration.md`
- [ ] 04 — feathered earth edges → `slices/04-earth-edge-feather.md`
- [ ] 05 — closeout: sweep, perf ledger, close-spec → `slices/05-closeout.md`

Active warnings:
- Some save-load/visual scenes are red at HEAD (see memory/braided-roads note). Slice 01
  captures the carried-red ledger (`notes/red-at-start.md`) before any bless; never bless
  a scene that was red at start without attribution.

## Slice graph

```
00 strand spike (kill/commit, workbench only, no production change)
        │
01 meadow palette owner (zero-diff) ──► 02 mottle contrast ──► 03 turf integration ──► 04 earth edges ──► 05 closeout
        (00 ∥ 01/02; 03 needs 00's verdict + 02's quiet base)
```

Ordering rationale (all three drafts agreed independently): contrast-first —
strand detail judged over a camo base conflates two variables, and the spike
de-risks the scariest bet before any production wiring.

## Ownership map (single-owner invariants — end state)

| Concept | Single owner | Consumers |
|---|---|---|
| Meadow color family (cover bases, blade root/mid/tip, blade ring-fade meadow, quad olive/dry/stubble/fleck colors, farGrass tones, strand-bake palette, earth/mud albedo) | NEW `packages/game-renderer/src/battle/meadowPalette.ts` | groundPass, terrainLayer (ground+vista+quads), bladeFieldLayer, turfTexture |
| Baked turf strand texture (bake, seed, tiling, mips, anti-tiled sampling node) | NEW `packages/photoreal-renderer/src/battle/turfTexture.ts` | terrainLayer via groundDetail; baked once by battleWorld |
| Detail/contrast constants (drift/mottle/blade amplitudes, clamp, canopy spread, quad fleck strengths, turf strength, edge feather params) + the one detail-composition node + the one edge-coverage node | NEW `packages/photoreal-renderer/src/battle/groundDetail.ts` | terrainLayer (both materials) |
| Ground materials (composition of the above) | `terrainLayer.ts` (existing) | battleWorld |

Dependency direction stays photoreal-renderer → game-renderer, never reverse.
End state must read as designed-today: no consumer retains a private meadow color,
amplitude, or edge constant (slice 05 grep-audits this); no parallel abstraction
survives (the spike's workbench-only material param is transitional, removed in 03;
losing anti-tiling candidates are deleted in 03).

## Current state (recon facts, verified at HEAD 2026-07-16)

- Active path: `web/src/battle/scene.ts` → `packages/photoreal-renderer/src/battle/battleWorld.ts`
  → `terrainLayer.ts` (createGroundMesh ~357–630 playable+vista; terrainQuadMaterial ~215–286 +
  BattleBackgroundQuads backdrop; backdropMaterial ~288–306 horizon underpaint).
- Ground color today = per-vertex `GROUND_COVER_COLOR` (`game-renderer/src/battle/groundPass.ts:21`)
  × in-shader fbm detail (drift@0.08±0.10, mottle@1.1±0.13, blade@4.7±0.10 + @12.0±0.06,
  clamp [0.68,1.32]) — no image texture anywhere; the "fine" layer is isotropic value
  noise, which is why it reads as speckle.
- The meadow family exists in FIVE independent copies: GROUND_COVER_COLOR; the same
  covers re-inlined in buildVistaGroundMesh (terrainLayer.ts:649); BLADE_FIELD_PALETTE
  (bladeFieldLayer.ts:147); bladeFieldLayer's private ring meadow vec3 (:892); the quad
  styles' olive/dry/stubble families (terrainLayer.ts:96–136).
- The "camo" read has more than one candidate owner; the farGrass canopy overlay
  (terrainLayer.ts:450–486, contrast-expanding smoothstep with hue+value swings, active
  from ~5 m) is a prime suspect alongside the mottle term and the quad fleck stack.
  Slice 02 measures before it tunes.
- Battle earth surfaces: tint 5 = mud, tint 4 = forest floor, tint 6 = scree AND the
  cosmetic road — `crates/campaign/src/battlegen.rs:270` paints the road as a tint-6
  capsule (radius 9, rough 0.0, speed 1.0); real scree has high rough / low speed. The
  active render handoff passes only tint + height; rough/speed pointers exist in wasm.
- Edges today: `buildBattleGroundMesh` box-filters tints into vertex colors
  (step=2 ⇒ ~8 m vertices) — an un-noised grid-aligned airbrush; a measured 1–2 m
  feather cannot come from vertex interpolation alone. The interleaved vertex layout is
  shared with the legacy bespoke `GROUND_WGSL` pass — stride changes ripple there.
- Churn (terrainLayer.ts:495–508) keys off `color.r − color.g` of the PRE-MIXED vertex
  color — coupling hazard for slice 04.
- Verification: scenes in `web/scenes/battle/*.mjs` snap via shared snapCheck into
  `web/shots/battle/**` (~123 PNGs frame ground). Perf: `battle-perf-30k.mjs`,
  hardware adapter, locked 33 ms assertions.
- Bake precedent: impostorLayer bakes a canvas atlas → texture (no GPU-RT bake exists).

## Shared verification protocol (every visual slice inherits this)

1. snapCheck scenes, fixed viewport/camera/seed/frozen time; new scene
   `web/scenes/battle/battle-ground-turf.mjs`, shots under `web/shots/battle/ground-turf/`.
2. Judge each slice ONLY on its named crop/mask and its one visual variable.
3. [compare-screenshots](../../.claude/skills/compare-screenshots/SKILL.md) against the
   slice's named reference/before image — less-wrong verdict + telemetry, not similarity.
4. A fresh, unprimed [screenshot-critique](../../.claude/skills/screenshot-critique/SKILL.md)
   is the LAST acceptance check on every shot before blessing. Mandatory, every slice.
5. Human checkpoint is non-blocking: open shots with
   [preview-shots](../../.claude/skills/preview-shots/SKILL.md), wait ~5 min; on silence,
   decide on the evidence, record the decision here, close Preview, proceed.
6. Baseline policy: derive the moved-baseline list from a no-UPDATE_SHOTS sweep (never
   blanket-refresh); one bless commit per slice with the enumerated file list; ground-mask
   diffs prove non-ground regions stayed stable; campaign shots byte-identical every slice;
   carried-red ledger respected.
7. Perf gate: 33 ms assertions stay green AND paired same-hardware before/after
   (before-report captured in slice 00): ≤ +0.3 ms median GPU, ≤ +1.5 ms rAF p95;
   bake count 1 per terrain load, zero per-frame bakes/uploads/readbacks.

## Firewalls (must NOT touch)

- Campaign: code, palette, scenes, snapshots — byte-identical every slice.
- Sim crates: no Rust behavior change (slice 04 may READ rough/speed via existing wasm
  pointers; painting, movement, passability, tint semantics unchanged).
- Blade field geometry/LOD/density/width/zoom-cutoff (grass-width contract; static
  whole-map field — no camera-follow anything). Only palette VALUES' home moves (01).
- Palette hue: olive family locked (aesthetics skill owns hue); every slice varies
  value/warmth/structure only.
- Shadows (shadowRig), water/shore, churn thresholds, environment/fog/post, RENDER_ORDER.
- Legacy bespoke GROUND_WGSL behavior (04's vertex change carries a zero-diff gate for it).
- No photographic/external assets; no unseeded or time-driven randomness.

## Known unknowns & recorded alternatives

- Camo attribution: mottle vs farGrass canopy vs quad flecks — measured in 02, scope
  narrows to the guilty terms.
- Two-sample anti-tiling may ghost or wash strands: escalation to 3-tap hex tiling
  (Heitz & Deliot) lives INSIDE turfTexture's sampler seam; consumers never change.
- Quad-band strand sampling may be invisible under minification: dropping it (band keeps
  palette+contrast family only) is an allowed narrowing, recorded in 03.
- Edge mechanism ladder (04): primary = new box-filtered `gEarth` scalar vertex attribute
  + noise-thresholded smoothstep; escalation = CPU signed-distance-field texture if the
  vertex ramp can't honestly measure 1–2 m. Draft-recorded alternative (shader-only gTint
  window) rejected: categorical + quantized at step=2.
- Road-vs-scree classifier (tint 6 + rough/speed thresholds) must pin against battlegen
  fixtures; if it doesn't pin cleanly, 04 feathers mud only and roads become a follow-up.
- Whether WIDE_DETAIL_TERRAIN_STYLE still earns its existence once flecks are replaced —
  refactor-clean call at 03/05.
- Exact amplitudes/strengths are taste constants: the fixture scene exists so they are
  tuned against a fixed frame with David's crop verdicts.

## Research

- Stochastic texturing / anti-tiling: Heitz & Deliot 2019 —
  https://eheitzresearch.wordpress.com/738-2/ ;
  Unity implementation write-up: https://blog.unity.com/technology/procedural-stochastic-texturing-in-unity ;
  survey of practical variants: https://medium.com/@jasonbooth_86226/stochastic-texturing-3c2e58d76a14
- Reference video: https://x.com/SeloSlav/status/2077026419314454603 (crops in `assets/`;
  analysis in memory `ref-seloslav-terrain-video`).

## Review map

| Slice | David judges | Against |
|---|---|---|
| 00 | do baked strands read as tangle at the real cameras? | `assets/ref-topdown-turf.png`, `assets/ref-rts-meadow.png` |
| 01 | nothing (zero-diff) | byte-identical suite |
| 02 | are the camo islands gone without going flat? | `assets/ref-rts-meadow.png`, `assets/before-photoreal-parity.png` |
| 03 | combed dry turf, no tile lattice, one family near→far | `assets/ref-topdown-turf.png` |
| 04 | earth seams bitten-into, ~1–2 m, no halo/stair-step | `assets/ref-dirt-edge.png` |
| 05 | final contact sheet before/reference/after | all of the above |
