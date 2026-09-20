# Derive impostor view records on the GPU

The CPU currently rotates anchors, chooses a baked atlas view and applies a
screen-size floor for every impostor on every update. Move that derivation into
the existing raw vertex path. Keep six dynamic source values and per-layer camera,
atlas and direction-table data; retain bounded staging capacity and upload state
on every real submission. Camera-only updates write view uniforms, not per-man
records. This reduces live work without depending on a paused simulation.

The mesh/shadow audience, animation authority, geometry/material assets and
framebuffer remain unchanged. CPU packImpostors stays an independent oracle and
an actual comparison-backend consumer; it is unreachable from the new raw layer.
One layer owns its buffers, atlas metadata, direction data, updates and disposal.
No additional normal-frame pass or GPU readback belongs in this first step.

Before changing code, verify the actual atlas direction tables and f32 duplicate
behavior. GPU floating-point tile selection can differ at discrete boundaries;
report dense-sweep differences and margins rather than assuming adjacent views
are interchangeable. Preserve the existing exact image/coverage gates. A
near-tie classification alone does not authorize a different image. Diagnostic
GPU record readback must exercise the real derivation and remain outside normal
frames. Exercise camera boundary reversals, below-horizon views, zero distance,
elevation, corpse fade, empty populations, growth and reload/disposal.

The work proof is half as many state bytes, no per-man camera-only uploads and
stable staging within capacity. Root then compares CPU/cadence and GPU cost using
fixed builds, including advancing simulation. Keep the existing10% wide/moving
CPU screen, ordering and no cadence regression. A measured GPU increase may be
acceptable when end-to-end frame time improves; transferring work is the point,
not keeping every subsystem's cost unchanged. Final live performance and the
net-shadow requirement still govern release. No smaller paused-only success
substitutes for them. The candidate is not adopted until measured.
