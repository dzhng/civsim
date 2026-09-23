# Bounded shoreline residency

Campaign color is already packed with each vertex. The neutral mesh therefore makes separate albedo and physical-tint arrays optional; battle keeps its real overrides. Campaign uses the packed color directly, and signed shore distance lives on the mesh rather than a second tile payload field. Its GPU attribute shares the same CPU buffer.

A tile admission can change the edge blend only near the added or removed tiles. Distant presented meshes retain their arrays and revision. Nearby edge changes still rebuild and upload in the same transaction; a regression demonstrates both joining and restoring the edge.

The source-conforming overview uses32km interior cells with source-scale coast geometry. The prior24-tile set exceeds the unchanged128MiB ceiling during region changes. The selected16 nearest tiles complete Alps→Italy→distant→Alps under that ceiling, including the shore GPU attribute, upload staging and old/new revisions. Elsewhere the source-conforming overview remains visible. This is a measured detail-budget choice; whole-frame quality remains pending.

CPU checks:495 tests and typecheck pass. Independent review of the layout and admission changes found no actionable regressions. A subsequent local review added the mixed packed/override color-edge case, which passes. Browser flat shoreline controls already cover the packed layout; the final hardware traversal passes:16.67ms p95 and maximum warm admission,129,293,648B peak reservation, stable returns and DPR2 checks. This remains terrain-only evidence.

The first hardware run exposed dense-cell hit testing, which took691ms across ten admissions; index updates took14ms. Rejecting triangle XY bounds before barycentric work, without temporary arrays or another spatial index, reduced hit work to84ms and restored the timing targets. The same query tests pass. Bounds include the existing barycentric edge tolerance.

Independent bounds review compared20,000 sample/ray queries before and after the optimization and found no behavioral differences. It confirmed the XY padding covers the existing barycentric tolerance for cell-contained triangles.
