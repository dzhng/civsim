# Integrated head-volume working checkpoint

Retain the candidate as a modest improvement, not accepted natural anatomy. The
target is an adult head with connected cranial, cheek, muzzle and jaw volumes,
and an eye surface seated within a readable socket. The supplied Rome II image
guides the natural proportions; it is not a pixel baseline.

[Comparison](comparison-2x.png): A/top is the fresh unchanged control; B/bottom
is the final candidate. Four 260×270 crops at tile offset (180,165) are enlarged
2× without filtering. The complete [neutral head](head-detail.png),
[bent head](bent-head-detail.png), [whole body](close.png) and
[gameplay pitch](gameplay-pitch.png) preserve the existing fixture framing.

## Controlled source and capture

Source base is `b6d6b30c`. The authoring change is confined to `facial_form` in
`packages/soldier-assets/bake/blender-human-anatomy.py`. The final editable deform
mesh owns the head envelope after the original weight solution. It resamples the
whole head, rounds/shortens the upper vault, widens the lower jaw and shapes the
face as one depth surface. The construction sculpt, body, rig and inspection
motion remain the same. Eye surfaces use the existing neutral clay material;
there is no new material, runtime mechanism, facial animation or catalog promotion.

Final capture is **33254**, with the same original `human-anatomy` scene used for
the fresh [before run](before/capture.json). Command:
`VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5197 SCENARIO_REPORT_JSON=../specs/battle-model-quality/assets/evidence/08/head-volumes/capture.json node web/scene.mjs human-anatomy`.
Bundled headless Chromium/SwiftShader, DPR1, 1280×800 viewport, fixed 640×640
tiles, production daylight/materials, original cameras and frozen named clips.

Before GLB SHA256:
`799fda6fc2f597178efc611d3bad52f5e0922fc5899b65bf09c463a6ebdd2f8a`.
Final GLB SHA256:
`9da6fbdc468f7bbe505402f3d94e140cc3d7ddcaf4839137f6020a7e0e613c5e`.

The [capture report](capture.json) has 139 passing checks and five expected
comparisons against the old unaccepted local images. Every newly rendered frozen
crop repeats exactly, class selection and production submission pass, and there
are no page errors. No baseline was blessed as accepted anatomy. The five changed
sheets include a small change in the bent-pronation detail; the hand and straight
pronation comparisons remain exact.

[Raw RGBA comparison](pixel-comparison.json) finds 125,551 changed pixels in the
neutral head sheet and zero in [hand detail](hand-detail.png). These numbers
establish a real change, not visual quality. The [source comparison](source-control.json)
confirms all 9,772 vertices at or below z1.55 have identical positions, normals and
weights; all 10,254 original pre-refinement vertex weight assignments match.
Bone rest matrices and all inspection action curves match. Exported animation,
skeleton, materials and appearance manifest are byte-identical. The manifold
inspection mesh grows from 26,120 to 32,984 triangles; this is not an admitted 07
budget. Original four-influence/normalized-weight and rigid grip tracking checks
pass in the [Blender build](blender-build.log). The candidate bake and `--check`
pass; `bun run --cwd web typecheck` passes. No test assertions changed.

## Visual and source review

The [rejected eye-relief trial](rejected-eye-relief.png) was preferred less than
the control by a fresh reviewer: prominent eye rims, isolated under-eye bulges,
a separate-looking muzzle and a flattened crown outweighed its clearer details.
Those findings drove deeper eye placement, thinner asymmetric lids, broader and
shallower cheek/muzzle transitions, and a separate upper-skull proportion pass.
This rejected comparison is not the final source or capture.

The final unprimed reviewer prefers B with moderate confidence (about 75%): its
shorter forehead, clearer chin and less continuously convex lower face read as
a more plausible adult head at native detail scale, not merely in the enlargement.
Main inspection agrees with that limited retention verdict.

Both remain below the natural-head target. The final reviewer still finds a
boxlike upper skull, weak temple/cheekbone structure, beadlike eyes in round
depressions without convincing lid wrap, a wedge-like nose, stacked lip ridges,
soft jaw turn, flat ear bumps and a cylindrical neck. A small pinched/notched
rear skull-to-neck junction remains visible in the crop and bent detail. The
bent pose shows no major facial collapse, but does not establish anatomical
acceptance. Gameplay pitch is too small to judge fine facial anatomy; whole-body
close framing shows only a modest improvement. These remain open 08 work, including
the rear-neck junction; they must not be hidden by equipment.

The independent source reviewer found an initial abrupt jaw expansion at the
neck boundary. The final source fades that expansion and the head projection
smoothly; its last review is clean and confirms vertical ordering survives the
upper-head shortening. Shape review retained the existing single authoring owner;
the settled diff adds no alternate runtime path or new dependency. Documentation
continues through the anatomy slice to the source ownership note and this report.
The required CLI review failed once because the configured model requires a newer
CLI ([log](codex-review.log)); the independent read-only source review is the
available second opinion, not a claimed CLI pass.

Choice audit: topology and sculpting are explicitly delegated by 08. This pass
keeps the already banked post-weight head authoring owner and frozen materials;
it adds no new architectural decision. The continuous clay eye surface is an
inspection shape, not a decision about final eye materials. No new choices ledger
entry is needed. The provisional topology and visual retention remain reversible.

Heavy equipment must be rebuilt/refitted against this changed head before helmet
and facial clearance are judged. Preserve the newer equipment/motion sources when
integrating; do not overwrite a combined heavy bundle with a frozen lane artifact.
Neither 07 nor 08 is complete, and the production appearance catalog is unchanged.
