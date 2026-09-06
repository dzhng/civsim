# Merged playback transport: visual verdict

Target: preserve the production camera, environment, placeholder geometry and
material identity while displaying the resolved fractional local pose and masked
blend. The workbench must describe what the GPU actually renders. This is not
acceptance of soldier art or temporal continuity.

The reference is the committed pre-cutover image; the candidate is the assembled
06b production route at85728851 plus the terminology and fixture repairs. Both
use the same scene camera, viewport, frozen inputs and bundled Chromium with
SwiftShader. The second independent scene run produced byte-identical candidate
PNGs for all four pairs. Full images and nearest-neighbor detail crops were
inspected directly, not just inferred from numeric reports.

| Pair | Exact changed pixels | Verdict |
| --- | ---: | --- |
| Replay | 64,741 | Candidate is less wrong for transport: the rider's arm/torso now receives the resolved masked pose, and the panel accurately reports GPU blending rather than base-only sampling. The static image cannot prove transition timing. |
| Submission | 7,336 | Candidate is less wrong for transport: fractional pose evaluation changes the limbs and corresponding shadow. Battle-adapter and explicit submissions still produce identical pixels; the CPU/GPU palette oracle supplies the pose correctness evidence. |
| Controls | 4,002 | The model crop is unchanged. Navigation names the current animation representation; this is a terminology correction, not an art change. |
| Swatches | 1 | Equivalent visible material result. At(575,2458), RGBA changes from[143,140,96,255] to[144,140,96,255]. This is stable across repeats after local-palette arithmetic; no material parameter or tolerance changed. Stock-loader interior checks retain their existing limits. |

The helper's `parityDistance` field is a distance, not an acceptance score.
Replay full/world distances are0.01096/0.01095; submission world distance is
0.01421. The rounded swatch distance is0 despite its exact one-pixel difference.
See [telemetry](diff/visual-parity-diff.json) for the complete measurements.

## Unprimed critique

A fresh agent saw only neutral A/B full images and detail crops, with no project
history or expected verdict. Mapping was replay A=reference, submission
A=candidate, controls A=reference and swatches A=candidate.

It confirmed changed replay torso/arm orientation and small submission limb
positions, visually identical controls-model crops and no discernible swatch
difference. It found no obvious added holes, detached parts, severe clipping or
rendering corruption. It correctly declined to decide animation timing or which
pose is mathematically intended from a still.

Both navigation bars overflow the right edge; this is inherited horizontal
navigation, not new lost access (the raw-route navigation check verifies scrolling
to the last link). Both placeholder feet have weak ground-contact readability.
Detailed anatomy, authored motion and distance/contact review remain with their
later owning slices; these images do not satisfy the Rome II quality target.

Decision: accept these four deliberate baseline changes for06b only. Keep the
zero-tolerance regression gate and run a strict repeat after re-blessing. The
disposal race and malformed missing-clip fixtures were fixed separately; neither
was waived by this visual verdict.

## Changed-test ledger for integration cleanup

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Workbench missing `march` reload | Deleting only clip metadata formerly reached missing-action validation; with contiguous local samples it instead failed structural validation | Rebakes the source without `march`, then requires the missing walk-action error and retained pose | Exercises the same semantic contract through valid new-format data. **moved** |
| Workbench truncated animation | Expected a matrix-data error | Requires explicit invalid local samples/metadata rejection | Animation storage changed; rejection remains mandatory. **moved** |
| Workbench missing future `attack_a` reload and startup | Metadata-only removal became structurally invalid before the requested action check | Valid rebaked omission reaches the melee-action error at both entry points | Preserves non-active action admission coverage. **moved** |
| Gameplay action metadata unit test | Error named rig/VAT | Error names source/sampled; all missing/duration/loop/release assertions retained | Terminology follows the one current representation. **moved** |
| Swatch console-warning check | Failed on deprecated TSL `.append()` warning | Same expression uses installed `.toStack()` and warnings are empty | Removes the deprecated call without filtering console output. **your-regression** |
| Four snapshot files above | Old selected-base poses and wording; old scalar swatch rounding | Reviewed poses/wording and stable one-level swatch pixel, exact comparison retained | Full details and measured counts are in the pair table above. **moved** |

Other changed scene lines are descriptions/comments. No simulation tests, unit
stats or balance expectations changed. Newly registered numerical/consumer scenes
add coverage without dropping existing default renderer scenes.

The integration cleanup received a separate read-only code review: no actionable
findings in fixture rebaking, installed TSL API equivalence, replay reporting or
suite registration. The CLI review command became unavailable with server400
(model requires newer CLI); no automatic upgrade or model override was made.
The independent agent review is recorded as the fallback, not a successful CLI
run. The substantive producer and GPU consumer reviews are recorded in their
own evidence leaves.
