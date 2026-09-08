# Authored corpse geometry

Authored skinning owns the body pose; death shading
must not add another rotation to positions, normals, tangents or visibility
bounds. Both renderer substrates retain facing, scale and terrain elevation.
The existing death-blend weight still controls corpse desaturation/darkening and
the living-contact AO fade. No timeline, simulation, asset or admission change.

The obsolete per-instance variant field, hash and fixture query are removed;
the aligned GPU layout retains zero padding. This avoids a dormant variation
mechanism or an asset-specific exception. Deferred variation is not implemented
through a source compensation or runtime fallback.

## Discriminating evidence

The LOD admission test was changed first: two identical authored bounding spheres
with death shading weights 0 and 1 must both remain outside the same halfspace.
Old behavior was `[0, 1]`; the corrected bounds return `[0, 0]`. Existing near-plane
coverage and the exact pre-optimization audience hash pass without repinning.

The independent production normal-frame oracle now expects weighted source pose
plus instance yaw, with no extra corpse rotation. Initial run 74339 failed before
the assertion because an old fixture treated the main/shadow bucket map as an
array. Directly selecting its main audience repaired that stale access. Run
37481 was interrupted for GPU scheduling and supplies no acceptance evidence.
The repaired old-shader run 82989 completed with exactly one failure:
`authored-corpse/near: production directions match independent posed frame`.
Other controls passed. This is the renderer regression's red control.

Frozen rejected death G is only a before/after diagnostic. Its supplied CPU
probe reports final native floor +3.227 mm and legacy full-strength rolled floors
-247.370/-26.179/-121.259 mm. Earlier sampled rows are full-strength controls,
not a claim about the live blend trajectory. G's body-support defects remain;
preserving it does not accept its art or promise convincing corpse contact.

Frozen donor: `/Users/david/dev/game-heavy-death-study/throwaway/heavy-death/g/heavy-kit.glb`,
SHA-256 `008dec666d9e915c518e9da6365359b2ade09dc48955dbcc6cc26b2eea7a9418`.
Its preserved derived bundle is served read-only through the ignored
`web/public/_corpse-control` symlink, not added to a production catalog.
Before capture 92563 passed eight whole-body controls and exact repeats.

## Review

The complete 354-test web suite and TypeScript no-emit pass. Independent Codex
review 84422, session `01a07f47-1780-7a91-8dfc-4fe888e47220`, found no actionable
correctness or shape defect and independently passed the twelve LOD tests.
It did not claim GPU validation or visual acceptance. The code is net deletion:
one authored geometry owner replaces repeated procedural pose changes.
Final CPU session 69246 repeated TypeScript and all 354 tests successfully after
the transfer oracle and temporal-culling repair. Diff whitespace and JavaScript
syntax checks also pass. Production code removes 61 lines net; the additional
consumer tests distinguish bounds, positions and lighting without a new renderer,
asset flag or runtime fallback. Parent owns the current-spec link/prose update.

Production normal/material gate 64946 completed with no failures. The authored
corpse near-frame oracle moved from minimum dot -0.952837 to 0.9999999984 across
56 interior samples. The old value includes rays that miss the procedurally
rotated body; it is not solely an angular normal error. All five existing raw
snapshots remain exact. The new raw corpse snapshot is a diagnostic baseline,
not final model art.

The raw positional regression compares living/corpse foreground coverage against
an independently captured empty background. Restoring only the historical raw
roll block (padding supplies variant zero) made mutation run 33234 fail exactly
two checks: 46,463 coverage pixels changed and the new corpse snapshot differed
by 58,323 pixels. Its CPU-preposed tangent comparison still passed: that check
shares the downstream shader and alone cannot reject a post-skinning rotation.
It remains a skinning/frame consistency control, not a no-roll oracle.

The corrected raw shader was restored byte-identically to SHA-256
`bc6690ff9682d142bd1a2f9a36f8fb8494c272076d588e65f2eb3f250eb1134d`.
Normal repeat 68085 passed all six snapshots exactly, with 42,560 foreground
pixels and zero coverage changes. Its mapped tangent prepose error was zero.
No tolerance was relaxed and no old baseline changed.

