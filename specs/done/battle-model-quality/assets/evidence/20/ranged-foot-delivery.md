# Fitted ranged infantry and crew delivery

The local Blender composition supplies a hooded archer with bow/string/held
arrow, a leather skirmisher with small shield/javelin, and a capped crewman
with a two-handed rammer. They retain the fitted human actions and have real
release/recovery actions plus clip-owned melee sidearms. Saved editable sources
live in the foot-roster source directory; the ranged authoring script owns
their repeatable composition. No external model service was used.

## Verified boundary

The exported-source test checks sword visibility through every action and
held-arrow/javelin/tool visibility at release and recovery. It passed on all
three final GLBs. The final browser scene captures six poses from four bearings
for each class through the production weighted model path. The normal repeat
passed all three sheets at zero differing pixels, with no page errors.
The web test suite (383 tests) and typecheck passed during this delivery.

`node packages/soldier-assets/bake/ranged-foot.test.mjs` takes the three saved
source GLBs in archer/skirmisher/crew order. The browser gate is
`VERIFY_GPU=1 node web/scene.mjs blender-ranged-foot --full`, pointed at the
running worktree server through `VERIFY_URL`.

The independent code review found no remaining confirmed functional defect.
Root inspected all final sheets. The fresh visual review did **not** judge
motion polish finished: bow release and rammer movement are weak, the throwing
follow-through is restrained, and retained bow placement crowds melee. These
are recorded in the follow-up ledger under the user's explicit completion-first
quality acceptance. This is not a claim that the reviewer approved those poses.
Source motion and exported visibility controls prove the actions exist; their
readability remains a refinement target.

## Remaining integration

These manual catalogs still have null gameplay presentation and repeated near
tiers. They are not yet production admission. Genuine reduced exports separately
passed exact rig/action/material and valid-skin checks: archer 94036→4021→1313,
skirmisher 94612→4036→1334, crew 97116→4006→1276 triangles. The production
catalog pass must consume those tiers and actual engine-role bindings.

## Review and test behavior

Shape review reused shared fitted-part composition, held-equipment authoring,
and export ownership; no runtime controller or duplicate renderer was added.
The new source visibility test and scene add coverage; existing test semantics
and baseline tolerances are unchanged. Initial unaccepted four-row sheets were
replaced by the six-row evidence only after direct inspection; their dimension
mismatch report remains archived. Final source code, review outputs and reports
are linked by this evidence directory rather than copied into the global handoff.
