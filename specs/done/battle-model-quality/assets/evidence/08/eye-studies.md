# Eye studies — rejected

Target: natural adult eyes integrated into the surrounding face, without a
startled or doll-like expression. All trials use the unchanged production
environment and human-anatomy fixture; head-detail supplements whole-body views.

The volume and lid-relief studies left weak, shallow markings. Separate eye
spheres made the feature visible but introduced round protruding beads. The
retained rounded-lip source is less wrong; none of these trials is accepted.

The sphere trial used two locally authored 12mm-radius meshes, 16 segments and
8 rings, at Blender coordinates (±.032, -.060, 1.678) metres. They were joined
after body reduction, before the existing UV/heat-weight/export path. This
produced 9,448 provisional triangles. Their exposed circular outline lacks the
recessed placement and eyelid coverage needed for a credible eye.

Evidence: [volume](eye-volume-head-detail.png), [lid relief](eye-lids-head-detail.png),
[spheres](eye-spheres-head-detail.png), [sphere detail crops](eye-spheres-face-crops.png),
[whole body](eye-spheres-close.png), [gameplay pitch](eye-spheres-gameplay-pitch.png).
Exact GLBs and capture reports use the same filename prefixes; hashes are in
`artifact-hashes.json`. The sphere comparison changes 1,341 of 1,638,400 pixels
against `lip-rounded-head-detail.png`: real but localized movement, not a quality
score. Camera, lighting and pose are unchanged.

Each capture reports 45 passing checks and three failing unaccepted snapshots:
close, gameplay-pitch and head-detail. Normalized weights, real production pose
submission, shared class selection, fresh-frame determinism and no page errors
pass. The Blender manifold/weight checks also pass. These results establish
transport correctness, not visual acceptance; no snapshots were blessed.

Fresh unprimed review compared neutral A/B images and 2× nearest-neighbor crops:
A (rounded lips without spheres) is less wrong, high confidence. B's circular
eyes look attached to the face, especially front/three-quarter. Both retain weak
mouth definition, a planar nose and indistinct ears. Root inspection agrees.
Recessed eyes with shaped upper/lower lids remain open anatomy work.

The rejected source edits were removed and the retained source rebuilt in a
clean background Blender process. Its GLB and all derived candidate files are
byte-identical to the committed rounded-lip artifacts; the exact bake check
passes. The rebuilt editable blend differs in bytes, but no authored source
edits remain; hidden-scene byte identity is not claimed. No production catalog,
runtime code or tests changed.

Commands: Blender background/factory-startup runs
`packages/soldier-assets/bake/blender-human-anatomy.py`; then
`node packages/soldier-assets/bake/human-anatomy.mjs` and
`VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5174 node web/scene.mjs human-anatomy`.
Restoration additionally runs the baker with `--check`.

Review: no rejected geometry remains in the source; no new runtime ownership or
schema was introduced. This is rejected-study evidence, not an anatomy finish.
The independent priority audit separates reversible gear fitting from anatomy
acceptance, so facial iteration does not indefinitely postpone recognizable
first-pair soldier evidence. Unclothed anatomy remains its own open gate.
