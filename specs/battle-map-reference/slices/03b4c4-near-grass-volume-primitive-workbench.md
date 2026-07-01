# Slice 03B4C4 - near grass volume primitive workbench

## Contract

Find a primitive family that can visibly read as dense near-field grass at the
reference camera before any more emitter-count, meadow-colour, fog, terrain, or
camera tuning.

03B4C3 proved the field-owned shell path and its verification harness, but
rejected the one-strip per-record primitive. Normal shell, debug-visible shell,
bounded width, vertical lift, and view-facing thickness all remained visually
wrong: either invisible, flat/streaked, or stipple/scratch-like. This slice keeps
the useful data plumbing and changes only the grass primitive family.

Freeze these inputs:

- 03B3A softened field meadow material;
- 03B4B2 root-mass material and telemetry;
- 03B4C2/03B4C3 field record ownership, reference camera, crop windows, and
  target crops;
- terrain, cliffs, water, sky, fog, lighting preset, meadow colour, and route
  framing.

## Approach

Build a small route/workbench that compares named primitive families from the
same camera and crop. Do not overload the old `fiberShellVariant` as the main
decision surface; add explicit telemetry such as `grassPrimitiveFamily` and, when
useful, keep `fiberShellVariant` only for legacy shell comparisons.

The workbench should capture:

- the best current baseline (`field-fiber-shell` normal or visibility);
- an **alpha/texture impostor patch** candidate;
- a **shell billboard cluster** candidate;
- a **near-field grass volume card** candidate;
- optional root-coupled variants only after one candidate visibly reads as grass
  but appears detached from the ground.

Each candidate must use the same field records and the same foreground/midground
crop windows. If a candidate needs aggregation, use the 03B4B clump reducer or a
new deterministic field-cell reducer and publish its counts. Do not hide the
primitive result by changing the meadow material or reference crop.

If implementation starts pulling in colour grading, cliff shape, fog, water, or
camera fixes to make a candidate look better, stop and use `feature-slicing` to
split the work again before editing more renderer code.

## Candidate Approaches

1. **Alpha/texture impostor patch**
   - Draw small ground-seated or slightly upright clump patches with a generated
     neutral grass alpha texture: many soft blade strokes in one card/patch
     instead of one geometric strip per record.
   - Use field normals for seating, height-based dark bases, and mip-friendly
     alpha so the midground becomes soft vegetation texture instead of speckles.
   - Reject if it reads as decal stains, tiled texture, flowers, or black hatching.

2. **Shell billboard cluster**
   - Aggregate nearby field records into clumps and draw a few crossed/tapered
     cards per clump, with blade-stroke alpha and local yaw jitter.
   - Goal: visible vertical silhouettes and clumped occlusion with fewer draw
     primitives than dense individual blades.
   - Reject if cards form obvious X shapes, rows, broad dash marks, or scale
     mismatches against the target foreground.

3. **Near-field grass volume card**
   - Draw camera-aware volume slices over the lower foreground band: shallow
     cards or strips with height-faded alpha/noise and depth fade, seated to the
     field height but biased upward enough to make a fuzzy grass body.
   - Goal: continuous lower-third grass mass with local edge structure, not
     isolated marks.
   - Reject if it becomes a billboard wall, a repeated comb texture, or if it
     masks unit readability at playable zoom.

4. **Root-coupled variant**
   - Only after one of the above reads as grass, borrow the 03B4B2 root-mass field
     as a local base-shadow/occlusion term.
   - Do not globally retune root-mass strength for this slice.

## Required Telemetry

Every candidate route must publish:

- `grassPrimitiveFamily`;
- source field record count;
- selected/accent record count;
- clump or cell count if aggregated;
- submitted triangles and draw calls;
- near/mid/far depth band or crop ownership;
- texture size/bytes if an impostor texture is generated;
- active comparison baseline.

Keep the older shell telemetry visible for the baseline so future agents can
compare against the rejected 03B4C3 branch without reading code.

## Approach Ledger - 2026-07-01

This workbench landed as infrastructure and evidence, not as visual acceptance.
The route now accepts named `grassPrimitiveFamily` variants, the reference scene
captures the shell baseline plus three candidate families from the same camera,
and the evidence is archived under
`assets/03b4-evidence/03b4c4-near-grass-volume-primitive-workbench/`.

What this pass tried:

