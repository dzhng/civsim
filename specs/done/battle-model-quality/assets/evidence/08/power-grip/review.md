# Local hand reconstruction — intermediate only

**Not accepted as a natural hand, completed anatomy slice, production asset, or
art budget.** This checkpoint provides a locally editable hand reconstruction
and a reproducible contact/control study. Fresh visual review rejects the
remaining stylization; the next pass must address whole-hand form coherently.

## Source and comparison

The control is `f1962716`. Only hands are reconstructed after the original body
is weighted. Local voxel union and reduction do not touch the body, head or rig.
The retained wrist loops are joined by boundary arclength; added hand vertices
interpolate and normalize the old weight field. Profile-only warping was
rejected because it retained the hoop silhouette and produced folded tips.

Final authoring source SHA256:
`56fbd1d8a1a47a59aa33d49760fcfcc0e85e42a8f68c5b5307450ad6da6239ac`.
Canonical human GLB:
`7c935e7c086a10cbf3c3b19e04d93be35fd3b2e21265036f6bbd2bd0b503bd70`.
Isolated dressed diagnostic GLB:
`6d311186258ef2b58a4aba3e38a5408e11f631d9eda8e3480efe19d00d3a05d1`.

The dressed diagnostic loads the original heavy Blender scene, reconstructs
its skin, and rejoins unchanged original equipment. Only new skin UV faces are
packed into the original skin tile using the surface author's transform. It is
**not** a substitute for the final composed heavy source rebuild. An unrelated
old torso tangent failure prevented using that old garment author for this
isolated experiment; integration must rebuild with the current garment source.
No generated heavy bundle is promoted by this checkpoint.

Matched native four-view comparisons:

- [Before sword grip](before-sword-grip.png) / [after](after-sword-grip.png).
- [Before shield grip](before-shield-grip.png) / [after](after-shield-grip.png).
- [Before empty hand](before-empty-hand.png) / [after](after-empty-hand.png).
- Final-source [whole close](after-close.png), [gameplay pitch](after-gameplay-pitch.png)
  and [ready](after-ready.png) provide scale and equipment context.

## Measured controls and limits

The [full rebuild proof](rebuild-proof.log) reports 23,245 deform vertices. Every
one reproduces the isolated reconstruction position. All 10,822 original
vertices outside the hand mask and their weights are bit-identical; 5,672 old
hand vertices are replaced. Rest matrices/hierarchy are identical. Maximum
weight-sum error is 1.64e-7. Candidate skeleton and animation files are unchanged.
The source grip tracking check stays below 0.5 micrometres over its inspection
samples. Source density remains provisional.

[Equipment controls](isolated-heavy.log) retain the original editable equipment
geometry, topology, weights and UV hashes. The [static mesh test](static-grip-fit.log)
finds no skin intersections with the actual sword grip, guard or shield grip.
Nearest sampled support on the four right-finger regions is approximately
0.46, 0.80, 0.56 and 0.21 mm from the handle. These minima establish sampled
support, not the area or pressure of a physically natural grasp.

The [posed test](posed-grip-fit.log) checks actual triangles at 930 samples:
ready 1, walk 109, run 97, bend 241, pronation 241 and bent pronation 241.
No handle/guard intersection is found. This is discrete sampled clearance,
not continuous collision proof. The [self test](self-fit.log) finds zero
nonadjacent hand triangle intersections, versus 127 pairs in the old control.
Manifold closure and absence of crossings do not establish natural anatomy.

## Production capture coverage

All captures use the production workbench, fixed 1280×800 viewport, SwiftShader,
explicit camera/pose, frozen clock, settled presentation and byte-stable repeated
tiles through the existing snapshot primitive. No baseline is accepted here.

From the worktree root, with Vite on port 5193:

```sh
VERIFY_GPU=1 VERIFY_GPU_ADAPTER=swiftshader VERIFY_URL=http://localhost:5193 SNAP='sword-grip,shield-grip' node web/scene.mjs heavy-kit
VERIFY_GPU=1 VERIFY_GPU_ADAPTER=swiftshader VERIFY_URL=http://localhost:5193 SNAP='power-grip' node web/scene.mjs human-anatomy
VERIFY_GPU=1 VERIFY_GPU_ADAPTER=swiftshader VERIFY_URL=http://localhost:5193 SNAP='heavy-kit/close,heavy-kit/gameplay-pitch,heavy-kit/ready' node web/scene.mjs heavy-kit
```

[Equipped capture](equipped-capture.log): eight tiles, 18 passing checks and two
expected unaccepted image differences. [Empty-hand capture](empty-capture.log):
four tiles, 11 passing checks and one expected image difference.
[Whole capture](whole-capture.log): 24 tiles, all 54 checks pass, including
ready-feet selected by the `ready` substring. Filtering inherits root's shared
policy; it does not claim unselected motion-frame coverage.

Straight and bent pronation supplemental sheets were also inspected through
the existing anatomy gate at phases 0, .25, .5, .75 and 1 plus their unrolled
controls. They are still-pose sequences, not timing acceptance. The final
normalized repeat differs from the preceding corrected grip images by one
pixel for sword, zero for shield and two for empty hand; final files above are
the authoritative checkpoint images.

## Independent review and next work

The configured CLI reviewer could not run because it requires a newer CLI.
Independent read-only source fallback found the retained-data/graft approach
sound within scope, while requiring actual per-digit support and explicit UV
limits. The weighted donor is asserted triangular. New weights alone are
normalized; boundary UV faces unwrap their angular seam within the tile.
A reduced sliver facet caused a tangent failure; local post-reduction surface
relaxation fixed the geometry before strict export, without changing validation.

Fresh visual review (`/root/hand_final_visual`) finds a usable coarse intermediate
and enclosing grip silhouette, **but fails the natural-hand target**:

- Broad slab-like palm and straight finger-root edge.
- Repeated rounded U-tube digits with weak knuckles and taper.
- Bulbous thumb without sufficiently visible opposition.
- Pinched wrist attachment.

The next revision must shape the palm/wrist/thumb and differentiated finger
segments together, retaining the controlled boundary, rig and actual contact.
Do not replace that task with small surface details, additional triangles, or
acceptance based only on fewer intersections. Final combined-heavy source,
material, motion, formation and art review remain integration gates.
