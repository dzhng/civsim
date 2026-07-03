# Slice 05 — Selection: green rings under every soldier

**Contract:** selected own units show a campaign-green (0.31,0.82,0.39) ring
under EACH soldier (radius ~0.45m, pushRing into groundCues at
scene.ts:1070-1075 site, iterating soldiers of selected units via
positions_ptr + soldier_unit_ptr). Replace the two gold unit-center rings.
Flag glow (.sel) stays. Ring count is bounded by selection (<=240*n) — check
the line buffer capacity (overlays.ts) and frame cost at max selection.

**Verify:** battle scene shot with a selected unit (rings visible at tactical
and close zoom); performance sanity (no fps cliff selecting all);
screenshot-critique.