The subsequent directions-only mutation 79276 restored the historical -0.42
radian corpse rotation to raw normals/tangents, leaving positions corrected.
Coverage remained exact (42,560/0) and CPU-preposed consistency still passed,
but the independent final-color-transfer test failed at maximum 31 bytes across
36,428 samples; the diagnostic snapshot changed 41,169 pixels. This separates
directional lighting from positional coverage. The shader was again restored
to the exact hash above before final standard run 56576. That run completed with
exactly two failures, both old mounted dead-frame snapshots; all other 677
checks passed, with no page errors. The raw transfer returned maximum one byte
over 36,428 samples and all six raw snapshots were exact. The three temporal
culling fixtures each measured `[0,0,0]` outside and `[1,1,1]` inside across
weights 0/0.5/1. Their structured rows are in `final-raw-replay.json`.

The old mounted snapshots `temporal-7-39.5` and `temporal-7-72` have 20,915
and 15,870 thresholded mismatch pixels respectively. Their actual PNGs are archived here, not blessed.
The main author inspected both old/actual pairs: framing and content remain,
with changed body orientation during death and terminal hold. Parent owns
independent merged snapshot review and disposition. All other 42 existing
action-replay snapshots passed the gate; this was not pixel equality. The
complete merged inventory below corrects that earlier overstatement. Neither
source animation nor timeline selection changed.

Separate unprimed temporal-image review 78530, session
`01a07f63-5035-7842-b305-30ea7e53cac0`, completed terminal 0 and actually loaded
the four old/actual images. Its exact verdict is in
[temporal-visual-review.txt](temporal-visual-review.txt), separate from the G
critique. Both pairs are comparable and complete within the frame, with no
obvious disappearing component or unmistakably detached equipment. At 39.5,
B is slightly clearer while A has a stronger apparent grounding cue; there is
no decisive overall winner. At 72, A is marginally stronger for the visible
body/ground relationship, but both remain unclear as a settled mounted corpse.
Main inspection agrees with the completeness finding and preserves the mixed
grounding verdict. This does not establish physical contact or an art-quality
upgrade. Parent still owns baseline disposition and merged normal repeat; this
CPU-only follow-up changes no source, GPU output or baseline.

The transfer oracle starts from observed living illumination, decodes sRGB,
applies only the retained final linear desaturation/darkening, and re-encodes.
It does not call the corpse shader to compute its expected result. Samples are
unclipped, smooth foreground interiors, excluding raster-edge mixtures; two
bytes cover input and output quantization. The fixed raw lighting style is
pinned by this diagnostic, not promoted to photoreal parity. Independent code
review 53178 also checked the transfer; see `code-review.txt`.

Both frozen-G cameras retained exact living-control pixels. The six dead
comparisons changed 33,771–48,282 pixels; corrected variants 0/1/2 are exactly
identical within each camera. All eight before and after cases repeat exactly.
The after process completed its final checks and exited before mutation; its
PTY handle was unavailable after context rollover, so no invented handle is
reported. These images use the same source, final death phase, fixed camera and
ground, not a revised source or an invisible lift.

Fresh neutral visual review 5456, session
`01a07f4e-2473-75b1-9b20-f3d0c52c4b69`, actually loaded nine images: six whole
pairs, two enlarged crops and the raw diagnostic. Its exact verdict is archived
in `fresh-visual-review.txt`: both G poses are wrong as grounded art; B is usually
less wrong for silhouette completeness. Main inspection agrees: removal makes
the shield outline more complete and removes arbitrary variant differences,
but G still reads rigid and suspended, with obscured opposing-view sword and
weak body/gear support. These are retained source/view limitations, not grounds
to compensate the source for the renderer. The diagnostic block figure's gaps
also exist in its unchanged living control; no final anatomical quality is
claimed. Navigation overflow has its existing scroll-accessibility check.

## Complete merged temporal inventory

Root's selective refresh exposed nine changed death snapshots: seven earlier
passed under the existing 2% mismatch-ratio limit. Passing that gate was
incorrectly called exact in the earlier report. The two reported failure counts
also counted thresholded mismatches, not every changed decoded pixel.

[Preserved comparisons](temporal-nine/comparison.json) compare root
`1ba33789cedb2b8c97abc20b4f258b639b0519eb` HEAD images (A) with its current
refreshed images (B), before root's normal repeat completed. Original PNGs,
candidate PNGs and whole-image side-by-side pairs are preserved beside the JSON.
Decoded counts below include any differing RGBA channel, including shadows;
they are not the harness's thresholded metric and do not judge quality.

