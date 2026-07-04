# Slice 14b - foreground blade legibility

## Contract

Turn the Slice 14a foreground grass body from a stippled texture-carrier carpet
into readable close grass: supra-pixel tufts/blades, rooted into the terrain, no
black voids, no ribbon walls, and no pale horizontal seam between foreground body
and the hills.

## Current Role

This slice is now parked as diagnostic polish, not the active blocker for the
style-family goal. The best grass work from this goal is already better than the
texture-carrier baseline and should be reused in the actual horizon-band scene.
Do not add another primitive family here unless a later full-scene pass proves a
specific foreground capability is still missing. The next implementation pass
should use this slice's close camera gate as evidence, then continue through
Slice 15 midground LOD, Slice 16 camera relock, Slice 17 foreground integration,
Slice 18 full-terrain grass/perf, Slice 18b evidence-led LOD, Slice 19 cliffs,
Slice 20 fog, and Slice 21
composition.

## Inputs From Slice 14a

- `heightmap-vista` can now opt into `field-accent` grass over
  `terrainSource=heightmap-layout`.
- Current best foundation candidate uses texture-carrier field-cell grass with
  a nonvoid foreground body and honest cliff masking, but Opus flagged it as
  high-frequency stipple rather than blade legibility.

## Scope

- First land the oracle: expose the existing field-owned body-domain and
  field-subcell primitive knobs on the real `heightmap-vista` route, then prove
  the verifier rejects the current false positives.
- Tune representation, not macro terrain. Prefer fewer/larger/taller near
  carriers or an existing field-body primitive over raising raw density.
- Trace and reduce the pale foreground/midground seam through meadow/fog/strength
  settings before adding more grass.
- Keep the shared green/olive grass palette; do not introduce a false-earth red
  palette to solve density.
- Keep slope/blocked tint rejection intact.

## Verification

- `battle-map-reference-foreground-grass-legibility-oracle` calibrates the
  verifier. It must pass the style target crop and reject known false positives:
  14a texture-carrier stipple (`raw-edge-stipple`), body-domain-only smear
  (`low-clump-contrast`, `low-structure-occupancy`), and strand-mat patches
  (`low-clump-contrast`, `low-structure-occupancy`, seam spike).
- Use a banded downsample/structure oracle, not a monotone score. A candidate
  must cap raw edge energy, retain structure after 4x downsampling, clear an
  absolute downsampled contrast floor, and fill enough downsampled tiles with
  local contrast. Raw 1px stipple and sparse leafy patches must both fail.
- Reject broad confetti that games tile occupancy. The target crop has strong
  downsampled vertical anisotropy (`down4.edgeYOverX=1.91`), while broadened
  field-fiber footprints land near `1.0`; the oracle labels that as
  `isotropic-confetti`.
- Add row-luma telemetry for the pale horizontal seam. Occupancy-only
  checkpoints may carry seam debt, but final grass acceptance must reduce the
  mid-band luma spike instead of hiding it with fog or material blur.
- Run screenshot-critique scoped to foreground blade/tuft readability, rooting,
  seam continuity, and noise/carpet artifacts.

## Current Checkpoint

14b1 landed the oracle calibration, not final grass. 14b2a then landed a
partial accent-occupancy checkpoint, also not final grass. Evidence lives in
`assets/slice-14b-foreground-blade-legibility/`.

- Target crop passes the oracle.
- 14a texture-carrier fails for `raw-edge-stipple`.
- Body-domain-only continuous nap reduces stipple and seam but fails for low
  clump contrast and low structure occupancy.
- Field strand-mat/subcell proves the real route can use the lab primitive, but
  it still reads as sparse pale patches and fails the oracle.
- `battle-map-reference-foreground-grass-accent-occupancy` proves vertical
  `field-fiber-body` geometry improves the same foreground crop from the strand
  baseline `tile4.occupancy3=0.474` to `0.619` while staying legal on raw edge
  (`5.788 <= 8`), downsample contrast (`5.002 >= 5`), retention (`0.62 >=
  0.35`), and spread (`cv=0.52`). Under the tightened oracle it still fails for
  `low-structure-occupancy` and `isotropic-confetti`; the target crop is
  `0.799`, and the oracle floor is `0.7`.
- 14b2a intentionally records the seam as unresolved evidence, not an
  acceptance gate: candidate seam jump is `2.022` versus strand baseline
  `1.722`. Rooting/seam belongs to 14b2c after the occupancy floor is crossed.

