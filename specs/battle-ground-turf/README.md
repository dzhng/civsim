# battle-ground-turf — ground reads as dry turf, not camo

Make the battle-map ground at RTS zoom read as a dry tangled turf meadow instead of
isotropic camouflage blobs. Technique target (not palette target): SeloSlav's
"Manor Lords for the web" video — see `assets/ref-*.png`. Our Bronze-Age Aegean
olive family stays authoritative.

Synthesized 2026-07-16 from three independent drafts (fewest-slices / seam-quality /
risk-first[codex]) after repo recon. Scope locked with David: battle playable ground +
vista + backdrop quad band (campaign untouched), no photographic asset, keep hues / fix
contrast. Slices 00 and 03 rejected every synthetic fiber technique; production now
uses real blade geometry near and the shared macro/canopy owner at distance.

## Next Agent Prompt

Status (updated 2026-07-16): slices 01–03 are complete. Slice 03 killed baked,
ridge, and cell-capsule substrate fibers, then narrowed successfully: production
has no synthetic fine-detail substrate. Real blade geometry owns close/RTS turf;
the slice 02 macro/canopy owner carries distance and top-down. The six full/control
production frames passed fresh critique, cold boots, phase return, and the 30k
hardware GPU gate. Pick up slice 04.
Slice 02 extracted the one battle-ground contrast owner into `groundDetail.ts`, measured
the far canopy as the camouflage culprit, and replaced its hue islands with shared,
fixed-hue value/warmth modulation across playable ground, vista, and both quad styles.
The corrected ground-only fixture records term-off attribution, pure telemetry, and the two
quad owners. Mid-band RMS moved -81.63%, mean hue +1.56 degrees, mean luminance +0.54/255,
and both hue/chroma spreads narrowed. The ground-crop visual gate accepted broad tonal
life without camo or a quad handoff seam. See `reports/slice02-visual-gate.md` and
`assets/telemetry/contrast.json`.

Performance remains under every locked 33 ms assertion. Slice 02's alternating pair
had a noisy soft-budget miss at the mid stop (+0.625 ms aggregate versus +0.3 ms), while
vista improved by 0.62 ms. Slice 03's production `battle-perf-30k` gate subsequently
passed at 27.12 ms median GPU mid and 22.84 ms vista; the noisy slice 02 observation
remains in the ledger rather than being silently reclassified.

The baked-texture experiment is preserved only as negative evidence: top-down became
fuzzy grain and RTS became near-field looping straw plus far-field blur. Do not promote
its renderer-lab sampler or recreate a production texture owner.

The in-shader attempts are also negative evidence. Periodic ridges and
cross-sections became felt/loops/weave; current-cell capsules became lattice stipple
and could not guarantee boundary continuity. Stable hashed capsules from the nearest
2×2 cells removed the boundary/lattice defect, but still became visible comma marks,
felt stipple, or disappeared under filtering. All three families are killed;
production intentionally has no synthetic substrate fine-detail replacement.

Global TODO:
- [x] 00 — strand-readability + anti-tiling spike — **KILL** → `slices/00-strand-spike.md`
- [x] 01 — meadow palette owner, zero-diff → `slices/01-meadow-palette.md`
- [x] 02 — camo attribution + mottle contrast down → `slices/02-mottle-contrast.md`
- [x] 03 — synthetic fine-detail KILL + narrowed production ownership → `slices/03-turf-integration.md`
- [ ] 04 — feathered earth edges → `slices/04-earth-edge-feather.md`
- [ ] 05 — closeout: sweep, perf ledger, close-spec → `slices/05-closeout.md`

Active warnings:
- Slice 00 killed baked strands; slice 03 also killed every synthetic in-shader
  replacement. Preserve the rejected evidence, but do not recreate a fine-detail API.
- Slice 03 blessed only six production frames: full and ground-only close/RTS/top-down.
- Five visual checks were already red at the starting commit. Slice 00 captured them in
  `reports/carried-red-at-start.md`; never bless one without attribution.
- Slice 04 recon invalidated its original stride-change premise: preserve the bespoke
  stride-10 buffer and carry separate photoreal mud/road coverage attributes instead.

## Slice graph

```
00 strand spike — KILL evidence (complete; no production dependency)

01 meadow palette owner (zero-diff) ──► 02 mottle contrast ──► 03 fine-detail KILL / ownership proof ──► 04 earth edges ──► 05 closeout
```

Ordering rationale (all three drafts agreed independently): contrast-first —
strand detail judged over a camo base conflates two variables, and the spike
de-risks the scariest bet before any production wiring.

## Ownership map (single-owner invariants — end state)