| Fixture | 37.25 | 39.5 | Terminal |
| --- | ---: | ---: | ---: |
| 4 | 102325 | 115124 | 44264 (72) |
| 7 | 173560 | 188909 | 119371 (72) |
| 41 | 171426 | 186509 | 187166 (75) |

Fresh neutral CLI review 30327, session
`01a07f79-da77-7fd2-bbff-e41fd88d0060`, completed terminal 0. Its transcript
contains all nine paired input images; no code/history was supplied. The exact
[verdict](temporal-nine/visual-review.txt) finds no obvious missing, detached or
frame-clipped component. B is modestly less wrong in four pairs for readability
or apparent balance; five are unclear. The strongest shared concern is the
elevated rear assembly of fixture 7 at 72, with no convincing visible support.
This is diagnostic completeness review, not final art or physical contact proof.

Main inspected all nine whole pairs and agrees with that bounded verdict.
The critic calls B's higher projected position a framing difference; no camera
change is demonstrated by these pixels, so that phrase is not adopted as a
camera-change finding. Pose rotation itself changes projected height. Root owns
baseline disposition and the merged normal gate. This CPU-only follow-up edits
no source or baseline and does not count as another capture.

## Reproduction and scope

Run the existing `battle-model-normal-frame` and `soldier-materials` scenes with
`VERIFY_GPU=1 VERIFY_URL=http://localhost:5449 node web/scene.mjs` and
`SCENARIO_REPORT_JSON=../throwaway/corpse/<name>.json`. Run web Vitest and
TypeScript through the existing web toolchain. The frozen-G one-off capture is
preserved, not promoted to a second gate owner, at
`/Users/david/dev/game-authored-corpse-pose/throwaway/capture-corpse.mjs`:
`CANDIDATE=before node throwaway/capture-corpse.mjs` on the old renderer and
`CANDIDATE=after node throwaway/capture-corpse.mjs` on this renderer. It serves the
frozen derived bundle via the ignored symlink noted above. Comparison script
`throwaway/compare-corpse.mjs` emits the archived paired PNGs and JSON.

Capture uses 1280×800 viewport, a 1024×640 world crop at (128,96), yaw 0.6/3.7,
pitch 1.1, zoom 190, target (0,0,0.35), facing π/2, final death phase 1, position
and elevation zero. The living diagnostic deliberately holds the same final
death pose with corpse shading off; it is not a live animation binding.

Action-timeline and simulation policy are unchanged. The two temporal snapshot
dispositions remain a separate parent-coordinated regression gate; this evidence
does not claim that all battle screenshots are unchanged or the combined run
was entirely green.

## Change ledger

