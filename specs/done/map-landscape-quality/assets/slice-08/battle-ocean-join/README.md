# Joined battle ocean boundary

Accepted for the wet field/ocean join in mapC. The ocean previously overlapped
stationary ground by24m and applied full swell in that overlap; opaque triangles
crossed the field and exposed a sand/cyan material cut. It now begins at the actual
outer ground vertices, retains their heights and water coverage, and gains swell
smoothly offshore. Near-edge shading consumes the same field-water response as
ground. The source spectrum, physical terrain and passability are unchanged.

The current mapC edge has201 rows, all water coverage1. Both east/west synthetic
nonflat wet edges preserve every knot and coverage value, no overlap, valid
indices and winding. This does not establish full dry-turf matching on a mixed
edge; generated maps use the existing vista owner, not this ocean boundary.

The matched native full frame changes512,423 pixels (RGB MAE21.3824); rows550–799
remain exactly unchanged. The candidate repeats exactly, including after extracting
the common field-water response. Standalone lake crops also remain exact against
the accepted distance correction. Field-only lake/dry phase controls repeat exactly.

Fresh review accepts the removed angular seam; it notes flat middle-distance
water and the existing soft coastal fringe. All16 motion frames were inspected:
no holes or abrupt changes appeared. Independent ocean-interior motion passes;
phase return is exact. Native whole-crop mean luma delta0.2043/max0.206; software
mean0.2032/max0.206. The GIF is a replay, not a seamlessly periodic wave loop.

The actual west-facing camera uses camYaw0,zoom7.8. Old yaw/pitch overrides did
not move the production camera; the old crop mostly filmed field water. The new
1280×500 film covers ocean and join. Two lake crops now project installed elevation
and use a detached live tint mask. All six migrated software snapshots repeat
with0 changed pixels, all scene gates pass, and there are no page errors.

Field-water normals now use the existing shared wave field at restrained strength;
stronger normals and patch modulation were rejected. This accepts modest surface
readability and continuity, not all water art. A single backend function owns
field depth/foam/linear albedo/roughness/detail response. No new render pass,
texture, palette or external dependency was added.

Preserving all edge knots raises the ocean from387,200 to564,080 triangles,
adding3,540,816 geometry bytes while retaining one draw and four buffers.
Common hardware-budget acceptance remains in15. Geometry is prepared once,
not rebuilt per phase. This bounded cost buys a continuous sampled edge.

Refactor review removed duplicated field shading; Codex review found no actionable
regressions. Focused tests/typecheck pass. The review GIF opts into RGB888 palette
sampling because RGB444 erased subtle water motion; defaults remain byte-identical
on a deterministic full-range control. See [test changes](changes.md).
