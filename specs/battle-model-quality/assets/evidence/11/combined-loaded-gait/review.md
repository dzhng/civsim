# Face and loaded gait composition

Current working integration, not acceptance. Source SHA-256:
`0fd7c13d78ca31ad7af973e75b50fe052d64df8bec8ac3c6373097ee4a077c90`.
This rebuild composes facial-form 7ea34c11, the motion source from b8577b62,
43cab350 belt fitting, and existing equipment/surfaces. It does not yet include
the independent footwear or garment revisions.

Blender export and `node packages/soldier-assets/bake/heavy-kit.mjs --check`
pass, as does `bun run --cwd web typecheck`. The archived capture ran with
`VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node web/scene.mjs heavy-kit`:
bundled headless Chromium, SwiftShader, existing fixed cameras and lighting.
All submitted poses and fresh byte-stable repeats pass; no page errors.
Eight unaccepted image comparisons fail. Those changes are evidence to inspect,
not a reason to bless the new images. No production catalog changes.

The full ready sheet, all four bearings of all walk/run phases, and looping
review derivatives are archived together. Root inspected ready; full motion
inspection is in progress. Fresh combined critique inspected ready and all 53
numbered phase images in all four bearings, with eight matched prior comparisons.
It rejects the unchanged carry: walk 11–17 exposes the shield-side knee through
the shield's lower-left face/rim, especially 11–14. Root confirms at native
walk-13. This is a new contact regression, not an acceptable integration defect.
The review prefers the more active run torso/gear poses, but also retains the
pre-existing armpit patches and flat-foot support concerns. Fix the shield carry
before accepting the motion composition. Separate frozen-input
[loaded gait evidence](../loaded-gait/review.md) supports the source orientation
correction, but cannot substitute for this composition review. Timed playback,
grounding between keys and full kit contact acceptance remain open.
