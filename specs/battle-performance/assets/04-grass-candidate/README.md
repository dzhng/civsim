# Grass candidate verification boundary

Candidate `e02bad5a` includes fixes for vgpu offset writes and publication edits arriving during asynchronous GPU admission. Both new regressions fail before their fix and pass after it; web typechecking passes.

The hardware vgpu and TypeGPU controls report no GPU/browser errors and all source/native routing counts agree. In all nine vgpu cases, both actual and reference PNGs are byte-identical to the retained pre-change controls; strict diagnostic failures and their numerical values are identical too. [Comparison](grass-baseline-comparison.json) preserves this boundary: the strict image gate remains red, not repinned.

Integration is held on a different requirement. [The interior-travel probe](grass-visible-interior-progress.log) reuses the existing deterministic scheduler and four slices per camera step, keeps twelve camera moves inside the field, and checks visible focus coverage rather than merely stored CPU records. The field stays invisible. The original route moved beyond the terrain and only asserted residency, so it did not establish useful rendered progress. Full motion/upload/frame-time verification and this coverage admission correction remain open.
