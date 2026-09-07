# Heavy idle/ready breathing candidate

Provisional motion-only study on the frozen carry source. A standing soldier
should remain planted while the trunk moves subtly with breathing and settling;
the side-carry and raised-guard silhouettes must remain distinct. The complete
equipped model is the review surface.

The candidate is a modest improvement over a completely static hold, not a
finished loaded stance. Across the complete sampled sequences, the chest,
shoulders and attached equipment move gently without a visible support-foot
slide, large shield sweep or loop jump. Ready remains notably upright and narrow;
convincing weight redistribution is still open. There is no new hand sculpting,
simulation change, runtime solver or production binding.

## Review films

Each loop lasts six seconds, with two breaths and slower trunk settling. The
recipe reduces ready motion relative to at-ease idle. These GIFs use the checked
frames at their authored cadence (200 ms/frame):

- [Idle three-quarter](idle-oblique.gif) and [side](idle-side.gif).
- [Ready three-quarter](ready-oblique.gif) and [side](ready-side.gif).
- Complete ordered frame sheets: [idle three-quarter](idle-oblique-all-frames.png),
  [idle side](idle-side-all-frames.png), [ready three-quarter](ready-oblique-all-frames.png),
  [ready side](ready-side-all-frames.png).

The direct review inspected every frame in those four ordered sheets, plus
whole-body crops at frames 0, 8, 16 and 24. Still sequences establish continuity
more strongly than perceived live rhythm; do not convert this candidate verdict
into final animation acceptance.

An unprimed visual reviewer found no obvious pop, floating foot or equipment
detachment. Sword fingers stay around the hilt; ready-side views retain the
shield hand/handle relationship. The reviewer independently flagged the upright,
narrow ready stance and little visible weight redistribution. Idle grip is
occluded in these views, so its visible contact is not established by this film.
CPU relative-hand checks supplement that limitation without declaring the grip
anatomy accepted. Existing geometry/material/shadow weaknesses remain outside
this motion-only study.

## Frozen controls

The donor GLB SHA-256 is
`0a7beffb16f962e9cbb2993a5a30a83dd0b0c76a2a58a6eabf78f0af6c5f31a8`.
Candidate editable Blender source SHA-256:
`077c567a66aaf10c62820e3b7437e7609caa736b924670e03e7140629b97198d`.
Candidate GLB SHA-256:
`3fc95082152b9e97562718a7e80d2182202e2da3f466b6d9196b569d18b1d0e8`.

[Source controls](source-controls.json) compare every source mesh coordinate and
all walk/run/inspection action keys exactly. All 181 frames of each hold preserve
root, pelvis and both foot matrices exactly; start/end matrices are exact, and
the hand-to-forearm relative matrix error is at float rounding scale.
[Export controls](controls.json) preserve all mesh accessor/index data, rig nodes
and walk/run/inspection GLB samples exactly.

Blender re-export changed twelve tangent scalar components by approximately
0.0001. Position, index, normal, UV and skin arrays were first proved exact;
only then were the frozen donor tangent bytes copied into the corresponding
candidate accessors for a controlled motion-only comparison. This is not a
general export fallback and must never conceal authored geometry differences.

The production workbench used its normal loader, skin/material path and daylight,
bundled headless Chromium/SwiftShader, viewport 1280×800, fixed 640×640 crop,
pitch 1.4, zoom 230, target height 0.95 and fixed phases. Four donor images and
124 candidate frames passed `snapCheck` twice, with four exact loop endpoint
checks: [260 passing capture checks](capture-checks.json).
[Matched pixel comparisons](pixel-controls.json) confirm exact donor/candidate
phase zero and changed frames elsewhere. Changes include shadows, so changed
pixel totals measure image difference rather than motion amplitude or quality.

## Authoring and handoff

The small recipe lives at
`packages/soldier-assets/bake/blender-heavy-idle.py`. Run Blender on a copy of the
frozen equipped source with `--background SOURCE.blend --python` that recipe,
then `-- --output OUTPUT_DIRECTORY`. It keys existing idle/ready actions and
reuses the existing whole-assembly exporter. It does not rebuild equipment.

Editable/exported candidates remain in the isolated authoring worktree
`/Users/david/dev/game-heavy-idle-motion/throwaway/heavy-idle/source/candidate/`.
The local capture/probe scripts and full checked frames are under that same
`throwaway/heavy-idle/` study directory. Canonical source promotion and the parent
spec handoff belong to the integration owner; this pass does not perform them.

Shape/diff/docs review retained one source authoring recipe, reused the existing
exporter, and removed a misleading endpoint comment. No runtime abstraction was
added. The installed Codex CLI could not start its independent review because it
rejects the current model version. A separate in-app reviewer found no concrete
preservation bug under the frozen source's XYZ rotations, expected action slots
and muted NLA tracks. Its wording finding was corrected: idle/ready action
metadata, interpolation and NLA duration change along with their rotation keys.

## Merged-tree check

The parent inspected all four ordered frame sheets and retained the same
provisional verdict. Running the integrated recipe on the committed combined
heavy-kit scene in isolated background Blender succeeds. Its exported rig,
all 525 animation channels (times, values and interpolation), indices and
non-tangent mesh attributes exactly match the reviewed study. Seven tangent
scalar components differ from the pinned study export in this run. Thus recipe
integration is proved, but this fresh GLB is not claimed pixel-identical and
has not replaced the combined candidate. The full merged heavy-kit scene also
passes with no page errors; that scene still uses the existing static holds.
