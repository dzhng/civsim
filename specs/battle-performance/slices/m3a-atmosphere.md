# M3a — atmosphere and environment

Depends on M1b. Selected backend: raw WebGPU.

The promoted sky/environment/PMREM modules own their GPU lookup textures and bindings; the existing environment presets and physical parameters remain the semantic owner. Preserve initialization work versus per-frame wind/time updates, camera depth and background composition.

Reuse sky/backdrop/environment controls at fixed camera, time, weather and framebuffer. Check resource limits/disposal and inspect horizon/sky crops. Keep this separate from water changes; unchanged controls close it without another renderer rewrite.

Use the shared snapCheck path for visual evidence; inspect actual frames, compare
matched crops and run unprimed screenshot-critique before accepting visual change.
Preserve current thresholds and carry inherited failures explicitly.

Promoted raw sky/PMREM numerical controls pass all four presets under unchanged
thresholds: [evidence](../assets/migration-component-review/README.md). This does
not alone close composed horizon checks.

Initialization/update ownership is now traced in the promoted implementation:
`world/environment.ts` creates sky, PMREM and DFG once during scene construction;
its live `setView` writes only the retained view/observer uniform. Sky LUT and
PMREM rendering submit only inside their constructors, whose returned objects
expose no regeneration operation. Scene prepare updates wind/view inputs without
reconstructing this environment owner. Disposal owns the lookup resources.

The existing [snapshot ABBA reports](../assets/07-snapshot-copy/README.md) provide
real camera-motion corroboration: every arm starts and ends with164 total textures
created/live and the same requested texture bytes. Buffer creation grows by two,
so this is specifically unchanged texture allocation, not a zero-allocation claim.
Source tracing establishes no repeated lookup rendering; allocation counts alone
would not rule out rewriting an existing texture. Combined with the retained
numerical/disposal controls, this closes the initialization/update ownership
obligation. Composed horizon/sky readability remains open.
