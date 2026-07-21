# Battle ground turf

> **Post-main review status (2026-07-21): visual gate rejected.** Deterministic
> snapshots and mechanical checks pass, but a new unprimed critique found
> oversized synthetic blades, visible distance bands, camouflage-like top-down
> masking, and painted earth transitions. See
> `reports/post-main-fresh-eyes-review.md`. The archived rationale below describes
> the implemented attempt; it is not a current claim that the aesthetic work is
> complete.

## Purpose

The attempted design makes battle ground a dry Bronze-Age Aegean meadow instead
of a camouflage texture. Real blade geometry is intended to supply the fine
near-field read; restrained world-space value structure carries turf through
tactical, overhead, vista, and distant-quad cameras. Mud and authored roads use
narrow measured edge feathers, while rock, forest, water, and scree keep
categorical ownership. The current visual rejection above means those mechanisms
have not yet achieved the intended read.

This record explains why those owners exist and what future changes must
preserve. The live mechanics belong to the code and tests linked below.

## Why the surface has this shape

The visual problem was contrast structure, not hue. The inherited olive family
already fit the project; several consumers independently amplified it into
large light/dark islands. Centralizing the family made hue provenance explicit,
and a fixed-hue canopy made distance read as one field rather than multiple
camouflage colors.

Fine turf is geometry because every synthetic substrate substitute failed at
the real cameras. Baked strands became looping straw nearby and fuzzy grain
overhead. Shader ridges became felt or weave. Hashed capsule strokes removed
grid seams but still resolved as commas, stipple, or nothing after filtering.
Keeping any of those paths would create a second fine-detail owner that competes
with the blades. Their evidence remains in-tree so the dead ends are not
rediscovered.

Earth edges needed a separate coverage signal. The legacy ground vertex buffer
is intentionally coarse and shared with a bespoke renderer; interpolating its
categorical tint exposed four- and eight-metre facets plus a dark halo. A compact
two-channel signed-distance field is therefore built only for the photoreal
playable ground: one channel owns the earth union, the other identifies authored
roads. This is the smallest mechanism that kept the legacy bytes stable while
producing measured one-to-two-metre transitions.

The distant terrain keeps a separate wide-detail style. It is not a duplicate
palette: its fleck thresholds, contrast, and aerial response compensate for
minification below zoom 1.2. Removing it would collapse a real camera-dependent
owner, not simplify equivalent policy.

## Invariants

- Open-meadow hue has one source: `MEADOW` and `GROUND_COVER_COLOR` in
  `packages/game-renderer/src/battle/meadowPalette.ts`.
- Photoreal turf contrast and earth-feather amplitudes have one source:
  `TURF_CONTRAST` and `TURF_SHAPE` in
  `packages/photoreal-renderer/src/battle/groundDetail.ts`.
- Real blades are the only near-camera fine turf geometry in the photoreal
  production route. Distance canopy and terrain-quad flecks remain broad or
  minification-specific value structure; the route exposes no baked texture,
  synthetic strand, ridge, or capsule mode.
- Ground, vista, and terrain quads share the meadow family and canopy
  composition. Ground and vista also share the same phase; every owner is
  world-space, so camera motion must not reset its pattern.
- The legacy `buildBattleGroundMesh` stride-10 bytes remain unchanged. The
  photoreal-only surface color and earth distance data travel beside that
  buffer.
- The earth SDF belongs to playable ground only, uploads once at terrain
  creation, and adds no draw call, per-frame upload, readback, or vista sample.
- Mud and road may feather. Scree, forest, rock, water, and other categorical
  materials may not be admitted by the road classifier.
- Road classification requires tint 6 together with authored low roughness and
  normal speed; missing or non-finite roughness/speed is never a road.
- Churn reads the unwarped mud interior and is suppressed over the classified
  road interior; it does not derive from the noisy visual feather.
- Campaign rendering, campaign snapshots, simulation behavior, grass density,
  blade dimensions, grass LOD, lighting, water, fog, shadows, and render order
  are outside this feature's ownership.

Private color literals for rock, scree, dust, and diagnostic bench surfaces are
valid categorical exceptions; they are not alternate meadow palettes.

## Divergences that matter

The original no-texture edge target was not met. The vertex-only primary
mechanism passed scalar checks but failed visual review, so the declared SDF
escalation became the shipped path. The corrected pre-feature/final Apple/Metal
pair passes every hard 33 ms gate. Its single-pair soft A/B result is marked
inconclusive because two measurements exceed the original thresholds while an earlier
same-adapter pair moved in the opposite direction, and the spec defined no repeat
or variance rule. The resource ledger also marks the original zero-texture target
as a miss: one RG8 terrain-load texture was added.

The production-mid grass oracle once gated full-resolution edge energy. That
metric combined real blades with the synthetic substrate detail this work
removed, so it could report “missing grass” over a pixel-identical scene. Edge
energy remains diagnostic; retention, contrast, occupancy, vertical runs, and
the published blade sampling profile now own that check.

