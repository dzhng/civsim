# 04a integration — explicit scalar surfaces

This checkpoint verifies authored scalar material transfer, not final soldier art.
04a is complete: GPU-error admission, material validation and late-pose reload
revalidation pass. Controlled far comparison isolated missing contact darkening;
the merged correction also passes. The README owns the next pickup point.
Geometry and clips remain the diagnostic/placeholder content from03. The same
linear material table and explicit faction mask feed near, raw and far consumers;
instance seed no longer changes appearance. Texture transport and posed normal
maps remain04b/04c, followed by the six-swatch oracle in04d.

## Integration findings

The production workbench independently changes roughness and metallic while
holding geometry/color fixed; both change pixels. Changing only instance seed
preserves exact pixels. Ordinary blue with mask zero is faction-independent;
setting the explicit mask permits faction tint. Existing reload failures,
allocation rollback, battle-submission parity and frozen-frame checks still pass.

Main visual inspection caught mottled chest/headgear surfaces missed by the
scalar-only probes. A new material-table permutation test reverses the table and
remaps every corresponding vertex ID: an equivalent asset must render identically.
It failed with fragment-interpolated float IDs and passes when conversion to an
integer occurs in a flat vertex varying. Interpolation roundoff could previously
select the preceding material slot. The shared fix applies to mesh shading and
the property bake, without changing geometry, lighting or authored material data.

The exact red/green reports are retained in `material-id-red.json` and
`material-id-green.json`. Their old screenshot failures are intentional pending
baseline refresh, not relaxed tolerances. All behavioral assertions pass in green.
The nine single-slot far-property snapshots remain byte-identical; five multi-slot
distance snapshots move by184–2187 pixels because the incorrect slot speckles vanish.

An independent unprimed reviewer compared the noisy and corrected full frame plus
the soldier crop: camera, pose and geometry match; the corrected image preserves
cleaner uniform face shading and removes chest/headgear speckling. It also noted
inherited flat dark limbs, crowded hand/hilt, weak grounding and diagonal stair
steps. These remain anatomy/equipment/distance work, not a material-ID fix. The
focused comparison's full-frame distance is0.01324 and soldier-crop distance0.02828;
crop edge energy falls to0.88698 of the noisy version because spurious detail is
removed, not because geometry disappears.

The final raw-renderer critique similarly found matching army geometry, framing
and flag attachment. Correct linear-light/material transfer darkens some warm
placeholder skin/equipment and reduces their readability at army scale. That is
an explicitly disclosed negative visual result, not an aesthetic improvement or
permission to compensate with incorrect color conversion. Final authored surface
work in18/22/26 owns the palette/readability decision. Deliberately uniform blue
and metallic diagnostic overrides lose material boundaries by construction;
the authored multi-material crop remains readable. Existing crowded grips and
thin overlap seams match the unchanged placeholder geometry.

## Resource and verification envelope

- Source bake suite passes, including unchanged geometry/weight/bounds and
  deterministic package/web outputs; see `explicit-placeholder-surfaces.md`.
- After GPU-admission integration, main typecheck and202 Vitest tests pass.
  Strict workbench, far-admission, far-property, far-bundle and Blender candidate
  scenes pass with their existing snapshots at zero changed pixels.
- The late-pose reload test holds GPU admission while selecting appearance14,
  absent from the pending catalog. Removing final revalidation makes the test
  fail: the old crowd is discarded, appearance14 disappears and scene nodes
  fall111→107. Restoring the guard rejects the candidate explicitly, preserves
  appearance14 and leaves111 nodes. This is a real consumer failure, not a
  defensive check with no reachable outcome.
- Before raw integration, direct main typecheck and199 Vitest tests pass.
  Independent code review found no actionable defect and independently passed
  the same gates; its sandbox could not launch Chromium, so direct browser runs
  remain the browser evidence.
- The merged far-property and distance checks pass every behavioral contract.
  The final flat-ID run initializes in580ms; full catalog reload is3415.535ms
  including fetch/presentation. Texture count returns102→183→102. These timings
  are observations, not newly loosened route deadlines.
- Atlas format/dimension accounting is235,929,120 bytes for twenty appearances,
  with471,858,240 bytes during complete replacement, excluding other resources
  and backend alignment. It is not an OS residency measurement. See
  `far-properties/review.md` for the allocation and fragment-normal evidence.
