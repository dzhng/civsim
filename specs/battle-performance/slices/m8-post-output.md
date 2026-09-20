# M8 — post and output

Depends on M1b and M3a. Selected backend: raw WebGPU.

Promoted frame/post modules own HDR intermediate targets, bloom and final tone/output conversion. Preserve physical framebuffer, single-sample default, exposure/grade and DOM HUD ownership. Reuse shared shader math; no DPR or quality reduction.

Reuse post numerical/complete-scene controls at fixed exposure and lighting, plus resize and bloom settings. Compare final framebuffer/crops and GPU pass ranges with no overlapping-range sums. Inherited equality can close relocation; any visual or timing change needs its own matched gate.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.

M1b's frame controls retain strict image-comparison failures with and without
shadow/scenery, at1x/4x sampling. All24 pre/post-move source/raw RGBA pairs and
comparison metrics are identical, so relocation did not cause them. Diagnose these
inherited differences through M4/M8 rather than weakening the1/255 max threshold.
See assets/m1b-promotion and the fixed frame builds under throwaway/m1b-verification.

Current promoted raw post passes32 standalone numerical cases exactly; see
[focused evidence](../assets/migration-component-review/README.md). Full-scene
source/raw differences above remain open.
