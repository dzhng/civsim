# Live-body roll arithmetic — diagnostic only

A scratch Node CPU probe compared the current production LOD function with an
in-memory variant that skips corpse-roll trigonometry when the presentation
strength is zero. Facing rotation, projection, frustum tests, allocation and LOD
policy stayed unchanged. No production file was edited.

For 30,000 live mounted instances, exact deep equality passed for the complete
result. The fixture used asymmetric bounds, varying facing/death variant, one
perspective view and one orthographic shadow view. This is not the full
multiview/corpse regression sequence and does not establish general exactness.

[Raw results](live-roll-cpu-probe.json) retain four alternating-order pairs,
each with40 warmup and120 measured calls. Baseline medians were8.59,9.39,10.09,
10.57ms; candidate medians8.23,9.28,9.66,9.62ms. Candidate p95 worsened in three
of four pairs. Every checksum was3,600,000 submitted contributions.

This was Node with Jiti-transformed TypeScript, not browser production timing;
independent Blender/browser authoring was active elsewhere on the machine.
The results therefore justify neither a frame-budget claim nor a speedup.
The source-level idea removes unnecessary arithmetic for living bodies but
has not earned integration. Production retains the existing code. An isolated
browser measurement and the unchanged exact/temporal/hardware gates would be
required before pursuing it further; do not stack it with the rejected storage
change or infer that these small median differences solve the cadence failure.
