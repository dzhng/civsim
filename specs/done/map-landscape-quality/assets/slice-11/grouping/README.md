# Regional geographic batching

The same triangles are grouped by world region and retain actual bounds. Terrain
admissions reject nonintersecting regions before visiting their vertices; Three's
normal frustum culling rejects offscreen meshes. Geometry and material meaning
stay with the existing owners. One shared material serves all regions.

The first grouping changed transparent ordering through new batch centers.
Explicit ordering keeps borders beneath roads and sea lanes independently of
batch size. Final comparison changes66Italy and33Alpine pixels; fresh unprimed
review finds both pairs visually indistinguishable. These small crossing changes
are an intentional ordering correction, not a visual-quality claim.

The real Italy update visits6099of2486148vertices; Alps94011. Both retain the same
sampled counts and exact replacement image as before grouping. The local CPU test
pins that a distant region is neither visited nor uploaded. Resource stats report
owned CPU/GPU geographic buffers separately from terrain and caller-owned inputs.

A hardware180-frame traversal measured16.67ms p95 and33.33ms maximum admission
frame across11admissions; the scene submitted152total draw calls with735 geographic
regions available for frustum culling.
The attached profile is a focused warm regional probe, not full game/UI acceptance
or a cold-load benchmark. Input geometry remains resident; full geographic fog,
UI/scenery and lifecycle integration still need their remaining gates.

Test change: the geographic scene's bounded-work check now requires visited
vertices (rather than only sampled vertices) to be less than the total. This pins
the eliminated global scan. The two baselines change only at the reviewed sparse
crossing pixels; all contact/clipping coverage remains. The final strict repeat passes both regional snapshots plus unchanged composition
and DPR1/DPR2 tile-anchor controls. All501CPU tests and typecheck pass; independent
code review found no actionable regression. This accepts regional batching and
contact preservation, not full11/game acceptance.
