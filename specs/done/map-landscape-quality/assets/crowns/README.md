# Crown representation evidence

The intended result is a continuous, varied tree crown that keeps its coverage
at map scale and acquires leaf detail when enlarged. Broadleaf, ash, aspen,
conifer and low scrub share the production registry in both renderers.

The previous model sheet is [before.png](before.png); the deterministic
[comparison telemetry](comparison.json) measures changed pixels in the same
mixed-family camera. The current family sheets and both zoom/return GIFs live
under [the shared prop snapshots](../../../../../web/shots/models/shared/props).
The campaign regional snapshots use the same placed trees, camera and terrain
as the starting spike, so changed forests demonstrate that the new geometry
reaches a consuming world rather than only a new review route.

## Representation decision

The recursive branch generator and the unrelated ellipsoid approximation had
incompatible outlines. One lobed crown now owns both sizes: close leaves grow from
its envelope, and distant trees retain its closed volume. The generator has no
remaining consumers and is removed. Variants change lobe proportions as well as
orientation; a placed tree selects its variant from its world coordinates.

The shared physical scenery renderer chooses close detail from projected tree
height. It retains a hysteresis band, gradually admits alpha-tested detail, and
keeps the same crown underneath. The visible mesh and shadow use the same pose
and detail selection. Steady frames neither rebuild instance arrays nor upload
unchanged style attributes. Camera-driven changes reuse attribute capacity.

Filtered leaf atlas samples need RGB divided by alpha: transparent texels store
black RGB, and using filtered RGB directly paints dark outlines around every
leaf. Both material consumers now honor that atlas contract.

## Review findings

Rejected candidates included a fitted leaf-cloud envelope (smooth vertical
blobs), harmonic crowns (twisted shapes), and old detailed leaves over the new
crown (sparse protruding foliage). Fresh visual review accepted the connected
crown volume but found dark leaf outlines and detached edge-on leaf fringes.
Alpha-normalized sampling fixes the first; denser, irregularly oriented leaf detail improves
the second; coherent crown normals reduce the disconnected plate lighting. Small silhouette
flecks and weak large-scale lobes remain open after checkpoint 06B. Campaign-pitch trunks can be occluded by their own crown; lower
battle views are the direct attachment check, while the high view retains a
continuous trunk-to-crown shadow.

Checkpoint 06A is accepted for crown representation and both shown map scales.
The last unprimed review still identified small close-foliage artifacts, so final
slice acceptance remains open; this is not an artifact-free or full-slice completion claim.
The scoped 16 PNGs repeat exactly (20 capture calls including zoom returns). Hardware performance is not inferred from
SwiftShader captures or from model triangle counts.


The production battle uses the same 54 draw calls as pristine HEAD. Three shape
variants are packed into one instanced geometry per family/detail, rather than
multiplying draw calls. Shape attributes share one interleaved buffer to stay
inside the eight-vertex-buffer WebGPU limit. Shader masks are shared with the
shadow override: three.js copies `maskNode`, not `opacityNode`, into that pass.
Fully hidden detail buckets are not submitted.

Verification used `VERIFY_GPU=1` and `VERIFY_URL=http://localhost:5190`. The
focused repeat used `SNAP=landscape-,tree-,props/trees,props/conifer,props/broadleaf,props/ash,props/aspen,props/bush`
with `scene landscape-tree-lod tree-canopies shared-prop-models campaign-landscape`.
This excludes the three unchanged, proven stale non-tree baselines; it does not
change the default gate. The hardware `battle-renderer-default` flow used Chrome
on Apple Metal and retained only its pristine marker/impostor assertion failure.


## Close-foliage checkpoint

[The preceding close crown](close-before.png) is the 06A control. The current
close captures and crops use smaller leaves distributed between surface rows,
shaded with the crown normals. Fresh critique sees coherent shaded volumes and
continuous battle attachment. It still sees small detached-looking edge flecks,
rounded rather than strongly lobed crowns, and surface patches visible mainly
in crops. These are remaining work, not a clean visual acceptance claim.

Solid geometry tufts were tested and rejected: sparse placement resembled bead
rows; dense placement resembled a polygon pile and failed the existing coverage
floor. The retained candidate has 567 crown triangles and 2,647 total close
triangles per family. Draw buckets and all numeric acceptance limits are unchanged.
The GIF writer now resolves its output relative to its module, so invoking the
scene runner from the repository root also works.

Regional tree size relative to mountains remains a slice 07 placement/scale
review item. This checkpoint does not change production instance size or density.

The refinement is also checked against the current shared terrain worktree: [merged refinement evidence](integration-b/README.md).
