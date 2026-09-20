# Cutover readiness audit disposition

Accepted: the lab facade already implements the frontend presentation API, but
production checks still depend on source-specific diagnostics and source-text
assertions. Campaign handoff against raw and several component exits need explicit
proof. The source import flip alone would leave those checks broken or stale.
The audit identifies real source-class capture/baker/lab consumers to retain or
migrate deliberately. No production import is changed by this audit.

Root narrows the proposed diagnostics pass. Do not copy a giant Three-shaped
stats interface, synthesize unavailable counters, or use render-pass sums as full
frame time. First [M9a](../../slices/m9a-frame-timing.md) correlates complete native
GPU events with actual presented frame receipts. Use **observed submission span**
as the selected renderer's conservative GPU cost: first measured GPU beginning to
last measured end, including compute and gaps. Retain interval union separately;
never sum overlapping stages. Source's existing asynchronous render-only sum is
not relabeled or claimed equivalent. Both retain the numeric33ms floor; the raw
scene will collect distinct complete frame identities when its counters migrate.

Then expose the actual content/depth/memory diagnostics required by the standing
checks, preserving their thresholds and populations. The raw identity is
`raw-webgpu`, projection `camera3d`; identities must describe the installed frame,
not serve as substitutes for actual depth/content tests. This is not a second
production backend or compatibility facade.

The audit's absence of m2/m3/m5/m8-named artifact directories is **not proof that
no relevant evidence exists**. M1b/M6/current-camera controls cover some inherited
behavior; map those observations to each contract before deciding what new runs
are needed. No exit is silently declared from relocation alone. Contact-effect
bands belong to M7's effects owner; shadow readability judges their impact but
does not create a second implementation owner. Lab comparison unions may remain
in lab tools; they must be absent from the production facade after M9.
