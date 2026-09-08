# Sleeve-cap refit: rejected redistribution, body support unresolved

No refit is retained. A local weight redistribution reduces the visible cap's
numerical collapse but shifts armhole clearance failures and introduces a floor
intersection. The subsequent body-only audit finds self-crossing shoulder skin;
fitting cloth over that surface would conceal an unresolved anatomy defect.
There was no GPU capture, lighting change, animation weakening or promotion.

## Frozen experiment

AR uses a copy of the saved fitted AQ source. Its existing smooth
clavicle/upper-arm weight transition runs between the authored inner and outer
cap-ring centers, coherently on both sleeves. No anatomy or equipment builder
was invoked. Rest positions/topology, UVs, material assignments, object matrices,
rig and all13 action key streams remain exact. Only local garment weights change.

The [source controls](ar-controls.json) record1,413 changed tunic vertices and
2,309 changed mail vertices, propagated to3,722 runtime-copy vertices. Saved
lining topology/weights match by index. Replaying the existing shoulder-layer
barycentric transfer reproduces its old weights within2.98e-8 before applying
changes. Runtime correspondence uses exact saved positions and old named weights,
rejecting ambiguity or missing matches. All changed weights are normalized with
at most four influences; unrelated object weights remain unchanged.

The [fresh export controls](ar-glb-controls.json) preserve all13 animation
streams, positions, normals, indices, UVs, materials, textures and images.
Garment joint/weight arrays differ deliberately; natural exporter tangents also
differ in three primitives. No tangent pinning or baseline update was performed.

Frozen source hashes:

| Source | Blend SHA256 | GLB SHA256 |
| --- | --- | --- |
|AQ|cbdeb8d6879c0607aaf173df4ba524a249ed427ed3e371651a2003a27e035300|58459897ede1693943020724cd35130368c51ddd9d5c5884795b9e15fcc28629|
|AR|3eea403960369220ac5cb1c8df4041495ccaad92d9407779d68ea1c594cef0e1|7d2ed3d11cc67f3ac9f570cb4a1d251d9525013f06b8d11a2c6be7a867588f56|

Rejected editable sources and experiment recipes remain isolated under
`/Users/david/dev/game-heavy-death-grounded/throwaway/heavy-death/ar/`.
No failed source or implementation patch belongs to the retained candidate.

## Why AR fails

The same1,333 proximal right-cap vertices and2,414 triangles are compared:

| Fall frame | Minimum edge/rest AQ→AR | Minimum area/rest AQ→AR |
| --- | --- | --- |
|33|0.0969→0.3207|0.0404→0.1155|
|42|0.0915→0.2842|0.0552→0.1411|

Those improvements do not establish a good shoulder. The
[scoped garment/body audit](ar-clearance.json) finds newly qualifying vertices
near the clavicle/armhole, all with changed weights. At33, right-tunic vertex1820
qualifies at53.74mm nearest-surface distance and left-mail vertex3620 at35.23mm.
Qualification requires a signed-nearest projection below-3mm and two independent
ray-parity inside checks. Absence from AQ's list does not prove prior exterior
placement: a point may have been shallowly inside or failed another filter.
Right-mail qualifying counts at33 change233→248; left252→320. At42 right
improves203→183 but left worsens304→334. These thresholded counts are not
exhaustive intersections or a visual verdict.

Matching outer-lining signed normal separations remain negative in both sources;
the right minimum at42 changes-5.16→-5.98mm. This is a folding/normal diagnostic,
not a complete triangle-intersection test.

The [imported packed-pose audit](ar-imported-path.json) samples169 quarter-frame
times and finds a new mail-floor dip of-0.548mm at37.5, primitive7 vertex1807,
dominant upper-arm.L. AQ's corresponding path was nonnegative. No penetration
waiver or compensating body lift is applied. These clear CPU failures suffice
to reject AR without spending a GPU gate on acceptance.

## Underlying body must be resolved before fitting

The [body audit](body-shoulder.json) keeps the same spatially bounded shoulder
patches across relaxed carry, ready, bend, pronation, sword effort, hit and late
fall. Right shoulder triangles opposing the transported rest normal increase
from1 in ready to77 at42; this proxy alone is not an anatomical verdict.

An independent [triangle-crossing check](body-crossings.json) corroborates actual
folding: evaluate the saved body under the action, build its triangle BVH and
exclude every pair sharing a vertex. Count crossings involving the same shoulder
patches; no cloth, props or renderer post-transform participates.

| Pose | Left nonadjacent crossing pairs | Right pairs |
| --- | --- | --- |
|Bind/bend0|0|0|
|Ready0|0|12|
|Fall33|41|66|
|Fall42|40|81|

Crossed counterpart faces belong locally to upper arm, clavicle and chest, not
distant equipment. Thus this body is not a sound support surface for the next
cap-fitting experiment. No body/rest/weight edit followed this finding. The
existing anatomy owner's provisional heat-weighted shoulder needs a bounded
diagnosis before a garment is fitted over it; no new bones or deformation system
is implied. Some crossings predate the fall, so this is exposed provisional
anatomy, not proof that AR changed body skinning.

The cap/armhole pass remains open. Preserve all action keys and unrelated
geometry; do not weaken the fall to hide skinning. Any retained geometry/weight
refit still requires both-shoulder extremes, dense clearance, paired production
views with fresh critique, and full re-review of all old clips. Identical keys
cannot prove unchanged posed surfaces.

## Evidence review

Independent read-only review found one overclaim: absence from the thresholded
AQ inside list cannot establish that a vertex was previously outside. The
language above now states the actual filter and qualifying counts. Numerical
values and hashes checked out; the floor failure remains independent of that
wording correction. No numerical or visual acceptance is implied. The
[review response](independent-review.txt) is preserved. Shape/diff review retains
only this evidence leaf; rejected source edits and probes remain scratch. Root
owns the slice/README link and banked scope decisions; no new production API,
test behavior or animation contract was introduced.
