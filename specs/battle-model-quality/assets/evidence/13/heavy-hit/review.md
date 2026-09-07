# Restrained heavy hit study

Provisional retention only. The genuine nonlethal reaction is more connected
than the rejected rigid-rocking control, but its mild response can still read
as a controlled crouch or guard adjustment. This is not final hit readability,
timing, hidden clearance, incoming/outgoing blending, or live-admission approval.
The detailed appearance remains manual-only with `presentation: null`.

The engine observes health loss; this authoring adds no stun state, damage
timing, impact direction, world-root displacement, step, or opponent choreography.
The 0.6-second art cadence is provisional. The existing complete diagnostic
timeline fixture already covers observed injury, repeated interruption and
recovery to current action; it is not a substitute for future detailed blending.

## Source and controls

The saved fitted ten-action source at base `6d060925` owns the geometry. The
[hit recipe](../../../../../../packages/soldier-assets/bake/blender-heavy-hit.py)
appends only `hit`, using the same ready-action lifecycle as the attack lane.
It does not call the full motion rebuild. Matching authored Blend and fresh
GLB are retained in the canonical candidate source folder on this isolated
branch; production selection is unchanged. Selective attack/hit composition
must preserve these donor actions rather than rebuild against another kit.

[Editable controls](b-controls.json) establish exact preservation of all 37
meshes, rig and ten prior action keys/handles. The supported feet have at most
0.285 mm interpolation drift, and the sampled sole minimum is -0.286 mm; these
are measured subframe residuals, not a mathematically exact footplant claim.
[Export controls](b-glb-controls.json) establish exact prior animation channels,
idempotent reauthoring of all eleven actions, unchanged geometry attributes except
four freshly exported tangent primitives, and unchanged materials/textures/image
bytes. Tangents were not pinned. Existing unrelated screenshot equivalence is
not inferred from those CPU controls; final selective integration owns its gate.

## Visual evidence

[A/B peak comparison](ab-compression.png) and the rejected [A](a/) preserve the
less expressive control. [Fresh A/B critique](ab-critique-final.txt) favors B
with moderate confidence: clearer pelvis/knee loading, but a lower shield and
sword hand closer to the thigh. The [full sequence critique](film-critique-final.txt)
provisionally keeps the restrained reaction and explicitly inspected stills only.

The existing heavy-kit sheet owner captured ready, all nineteen authored samples
at 30 Hz, and ready again from side and opposing oblique: 42 poses. The
[capture](b-film.txt) and [exact repeat](b-film-repeat.txt) each passed 87 checks,
including zero changed pixels. The gated [whole sheet](../../../../../../web/shots/models/shared/soldiers/heavy-kit/hit-motion.png)
is the chronological source for the derivatives. Ready/hit endpoint body crops
match exactly. All 42 poses were inspected in order: loading builds in frames
2–8, recovery in 9–13, a small rebound then return to ready; no conspicuous joint
inversion, foot jump, or equipment detachment was seen. Hidden grip surfaces and
projected blade overlaps do not prove collision-free motion.

[Side MP4](b/hit-side-30fps.mp4) and [oblique MP4](b/hit-oblique-30fps.mp4) are
verified 30/1 fps, 30 frames, 1.000000 seconds: 0.2 s ready lead, 0.6 s reaction,
0.2 s ready tail. They are derived from exact gated samples, not live simulation
playback. The accompanying GIFs are player-variable review aids: their 10 ms
delays may be clamped. No real-time playback verdict is claimed from stills.

Preview was open from 21:28:04 to 21:33:19 UTC on 2026-09-07. No user response
arrived; it was closed before unattended continuation. Parent review authorized
provisional source retention, not final art acceptance. [derive.mjs](derive.mjs)
reproduces review movies from the gated sheet without changing a capture owner.

## Review and change ledger

Shape: reuse the existing ready lifecycle and candidate sheet; no new renderer,
controller, runtime types, or simulation mechanism. Diff: one hit author and
three manual detail sheets; existing action assertions unchanged. Docs: this
leaf owns the evidence and limitations; root integration owns global links.

No pre-existing test assertion changed. The new manual sheets add hit samples
to a previously hit-less candidate; smoke poses remain as discriminating opposing
views, and full motion adds every intermediate sample. Existing diagnostic
ActionTimeline tests pass unchanged. The source-support/export probes compare
actual arrays and posed supports, rather than action counts alone.

Final CPU checks: [354 web tests](full-web-tests.txt), TypeScript no-emit, and
[candidate bake check](final-bake-check.txt) pass. The initial full-suite failure
was a sparse-checkout omission of the committed campaign mask probe, restored
without changing its test or data. The old stationary/locomotion pixel gates
were not re-blessed; selective integration still needs its own full regression.

[Independent code review](code-review.txt), session
`01a07dcb-2bf6-7b12-ab73-879a6843d1b5`, completed without concrete defects.
It independently checked old exported channels and sample timing; it did not
rerun Blender or GPU work. Final shape/diff/docs pass found no further change.

Authoring discretion was delegated: compression amplitude, coordinated trunk
response and provisional cadence. The manual-only boundary, saved fitted source
owner, unchanged previous actions and no invented engine state were mandated.
No additional runtime contract was chosen by this study.