## 14b2 Spike Findings

A read-only Opus checkpoint and throwaway sweep tested the current real
`heightmap-vista` foreground crop after the oracle landed. Body-domain floor and
detail strength can fill coverage telemetry, but at useful strength they create
raw 1px energy and a visible horizontal patch-sheet seam. Lower legal strengths
leave the crop under-occupied. Coarser body-domain frequency got closest
numerically but still failed raw-edge and seam. Field-subcell strand geometry is
the best source of real supra-pixel structure, but the current candidates
plateau around `tile4.occupancy3=0.567` while the target crop is `0.799`.

Do not solve 14b2 by making body-domain material sharper. Treat body-domain as
low-frequency rooting/void fill. The next implementation pass should push
field-fiber or near-accent geometry across the oracle occupancy floor
(`tile4.occupancy3 >= 0.7`) while staying below the raw-edge cap; after that,
solve the seam/rooting transition.

14b2b rejected spike: `fiber-floor-broad-tiles` reached
`tile4.occupancy3=0.767`, `rawEdge=6.715`, `down4.contrast=8.019`, and one draw
call by widening footprint/spread (`grassAccentFootprint=4.6`,
`grassSpread=0.260`). Opus review and visual inspection rejected it as broad
pale confetti that games tile occupancy. `fiber-floor-broad-threaded` also
crossed the old floor (`0.719`) but remained isotropic. Do not build seam/rooting
on either. Search next from denser clump/blade count with footprint around or
below `3.4`, spread around or below `0.19`, and vertical blade heights around
`1.1-1.3`; investigate why requested `accentTufts=20000` often lands near
`14k-15k`.

14b2b diagnostic spike: Opus found that `field-strand-mat` had a dead density
knob: `grassBlades >= 12` always produced 24 non-woven ground strokes. The
renderer now preserves the `grassBlades=12` baseline but allows high-blade
strand mats to opt into up to 40 strokes through `fieldStrandMatStrokeCount`.
It also exposes `grassAccentCellSizeScale` plus source-cell-size stats so future
sweeps can change aggregation grid size without overloading footprint.

This spike did not accept 14b2b. After the stroke-count fix,
`strand-deep-soft-thread` measured `tile4.occupancy3=0.670`, `rawEdge=5.770`,
`down4.contrast=14.082`, `down4.edgeYOverX=1.592`, `retention4=0.810`,
`cv=0.636`, `drawCalls=1`, and `submittedTriangles=2591616`: clean directional
structure, but still below the `0.7` occupancy floor. `grassAccentCellSizeScale`
sweeps at `0.66`, `1.2`, `1.4`, and `1.7` changed source cell counts and
triangle budgets but left occupancy pinned at `0.670` or worse. Full-frame
inspection shows the current crop is not a pure foreground blade crop; it
includes a smooth foreground-to-midground transition band. Do not keep treating
the full-crop occupancy miss as only a blade-density problem.

The band-split scene
`battle-map-reference-foreground-grass-band-split` now makes that diagnosis a
gate. It grades `transition` (`y=0.56,h=0.16`) and `lower` (`y=0.72,h=0.22`)
separately for the target, the best strand candidate, and the rejected broad
fiber control. The target passes both bands. The strand lower band clears the
older occupancy/spread checks plus the continuity floor:
`tile4.occupancy2=0.907`,
`tile4.occupancy3=0.773`, `tile4.cv=0.613`, `rawEdge=4.252`,
`down4.contrast=12.137`, and `down4.edgeYOverX=1.554`. The broad fiber control
still fails `isotropic-confetti`, so the lower-band gate does not reopen the
pale-confetti path.

Opus review and visual inspection rejected that lower-band pass as a metric
false positive: it reads as flat stipple on a green plane, not foreground
blades. The oracle now adds `verticalRun.p90Height >= 0.22`; the target lower
band passes at `0.502`, while the same strand lower band fails only
`short-vertical-runs` at `0.060`.

This does not finish 14b. The lower-band strand candidate still fails the
full crop (`low-structure-occupancy`, `bad-structure-spread`,
`short-vertical-runs`) and transition
band (`low-downsample-retention`, `low-clump-contrast`,
`low-structure-occupancy`, `bad-structure-spread`, `isotropic-confetti`,
`short-vertical-runs`). That remaining failure is foreground blade coherence
first; transition/midground LOD waits until a primitive family is visually
ratified.

