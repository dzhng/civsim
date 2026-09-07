# Supported ready stance candidate

Provisional authoring pass, awaiting the integration owner's fresh visual
critique. Do not treat the deterministic checks as final visual acceptance.

The prior ready pose's narrow, nearly straight-legged base did not visibly
support the large forward shield. This candidate widens and staggers the feet,
lowers the hips, softens the knees and inclines the trunk slightly forward. It
retains the existing six-second breathing loop and ordinary side-carry idle.

The author's whole-body verdict is that the candidate communicates readiness
and support more clearly than the prior pose. Every frame of both candidate
loops was inspected in order: soles remain seated, the forward shield remains
clear of the legs, the grips keep their pose relationship, and there is no
visible endpoint jump. Motion remains restrained; this improves the support
stance without claiming finished animation rhythm or accepted grip anatomy.
Both formation pitches remain readable. Existing narrow tubular limbs, simple
equipment surfaces and shadow artifacts are not resolved by this pose.

## Matched review surface

- Three-quarter films: [prior](ready-donor-ready-oblique.gif),
  [candidate](ready-candidate-ready-oblique.gif).
- Side films: [prior](ready-donor-ready-side.gif),
  [candidate](ready-candidate-ready-side.gif).
- All consecutive candidate frames: [three-quarter](ready-candidate-ready-oblique-all-frames.png),
  [side](ready-candidate-ready-side-all-frames.png); matching prior sheets:
  [three-quarter](ready-donor-ready-oblique-all-frames.png),
  [side](ready-donor-ready-side-all-frames.png).
- Whole-body two-times crops: [three-quarter](ready-oblique-body-crops.png),
  [side](ready-side-body-crops.png), at frames 0, 8, 16 and 24.
- Formation: [prior](ready-donor-formation-0.9.png),
  [candidate](ready-candidate-formation-0.9.png); gameplay pitch:
  [prior](ready-donor-formation-0.42.png),
  [candidate](ready-candidate-formation-0.42.png).

The production workbench used its normal asset loader, skin/material path and
daylight, bundled headless Chromium/SwiftShader, viewport 1280×800 and fixed
640×640 crop. Individual camera: pitch 1.4, zoom 230, target height 0.95,
three-quarter and side yaw. Formation: zoom 65, pitches 0.9 and 0.42. Each
individual film is six seconds, 31 inclusive samples; GIFs omit the duplicate
endpoint and use 200 ms/frame.

[260 passing capture checks](capture-checks.json) cover 124 matched loop frames,
four formation views, exact repeated `snapCheck` images and four exact loop
endpoints. [Pixel controls](pixel-controls.json) prove that the new stance reached
the production route; changed pixels include the shadow and are not a quality
score. The four prior loop sheets/films reproduce the already inspected idle
study's ready content on the same frozen source.

## Source controls and integration

The feet are 33 cm apart with 14.5 cm of stagger, and the pelvis is about 4.4 cm
lower. An offline two-segment construction places the ordinary bone keys. No
solver, foot target, runtime state or simulation movement is introduced.
Fixed rest-bone dimensions make repeated authoring reproducible rather than
allowing small changes from evaluated pose lengths to accumulate.

[Source controls](source-controls.json) preserve all source mesh coordinates,
idle, walk/run and inspection action keys exactly. Across all 181 samples of
ready, root/pelvis/feet are fixed, soles remain within 0.00000015 m of the floor,
and the hand-to-forearm matrix error is at float rounding scale.
[Repeated authoring](repeat-controls.json) reproduces every animation sample
exactly. [Export controls](controls.json) preserve the mesh accessors/indices,
rig nodes and all clips other than ready exactly.

The exporter changed fourteen tangent scalar components by roughly 0.0001.
After position/index/normal/UV/skin arrays were proved exact, only those frozen
donor tangent bytes were pinned in the candidate GLB for a controlled comparison.
This must not become a fallback that conceals geometry changes.

The recipe change is confined to
`packages/soldier-assets/bake/blender-heavy-idle.py`. Editable/exported candidate:
`/Users/david/dev/game-heavy-idle-motion/throwaway/heavy-ready/source/candidate/heavy-motion.blend`
and sibling `heavy-motion.glb`. SHA-256 values:

- Blend: `6817cee255d46cf982c18e6625f194b332f28d69cd6cc17c876583449d04c3de`.
- GLB: `628e7cd302864da366fd75673748fbda904c067444b29d92157c53194a068bb7`.

The frozen donor is the preceding idle candidate, GLB
`3fc95082152b9e97562718a7e80d2182202e2da3f466b6d9196b569d18b1d0e8`.
Failed additive and evaluated-length attempts remain in the local study's
source folder. The final source, local capture scripts and checked full frames
remain in that isolated study for integration. Promote only the ready action
when combining concurrent motion work, rather than overwriting a newer source.

The author completed shape/diff/docs inspection, kept the construction in the
existing authoring recipe and corrected repeated-authoring drift before capture.
Independent visual and code review are delegated back to the integration owner
to free the shared reviewer slot. The local Codex CLI still cannot start with
the configured model version. Canonical promotion and parent-spec decisions are
not part of this provisional pass.
