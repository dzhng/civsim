# 04a integration — explicit scalar surfaces

This checkpoint verifies authored scalar material transfer, not final soldier art.
GPU-error admission and controlled far-highlight classification remain open04a
integration gates; the README owns the current pickup point.
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

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| Complete appearance loader fixture | Real mesh with singleton neutral table | Real multi-slot mesh with its actual material table | Retains strict missing-slot validation after source migration |
| Workbench material transfer | No scalar property response assertion | Roughness and metallic are changed separately through real file reloads | Neither channel may be ignored |
| Workbench uniform/faction appearance | Only existing default snapshots | Seed equality; blue mask0 equality; mask1 faction difference | Explicit identity replaces seed variation and RGB inference |
| Workbench material numbering | No equivalent-asset permutation test | Reversed table/remapped IDs must preserve exact pixels | Pins categorical GPU transport; observed red→green |
| Renderer scene script | Existing weighted bundle scenes | Also runs far-property scene | Keeps the new per-pixel normal/material regression in the standing renderer suite |

Source, far and raw lanes retain their detailed changed-test ledgers in their
own evidence. No simulation/balance/campaign-save behavior is changed.
