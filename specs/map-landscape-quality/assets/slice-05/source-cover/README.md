# Source mountain band in the shared material

The terrain producer's channel2 is an altitude ramp across a mountain range,
not a declaration that every pixel is bare stone. One world-space R8 texture
carries that existing signal into the shared material. Its high end adds rock
exposure; lower shelves retain the existing slope response. Applying the
exposure window after filtering keeps the response continuous across source
cells and independent of the terrain tile resolution.

The upper window begins at0.74, approximately the producer's smooth ramp at
two-thirds of its height interval. That is an aesthetic interpretation of the
existing range band. It is not new terrain, physical altitude, passability or
vegetation data. Source geometry, scenery records, cameras, palette, light,
water and battle material response are unchanged by this pass.

The first unconditional-band prototype is retained in
[the rejected first comparison](../source-cover-first/README.md). Against that
prototype, the refinement restores some green inhabited foothills while
retaining a continuous central rock mass. Fresh unprimed three-way review and
root both retain the refinement over either prior version. The close interior
still has barren gullies, cloudy rock and unnatural vegetation; patterned green
bands remain in some lower areas. This accepts a bounded source-input improvement,
not reference-quality terrain. Roads, stepped shores and ecological detail remain
under their owning slices.

## Evidence

All three actual-production views use1280×800 atDPR1, tick0, frozen camera and
natural view. Scenery records, camera and tick match the original before frames
exactly. Changed pixels against before:138990 Alps,37024 Italy,238834 close Alps.
All three refined repeats have zero differing decoded pixels and no page errors.
These material controls deliberately retain the old rock props on BOTH sides;
the separately accepted prop removal is composed only in the main worktree.
No canonical baseline changes in this pass.

A separate asymmetric six-cell GPU probe exercises the actual sampler in an
orthographic world plane. North/south/east/west and all six texel-center outputs
match expected bytes exactly, including the partial exposure174. Two interpolated
positions also match exactly (4 and0), verifying filtering BEFORE exposure.
Disposing the map drops the renderer's texture count from2 to1. Pinned Three
returns256-byte-aligned GPU readback rows; the probe honors that stride.

The resource is589×486 bytes (286254), one texture per campaign world, disposed
with it. No per-vertex arrays, tile allocation or worker messages grow. The band
copy is made before the source transfers to the worker. This avoids the rejected
per-vertex memory expansion and coarse/fine interpolation mismatch. Equivalent
world positions sample the same texture independent of triangulation.

Independent read-only review reports no source defects. Focused source/terrain
CPU tests and both frontend/lab typechecks pass in the candidate worktree;
root's merged checks are recorded in the main handoff. The scratch GPU probe is
retained as gpu-probe.ts.txt for the exact data and readback calculation.
