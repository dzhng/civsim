# M8 — post and output

Depends on M1b and M3a. Selected backend: raw WebGPU.

Promoted frame/post modules own HDR intermediate targets, bloom and final tone/output conversion. Preserve physical framebuffer, single-sample default, exposure/grade and DOM HUD ownership. Reuse shared shader math; no DPR or quality reduction.

Reuse post numerical/complete-scene controls at fixed exposure and lighting, plus resize and bloom settings. Compare final framebuffer/crops and GPU pass ranges with no overlapping-range sums. Inherited equality can close relocation; any visual or timing change needs its own matched gate.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.
