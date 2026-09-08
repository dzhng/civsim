# Power-grip closure — intermediate only

Fresh review finds a substantial improvement in grasp closure, not a finished
natural hand. The anatomy slice, whole-heavy art, production tiers and animation
acceptance remain open. Compare against the [preceding intermediate](../power-grip/review.md),
not against an accepted baseline.

The local hand shape now combines a cupped palm with thenar/ulnar support,
closer finger bends, differentiated distal returns and an opposing thumb.
Exterior finger centerlines from the authored knuckle sections measure about
92/97/95/75 mm. These are mesh authoring measurements, not bone lengths or a
claim of anatomical validation. Fully closing every fingertip against the palm
had required overlong near-uniform fingers; closure alone is not the target.

## Provenance and preserved controls

Final Python source SHA256:
`0958a94cc79ec1eb208dc810b3793cd1cb65c83afe75b5a1830ec622843e65f7`.
Final human GLB:
`33753b624d76aa07298f72d95af010b50949739ec7a3f9ca2a427a31b53ee91d`.
Isolated dressed diagnostic GLB:
`d112f1f0632eabddd744152e852d9efb70dcb31984567c0a129b0163065618c0`.
The final source cleanup changed comments only, not the captured geometry.

Use the original Blender invocation, without a thread override:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python packages/soldier-assets/bake/blender-human-anatomy.py
```

Explicit `-t 4` changed both upstream body topology and local hand reduction.
Those diagnostic outputs are not promoted. With the original default-thread
invocation, the [full rebuild comparison](final-default-proof.log) proves all
24,665 positions and weights match the isolated canonical hand edit. All 10,822
retained original vertices outside the hand mask preserve their positions and
weights exactly. Rig rest matrices/hierarchy, skeleton and animation remain
unchanged. Maximum weight-sum error is 1.64e-7.

The [local authoring record](hand-trial3-default.log) includes measured finger
paths and sub-micrometre grip tracking. The [dressed control](heavy-trial3-default.log)
retains the original equipment geometry, topology, UVs and weights. This dressed
asset is an isolated fitting diagnostic, not the final composed heavy rebuild;
no generated heavy asset is committed. Integration must retain the independently
owned exporter basis correction and regenerate with the current gear sources.

[Static actual-mesh fit](grip-trial3-default.log) finds no sword-grip, sword-guard
or shield-grip triangle intersections. Nearest sampled support in the four
right-finger regions is about .99/.96/.98/1.00 mm. These minima do not establish
contact area or pressure. [Posed actual-mesh fit](posed-trial3-default.log) finds
no crossings at 930 samples: ready 1, walk 109, run 97, bend 241, pronation 241
and bent pronation 241. This is discrete coverage, not continuous collision or
motion-timing proof. [Hand self-fit](self-trial3-default.log) finds no nonadjacent
triangle intersections.

## Native evidence

Final [sword](sword-grip.png), [shield](shield-grip.png) and [empty hand](empty-hand.png)
are matched native four-view sheets. [Close](close.png), [gameplay pitch](gameplay-pitch.png)
and [ready](ready.png) retain whole-body/equipment context. The dressed context
uses the frozen original gear, not the concurrent garment/helmet composition.

The clean serialized capture uses the production workbench at 1280×800,
SwiftShader, frozen pose/time and newly rendered byte-stable repeated tiles:

```sh
VERIFY_GPU=1 VERIFY_GPU_ADAPTER=swiftshader VERIFY_URL=http://localhost:5193 SNAP='sword-grip,shield-grip,heavy-kit/close,heavy-kit/gameplay-pitch,heavy-kit/ready' node web/scene.mjs heavy-kit
VERIFY_GPU=1 VERIFY_GPU_ADAPTER=swiftshader VERIFY_URL=http://localhost:5193 SNAP='power-grip' node web/scene.mjs human-anatomy
```

Coverage is 32 heavy tiles and four empty-hand tiles; the `ready` substring also
selects ready-feet. Unselected motion/formation frames are not claimed. Expected
snapshot differences are unaccepted image changes, not baseline blessings.
An earlier possible concurrent capture was treated as diagnostic only; the
final serialized repeat supplies verification provenance. No performance claim
is made.

The [heavy log](serialized-trial3-heavy-capture.log) and
[empty-hand log](serialized-trial3-empty-capture.log) record the clean repeat.
Its three final grip PNGs are byte-identical to the images inspected in the
fresh final-output review; all whole-context comparisons report zero changed
pixels.

## Review verdict and remaining work

Independent source review found no actionable geometry/frame/graft defect.
The CLI reviewer was unavailable because its configured model requires a newer
CLI, so read-only independent source review was used. Main review retained one
local authoring owner and clarified comments to describe geometry rather than
claim successful anatomy.

Fresh visual review inspected six matched sheets and all 24 enlarged crops.
Its final-output follow-up inspected all six sheets, ten unobscured current
crops and all close/gameplay/ready views. It finds B less wrong and substantially
more securely enclosing, with no new separation, exploded finger or dangling
gear. It still rejects natural-hand completion:

- Stacked tubular fingers with weak joint/pad differentiation.
- Broad swollen dorsum and insufficient individual finger-root structure.
- Crowded, bulbous thumb tip, sometimes reading partly fused with the fingers.
- Angular palm trough and thumb-base ridge rather than fleshy transitions.

The next anatomy decision concerns these masses and transitions together, not
decorative knuckle detail or more iterations justified only by clean clearance.