Two lighting baselines still contained the rejected high-frequency substrate
after the main contrast change. The final all-battle sweep exposed them; only
the golden-hour and noon crowd frames were re-pinned, then passed a focused
no-update rerun.

There are two historical carried-red records with different scopes. The packaged
starting gate in `reports/carried-red-at-start.md` records five failures. The
canonical 75-scene starting sweep in `notes/red-at-start.md` records seven:
five snapshots, a SwiftShader-only campaign performance assertion, and an
intermittent menu probe. The final battle-only sweep reproduced only the carried
`battle-smoke/battle-initial` snapshot failure; it was not blessed or attributed
to turf.

## Code and test map

- Palette ownership:
  `packages/game-renderer/src/battle/meadowPalette.ts`
  (`MEADOW`, `meadowFamily`).
- Legacy and photoreal mesh handoff:
  `packages/game-renderer/src/battle/groundPass.ts`
  (`buildBattleGroundMesh`, `buildPhotorealBattleGroundMesh`).
- Road classification and distance construction:
  `packages/game-renderer/src/battle/photorealEarthDistance.ts`
  (`isBattleRoadSurface`, `buildPhotorealEarthDistance`).
- Contrast, canopy, coverage, and churn policy:
  `packages/photoreal-renderer/src/battle/groundDetail.ts`.
- Near-camera blade geometry and its meadow-palette handoff:
  `packages/photoreal-renderer/src/battle/bladeFieldLayer.ts`
  (`BLADE_FIELD_PALETTE`).
- Playable, vista, and quad composition:
  `packages/photoreal-renderer/src/battle/terrainLayer.ts`
  (`createGroundMesh`, `createVistaMesh`).
- World ownership, telemetry, and disposal:
  `packages/photoreal-renderer/src/battle/battleWorld.ts`
  (`PhotorealBattleWorld`).
- Deterministic production visual gate:
  `web/scenes/battle/battle-ground-turf.mjs` and
  `web/shots/battle/ground-turf/`.
- Blade-structure and distance-transition gate:
  `web/scenes/battle/battle-map-style.mjs`.
- Pure palette/telemetry tests:
  `web/tests/meadowPalette.test.ts` and
  `web/tests/turfTelemetry.test.ts`.
- Mesh, classifier, SDF, scalar width, and legacy-byte tests:
  `web/src/battle/groundSurface.test.ui.ts`.

Historical closeout evidence is indexed in `reports/slice05-full-sweep.md`,
`reports/perf-after.json`, `reports/slice05-change-ledger.md`, and
`reports/slice05-visual-gate.md`. The current status is owned by
`reports/post-main-fresh-eyes-review.md`, which supersedes the historical visual
acceptance, plus `reports/scenario-runs/turf-post-main-review.json` for the latest
mechanical no-update run. The authoritative production baselines are
under `web/shots/battle`; the similarly named
`assets/slice03-narrowed-gate` images are dated provenance, not claimed to be
byte-identical to the final frames.

## Visual provenance

- `assets/ref-rts-meadow.png` and `assets/ref-topdown-turf.png` are crops from
  the SeloSlav post linked below. They drove structure and scale only; the
  project's olive palette remained authoritative. The exact video frame and
  timestamp were not preserved with the supplied crops.
- `assets/ref-dirt-edge.png` drove the bitten-in, non-haloed transition between
  meadow and exposed earth. It was supplied with the original spec, but its
  source URL and capture frame were not preserved; treat it as visual intent,
  not independently sourced reference evidence.
- `assets/ref-overview-context.jpg` was supplied with the original spec as a
  broad meadow-and-road composition reference. Its source URL was not
  preserved, so it establishes contextual intent only and is not matched proof.
- `assets/before-battle-initial.png`, `assets/before-photoreal-parity.png`, and
  `assets/telemetry/corrected-before-rts.png` preserve the inherited
  camouflage-scale ground at the battle, parity, and cropped RTS views for
  before/final comparison.
- `assets/00-rts-reference-candidate.png` and
  `assets/00-topdown-reference-candidate.png` preserve the rejected baked
  strand comparison at the real cameras.
- `assets/attribution/` records which production owners changed the guilty
  contrast terms.
- `assets/slice03-corrected/` and `reports/strand-spike-critique.md` preserve
  negative evidence for the baked, ridge, and capsule families.
- `assets/slice03-narrowed-gate/` preserves the accepted blade-versus-substrate
  ownership checkpoint before earth-edge work.
- `visualizations/final-contact-sheet.html` is the archived
  before/reference/production comparison. Its first version failed fresh-eyes
  review and its replacement was accepted at the time, as recorded in
  `reports/slice05-fresh-eyes-review.md`; the post-main fresh-eyes rejection now
  supersedes that historical verdict.

The external reference is preserved by URL for provenance:
https://x.com/SeloSlav/status/2077026419314454603
