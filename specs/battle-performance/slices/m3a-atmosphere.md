# M3a — atmosphere and environment

Depends on M1b. Selected backend: raw WebGPU.

The promoted sky/environment/PMREM modules own their GPU lookup textures and bindings; the existing environment presets and physical parameters remain the semantic owner. Preserve initialization work versus per-frame wind/time updates, camera depth and background composition.

Reuse sky/backdrop/environment controls at fixed camera, time, weather and framebuffer. Check resource limits/disposal and inspect horizon/sky crops. Keep this separate from water changes; unchanged controls close it without another renderer rewrite.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.

Promoted raw sky/PMREM numerical controls pass all four presets under unchanged
thresholds: [evidence](../assets/migration-component-review/README.md). This does
not alone close composed horizon or initialization/update ownership checks.