| Concept | Single owner | Consumers |
|---|---|---|
| Meadow color family (cover bases, blade root/mid/tip, blade ring-fade meadow, quad olive/dry/stubble/fleck colors, farGrass tones, earth/mud albedo) | NEW `packages/game-renderer/src/battle/meadowPalette.ts` | groundPass, terrainLayer (ground+vista+quads), bladeFieldLayer |
| Detail/contrast constants (drift/mottle, clamp, canopy spread, quad fleck strengths, edge feather params) + the one detail-composition node + the one edge-coverage node | NEW `packages/photoreal-renderer/src/battle/groundDetail.ts` | terrainLayer (both materials) |
| Ground materials (composition of the above) | `terrainLayer.ts` (existing) | battleWorld |

Dependency direction stays photoreal-renderer → game-renderer, never reverse.
End state must read as designed-today: no consumer retains a private meadow color,
contrast amplitude, or edge constant (slice 05 grep-audits this); no parallel
abstraction survives. Slice 03 deletes the rejected helpers and leaves a macro-only
lab panel while preserving the KILL evidence under this spec.

## Current state (recon facts, verified at HEAD 2026-07-16)

- Active path: `web/src/battle/scene.ts` → `packages/photoreal-renderer/src/battle/battleWorld.ts`
  → `terrainLayer.ts` (createGroundMesh ~357–630 playable+vista; terrainQuadMaterial ~215–286 +
  BattleBackgroundQuads backdrop; backdropMaterial ~288–306 horizon underpaint).
- Ground color = per-vertex cover color × the shared macro drift/mottle owner,
  followed by the distance canopy where applicable. Real blade geometry is the
  only fine turf owner; there is no substrate fiber or image texture.
- Slice 01 centralized the former five meadow-family copies in
  `meadowPalette.ts`; ground, vista, blade, ring-fade, and quad consumers now derive
  their colors from that owner.
- Slice 02 attributed the "camo" read to the old farGrass canopy's multi-hue contrast
  expansion. The mottle term was negligible in the production crop. The replacement is
  uniform in world space—no camera-radius onset or finite outer fade—and uses shared
  material exclusions so turf detail does not spill onto earth, forest, rock, scree,
  roads, or water.
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
- Slice 00's deterministic canvas bake and continuous sampler were mechanically viable
  but visually rejected; see its result and critique reports. They are not a production
  precedent for this feature.

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
   zero new texture resources, uploads/readbacks, or draw calls.

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
- Synthetic fiber detail was resolved as a KILL in 03: ridges became felt/weave and
  cell capsules became commas/stipple or disappeared. Real blades plus macro/canopy
  passed the production-camera gate without a synthetic fine layer.
- Edge mechanism ladder (04): primary = separate box-filtered photoreal mud/road coverage
  attributes + noise-thresholded smoothstep while the legacy stride-10 buffer stays
  byte-identical; escalation = CPU signed-distance-field texture if the vertex ramp can't
  honestly measure 1–2 m. A categorical interpolated gTint window remains rejected.
- Road-vs-scree classifier (tint 6 + rough/speed thresholds) must pin against battlegen
  fixtures; if it doesn't pin cleanly, 04 feathers mud only and roads become a follow-up.
- Whether WIDE_DETAIL_TERRAIN_STYLE still earns its existence once flecks are replaced —
  refactor-clean call at 03/05.
- Exact amplitudes/strengths are taste constants: the fixture scene exists so they are
  tuned against a fixed frame with David's crop verdicts.

## Research

- Stochastic texturing / anti-tiling was explored in slice 00 and rejected for this
  feature; its reports preserve the rationale rather than leaving a latent fallback.
- Reference video: https://x.com/SeloSlav/status/2077026419314454603 (crops in `assets/`;
  analysis in memory `ref-seloslav-terrain-video`).

## Review map

| Slice | David judges | Against |
|---|---|---|
| 00 | why were baked strands killed at the real cameras? | `assets/ref-topdown-turf.png`, `assets/ref-rts-meadow.png`, `reports/strand-spike-critique.md` |
| 01 | nothing (zero-diff) | byte-identical suite |
| 02 | are the camo islands gone without going flat? | `assets/ref-rts-meadow.png`, `assets/before-photoreal-parity.png` |
| 03 | real blades own near turf; macro/canopy owns distance without camo | `assets/slice03-narrowed-gate/`, `reports/slice03-visual-gate.md` |
| 04 | earth seams bitten-into, ~1–2 m, no halo/stair-step | `assets/ref-dirt-edge.png` |
| 05 | final contact sheet before/reference/after | all of the above |