| Test | Previous behavior | Current behavior | Why |
| --- | --- | --- | --- |
| `test("near-plane bounds keep full detail and corpse shading never moves authored bounds")`, `web/tests/photorealCrowdLod.test.ts` | Old test required different visibility; new assertion on old bounds measured `[0,1]` | `[0,0]` and equal assignments; existing near-plane checks pass | Removing post-roll from bounds prevents shading weight from changing visibility. **moved** |
| `run()` / `authored-corpse/near: production directions match independent posed frame`, `web/scenes/models/battle-model-normal-frame.mjs` | Old oracle expected additional roll; revised oracle on old shader measured minimum dot -0.952837 across 56 samples | Source pose plus yaw, minimum dot 0.9999999984 across 56 samples | Both source positions and mapped frame now agree with the independent ray/pose oracle. **moved** |
| `run()` / fixture setup, `web/scenes/models/battle-model-normal-frame.mjs` | Run 74339 stopped at `replacement.buckets[40].find is not a function` before assertions | Selects actual `.main` audience; run 82989 reaches the behavioral red and corrected run 64946 passes | The baseline owner already exposes a main/shadow bucket map, not an array. This access repair is separate from the corpse fix. **carried-in** |
| `run()` / `corpse shading preserves independently preposed mapped tangent frame`, `web/scenes/system/soldier-materials.mjs` | Variant-delta oracle required interior error ≤4 and mean <0.01, allowing measured shader trigonometric error | CPU-preposed frame requires interior error ≤2 and mean <0.01; measured all errors zero | Obsolete variant semantics are removed; the retained assertion is explicitly a skinning/frame consistency control. **moved** |
| `run()` / `corpse shading preserves authored geometry coverage`, `web/scenes/system/soldier-materials.mjs` | No assertion; old-roll mutation changes 46,463 coverage pixels | 42,560 living foreground pixels, zero changed coverage | The independent background mask rejects post-pose position rotation. **moved** |
| `run()` / `snapshot soldier-materials-authored-corpse`, `web/scenes/system/soldier-materials.mjs` | No baseline; old-roll mutation differs by 58,323 pixels | New diagnostic baseline repeats at zero pixels; all five old snapshots remain exact | Pin inspected renderer output, not anatomical art acceptance. **moved** |
| `run()` / `corpse mapped lighting changes only by the final color transfer`, `web/scenes/system/soldier-materials.mjs` | No assertion; directions-only mutation has maximum 31-byte error over 36,428 stable samples while coverage remains exact | Maximum permitted error 2 bytes, with >100 samples; final standard run measures 1 byte across 36,428 samples | Independent observed-light transfer detects extra normal/tangent rotation without conflating it with geometry displacement. **moved** |
| `verifyTemporalReplay()` / `{4,7,41}: production frustum culling preserves authored bounds across death shading`, `web/scenes/models/_temporal-replay.mjs` | Halfspace expected visibility to change from 1 at weight 0 to 0 at weight 1, deriving the expected center from `cos(-0.42*weight)` | At ±5cm authored-bound halfspaces, each fixture measures `[0,0,0]` outside and `[1,1,1]` inside across weights 0/0.5/1 | Parent review found this missed old-contract consumer. Removing only its variant property was insufficient; the assertion now checks source-owned bounds rather than restating removed shader geometry. **moved** |
| `verifyTemporalReplay()` / `snapshot shared/soldiers/action-replay/temporal-7-39.5`, `web/scenes/models/_temporal-replay.mjs` | Baseline contains the procedurally rolled death blend | 20,915 thresholded mismatches; merged comparison has 188,909 exact decoded changes | Shader post-roll removal changes displayed orientation without changing the independently verified local pose/palette. Baseline disposition belongs to parent. **moved** |
| `verifyTemporalReplay()` / `snapshot shared/soldiers/action-replay/temporal-7-72`, `web/scenes/models/_temporal-replay.mjs` | Baseline contains the procedurally rolled terminal death | 15,870 thresholded mismatches; merged comparison has 119,371 exact decoded changes | Same source-owned pose correction; baseline disposition belongs to parent. **moved** |
| `verifyTemporalReplay()` / `snapshot temporal-4-37.25`, `web/scenes/models/_temporal-replay.mjs` | Procedurally rolled baseline | 102,325 exact decoded changes; earlier gate passed tolerance | Post-roll removal changes geometry/shadow projection, not a pixel-exact pass. **moved** |
| `verifyTemporalReplay()` / `snapshot temporal-4-39.5`, `web/scenes/models/_temporal-replay.mjs` | Procedurally rolled baseline | 115,124 exact decoded changes; earlier gate passed tolerance | Same source-owned pose correction. **moved** |
| `verifyTemporalReplay()` / `snapshot temporal-4-72`, `web/scenes/models/_temporal-replay.mjs` | Procedurally rolled baseline | 44,264 exact decoded changes; earlier gate passed tolerance | Same source-owned pose correction. **moved** |
| `verifyTemporalReplay()` / `snapshot temporal-7-37.25`, `web/scenes/models/_temporal-replay.mjs` | Procedurally rolled baseline | 173,560 exact decoded changes; earlier gate passed tolerance | Same source-owned pose correction. **moved** |
| `verifyTemporalReplay()` / `snapshot temporal-41-37.25`, `web/scenes/models/_temporal-replay.mjs` | Procedurally rolled baseline | 171,426 exact decoded changes; earlier gate passed tolerance | Same source-owned pose correction. **moved** |
| `verifyTemporalReplay()` / `snapshot temporal-41-39.5`, `web/scenes/models/_temporal-replay.mjs` | Procedurally rolled baseline | 186,509 exact decoded changes; earlier gate passed tolerance | Same source-owned pose correction. **moved** |
| `verifyTemporalReplay()` / `snapshot temporal-41-75`, `web/scenes/models/_temporal-replay.mjs` | Procedurally rolled baseline | 187,166 exact decoded changes; earlier gate passed tolerance | Same source-owned pose correction. **moved** |

Reconciliation: the earlier LOD audience-sequence test only loses an obsolete
fixture property/comment; its assertion and hash remain exact. The temporal
replay culling assertion is intentionally changed as listed above; this corrects
the earlier incomplete ledger claim that only its unused property changed.
No unit-stat, simulation or golden-hash input changed.