- `field-fiber-shell` stayed as the 03B4C3 baseline: field-owned shell records,
  no new primitive family.
- `alpha-impostor` was implemented as a deterministic mesh-stroke patch. This is
  only a stand-in for an impostor family; it does **not** generate an alpha
  texture yet, and texture telemetry correctly reports zero bytes.
- `billboard-cluster` was implemented as clump-owned crossed mesh strokes.
- `volume-card` was implemented as clump-owned shallow mesh volume cards.

Measured result:

- The baseline still submits `5200` shell records / `41600` triangles.
- The three candidate families use the clump reducer (`157` clumps, `452`
  submitted accents). `alpha-impostor` and `billboard-cluster` submit about
  `25312` triangles; `volume-card` submits about `28928`. All stay below the old
  rejected all-card tuft path (`83200` triangles).
- Against the target grass crops, edge structure remains far too low. Foreground
  edge ratios are about `0.302` for the shell baseline, `0.338` for the mesh
  alpha stand-in, `0.322` for billboard clusters, and `0.321` for volume cards.
  Midground ratios stay about `0.475..0.490` for all families.

Visual result:

- All candidates still read as sparse marks on top of a painted meadow plane, not
  as the target's continuous fuzzy grass volume.
- The mesh alpha stand-in is the least wrong in the foreground by edge telemetry,
  but the improvement is small and mostly comes from isolated olive/yellow marks.
- Billboard and volume-card variants are not meaningfully better than the shell
  baseline at the reference crop. They do not create the dense vertical/tangled
  mass the target shows.
- Neutral review agrees that `field-fiber-shell` is least wrong for grass only
  because it preserves smooth falloff and avoids the loudest card artifacts, but
  it still reads as flat brushed terrain with weak clumping and almost no upright
  blade silhouette. The other families read as repeated stains, scratches, or
  isolated card flecks.

Architecture learning:

- Mesh-only patches are the wrong next polishing surface. They stay bounded and
  cheap, but they do not create enough sub-pixel fiber density before becoming
  visible flecks, scratches, or dash marks.
- The next pass should move to a **true texture-backed alpha/volume primitive**:
  generated blade-stroke alpha texture or atlas, clump/field-cell ownership,
  height-faded dark bases, soft mip-friendly tips, and terrain-normal seating.
  Start CPU-generated and deterministic; only escalate to compute/indirect if
  that texture-backed CPU path looks visually right but is too expensive.
- Do not tune meadow colour, fog, camera, cliffs, water, root strength, or depth
  bands to hide this failure. The primitive family itself is still the missing
  variable.

## Accept / Reject

Accept a candidate family for the next implementation slice if:

- foreground crop visibly gains dense grass-like vertical/tangled structure
  relative to 03B4C3, not just more dark dots;
- midground reads as soft vegetated mass rather than flat smear or stipple;
- neutral review no longer calls the primary grass failure flat terrain,
  scratches, speckles, or missing blade height;
- the candidate stays under the rejected old all-card tuft cost for comparable
  apparent density, or records why a short-term spike exceeds it.

Reject if:

- the candidate is only less wrong because meadow colour, fog, camera, cliffs,
  water, or terrain changed;
- visible structure reads as decal stains, rows, X-card artifacts, flowers,
  hatching, repeated texture, or a billboard wall;
- route telemetry cannot explain where the extra density came from.

## Verification

- Capture a contact sheet and foreground/midground crop sheet from the same
  reference camera for all candidate families.
- Archive shots under
  `assets/03b4-evidence/03b4c4-near-grass-volume-primitive-workbench/`.
- Use `compare-screenshots` against the target foreground and midground grass
  crops and against the 03B4C3 best baseline. Judge the grass variable only.
- Run an unprimed `screenshot-critique` or subagent review scoped to grass density,
  primitive readability, stipple/scratch/card artifacts, and depth falloff only.
- Keep `battle-grass-field`, `battle-map-reference-fiber-shell`,
  `battle-map-reference`, and `renderer-lab-routes` green.

## Next Slice

This workbench did **not** identify an accepted mesh-only family. Continue with
`03b4c5-texture-backed-grass-volume.md`: a deeper true alpha/volume primitive
spike that keeps the same field records, crop windows, and baseline evidence but
replaces mesh strokes with generated alpha texture/atlas coverage. Do not keep
polishing the 03B4C4 mesh stand-ins unless the next pass is only collecting more
evidence.