- Main hardware gate passes on Apple Metal3,1280×800,30,560 soldiers,150 GPU
  samples per stationary view: median10.46ms mid /11.17ms vista. Camera rAF p95
  is19.41ms pan,22.70ms zoom sweep,19.32ms wheel burst,19.12/19.65ms close fill.
  All unchanged33ms gates pass. Simulation is paused in this standing renderer
  test; live animated performance is still07.

The main Preview checkpoint opened the corrected production model, far scalar
comparison and raw authored diagnostic at04:00 UTC on2026-09-06. This is a
non-blocking infrastructure review, explicitly not placeholder art sign-off.
It closed at04:06 UTC without a response. Continuing on the technical evidence is
a provisional implementation decision, not user endorsement.

The two Blender candidate sheets were also independently compared at matching
poses. Their source declares linear gray0.45, roughness0.8 and metallic0; the
previous RGB guessing rendered gold highlights and blue limb tinting. The new
sheet is closer to the actual matte gray target. The unprimed reviewer found
matching geometry/pose, restrained highlights and clearer diffuse planes, with
inherited soft shadows and environment tint. The checker remains unimplemented
until04b; these snapshots do not certify textured-material fidelity. The reviewed
human/mounted scalar comparisons are retained beside this report.

## Changed main tests

Final independent code review found that malformed fetched material factors could
be packed as invalid GPU values without a WebGPU validation error. The shared
loader now validates the full material table before returning a bundle. The
existing complete-bundle test demonstrably accepted a null slot before the fix;
it now rejects null/empty tables, malformed RGBA and missing, nonnumeric or
out-of-range factors without confusing the test with a missing-slot error. The
production workbench also reloads a material with missing roughness and proves
explicit rejection plus byte-identical previous pixels. The review finding is
resolved; typecheck and the focused loader/browser checks pass.

The subsequent contact correction has its own controlled evidence and independent
critiques in `far-grounding/`. Main inspected the merged diff: all near snapshots
are unchanged; three far-bundle and six far-property snapshots change only in
lower-body grounding (149–2233 pixels each). Those intended changes were refreshed,
then strict grounding/bundle/property/admission/default-battle scenes passed.
Typecheck and202 tests pass. The final Apple Metal3 standing benchmark retains
30,560 soldiers at1280×800 and150 GPU samples per stationary view: medians10.25ms
mid and11.11ms vista, with all unchanged33ms camera gates passing. Simulation is
paused, so this still does not substitute for07 live animation acceptance.

An extra full-game liveness run exposed a pre-existing campaign workload assertion:
it expects over1000 line segments, but both base90bbdcaa and current code generate
28 sea-lane strips; roads are reported separately as288,852 triangles. The test,
data and geometry owner are byte-identical across that comparison. A separate
verification-maintenance pass corrects the asserted workload, not the renderer.
This failed extra run is not reported as a passing full-game suite.

No texture, anatomy or final distance-art completion is claimed by04a.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Complete appearance loader fixture | Real mesh with singleton neutral table | Real multi-slot mesh with its actual material table | Retains strict missing-slot validation after source migration |
| Malformed material records | Could load invalid scalar values into GPU data | Invalid table/factors reject before preparation; previous workbench pixels remain exact | Invalid floating-point texture values need not trigger WebGPU errors |
| Workbench material transfer | No scalar property response assertion | Roughness and metallic are changed separately through real file reloads | Neither channel may be ignored |
| Workbench uniform/faction appearance | Only existing default snapshots | Seed equality; blue mask0 equality; mask1 faction difference | Explicit identity replaces seed variation and RGB inference |
| Workbench material numbering | No equivalent-asset permutation test | Reversed table/remapped IDs must preserve exact pixels | Pins categorical GPU transport; observed red→green |
| Workbench late pose reload | Validated selection only before preparation | Selection changed during GPU admission is revalidated before replacing the crowd | Retains the active soldier and disposes the incompatible replacement; mutation red→green |
| Renderer scene script | Existing weighted bundle scenes | Also runs far-property and real GPU-admission scenes | Keeps the new material and asynchronous failure regressions in the standing renderer suite |

Source, far and raw lanes retain their detailed changed-test ledgers in their
own evidence. No simulation/balance/campaign-save behavior is changed.