Opus review on 2026-07-04 corrected the 14b2c conclusion: the primitive bakeoff
rejected the flat/stipple, domain, card-as-wired, and texture routes, but it did
not fairly exhaust every existing route. The earlier `field-fiber-body` vertical
family was not included in the latest bakeoff even though 14b2a showed it was
the best real-geometry candidate so far, and the card families selected too few
near records to count as a fair rejection. Treat 14b2c as a diagnostic warning,
not as permission to skip evidence. The next pass should either make
`field-fiber-body` pass the lower-band oracle with upright/view-aware
sub-cell density or prove it still fails before adding a new primitive variant.

14b2d fair-confirmation checkpoint: the bakeoff now includes a grass-off
negative anchor and the previously omitted `field-fiber-body` vertical route.
Grass-off fails the hardened oracle (`tile4.occupancy3=0`, `p90Height=0.030`,
`tallColumnRatio=0.002`), so terrain texture alone cannot satisfy the gate.
`field-fiber-body` also fails honestly: it overfills the lower crop
(`tile4.occupancy3=0.953`, `tile4.cv=0.201`) while producing no connected tall
columns (`verticalRun.p90Height=0.024`, `tallColumnRatio=0`). This rejects
another density or body-family sweep on the current crop.

The failed experiment also exposed a deeper slicing issue: the current
`heightmap-vista` lower crop is an integration guard, not yet a close-foreground
blade-ratification gate. It sees primitives mostly as distant ground patterns.
Do not add more unratified primitive families against that crop. First establish
a close foreground camera/crop on the heightmap route where actual blade
geometry can affect `verticalRun` without scaling grass into implausible walls;
then judge the primitive there and carry it back to the vista bakeoff.

14b2d camera-gate checkpoint: the route now publishes
`foregroundBladeProjection` from the shared `camera3d` projector, and
`battle-map-reference-foreground-grass-camera-gate` compares the accepted vista
against a close heightmap review camera. The integration vista projects the
nominal `1.12`-world-unit blade to `4.536px`; the close gate projects it to
`12.011px` while preserving the same field-owned, slope-masked grass path. This
does not accept the current primitive as dense grass. It only establishes the
right ratification surface for the next primitive pass.

Split the remaining work:

- 14b2a - Accent occupancy checkpoint: prove vertical field-fiber geometry
  improves occupancy over the strand baseline without raw-edge stipple.
- 14b2b - Lower-foreground occupancy/spread: numeric false-positive checkpoint.
  The candidate clears
  `tile4.occupancy3 >= 0.7`, `rawEdge <= 8`, `down4.contrast >= 5`,
  `down4.edgeYOverX >= 1.25`, and `tile4.cv` inside `[0.45, 0.9]`, but fails
  `verticalRun.p90Height >= 0.22`, so it is not accepted as blades.
- 14b2c - Foreground blade coherence / primitive bakeoff: diagnostic accepted.
  The tight near crop rejects
  `field-strand-mat`, `field-domain-micro-strand`, `field-domain-shell`,
  `alpha-impostor`, `billboard-cluster`, and `texture-micro-carrier`.
  `field-strand-mat` remains the closest false positive but fails
  `short-vertical-runs` with `verticalRun.p90Height=0.060` versus the target's
  `0.502`. This does not exhaust `field-fiber-body`, and the card routes were
  starved by selection wiring.
- 14b2d - Foreground framing / blade primitive: fair vertical confirmation is
  complete and rejected, and the close foreground camera gate is established.
  Keep this gate as future polish evidence. For the current direction, carry the
  best existing field-owned grass into the vista and continue with Slice 15
  rather than inventing another primitive.
- 14b2e - Rooting/midground transition: reduce the mid-band luma jump and
  smooth LOD handoff without hiding terrain or creating stipple.
- 14b2f - Acceptance: rendered candidate passes the oracle and scoped
  screenshot critique.

## Accept / Reject

Accept if the close foreground reads as grass structure at the review camera,
not stippled noise, while preserving 14a's masking, no-void, and draw-call
contracts.

Reject if the verifier still rewards raw edge energy, if density only increases
1px noise, or if seam/fog tuning hides terrain problems.

Acceptance must keep positive and negative anchors together: target crop passes,
grass-off on the identical crop fails, known flat-stipple controls fail, and any
candidate must clear both `verticalRun.p90Height` and a tall-run density/count
check so isolated spikes cannot game the lower-band gate. Run
[compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md) against
the target lower-band crop and
[screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md) before
accepting 14b2f.
