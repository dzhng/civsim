# Whole-assembly forward export probe

Candidate correction in progress, not locomotion acceptance. The rejected travel
smoke establishes why native forward must be corrected. The shared anatomy
exporter can rotate the armature and all bound geometry together during export,
then restore its authoring transform before saving the editable Blender scene.
No renderer offset or reversed fixture travel is needed.

A separate background Blender process exported the current heavy assembly to
scratch. The original GLB hash is
`17410d045549c86fec783a3065b22367c5f6d1ef16e37104d064d130fabccdc9`;
the rotated scratch GLB hash is
`6c25d39ea85bdd676e0ebf8d3868a2451d8c48c7548c8ff6fa7731d065e51ea5`.
The standard importer, engine-basis conversion and skin evaluator compared all
vertices in six clips at four phases each. All1,418,472 posed positions match
the expected half-turn within2.8254e-7 metres. Triangle topology and skin weights
are exact; clip names and durations are unchanged. The exporter restores the
armature's authoring matrix. This proves a sampled rigid coordinate conversion,
not complete animation or visual correctness.

The candidate-forward regression first failed on the original human: its left
toe lay0.109m behind the foot along native positiveY. The human, combined heavy
and frozen heavy-motion study have now been rebuilt and rebaked with the shared
export correction. The regression passes on all three actual source GLBs;
the complete `bun run --cwd web bake:test` also passes. Editable Blender scenes
retain their authoring orientation. Detail cameras transform their authored
landmarks and yaw together; production travel direction is unchanged.

The focused production capture on2026-09-07 passed all pose submission,
fresh-frame repeat, seek-away/return and prescribed distance checks. Existing
unaccepted ready/feet snapshots differed as expected after rotating the assembly
relative to fixed world lighting; these were not silently blessed. Six side
travel frames differ from the rejected smoke by27335,28653,30667 walk pixels
and31531,32160,36875 run pixels respectively, at the same1024×640 framing.
These comparisons include the intermediate hand integration, so they are not
an isolated hand-shape experiment. The earlier rigid-mesh probe isolates the
coordinate change.

Direct inspection shows the candidate now faces its travel direction and the
grip cameras still frame their intended features. A fresh reviewer inspected all
six full frames: no gross equipment detachment or clipping at the frame edges;
run remains weakly differentiated from walk with an upright torso. The sparse
samples repeat similar gait phases, so they cannot establish foot locking,
sliding, recovery or rhythm. That reviewer could not produce enlarged crops;
fine contact remains unverified. Complete consecutive-frame travel and affected
anatomy/motion views remain required. No anatomy, gear or locomotion acceptance
is implied by these technical checks.

The subsequent full travel run completed with418 passing checks, no failures
and no page errors on bundled Chromium/SwiftShader. All136 consecutive frames
were captured twice; the six previous side frames compare exactly. Root inspected
every frame in chronological eight-frame body strips, retaining full horizontal
framing. The fixed camera shows forward progression in both views, alternating
support and recovery without a visible discontinuity at the internal cycle wrap.
Walk has a backward-looking torso rock near opposite contact; run's recovery
remains low and its upper body reads stiff. These are next motion-review targets,
not permission to change gameplay speed. Fine sliding is not proved absent by
the unmarked ground or by these stills.

Full capture provenance, submitted poses, per-frame hashes and four20fps GIFs
derived from the gated frames are retained in [forward-candidate](forward-candidate/).
The captured combined-heavy GLB
hash is `70238199b1ba20727f1568834e93e0b2753f432d90cb15bb285e5fd8065f19e8`.
No travel baseline has been committed as accepted art. Independent code review
also found that rebuilding the frozen heavy-motion study picked up changed walk
and run keys; restore that study's authored actions before retaining a
transport-only orientation correction. The actual combined-heavy travel evidence
above is not a claim that the separate frozen study remained unchanged.

That unrelated motion drift is now removed: the saved frozen study was loaded
and re-exported through the corrected exporter without calling `author_motion`.
The real skin evaluator compared all187735 posed vertices per clip over five
times in each of six clips against the pre-change study. All differ only by the
intended rigid half-turn, maximum2.7193e-7m; indices, weights and clip durations
remain exact. The forward regression now also checks actual skinned toe-surface
centroids with real inverse binds, rather than skeletal landmarks alone. It
passes for all three candidates. This protects basis coherence, not animation
quality or the full frozen-study image surface.

Focused affected-view capture also passes: empty human power-grip and the saved
heavy-motion ready stance each retain four correctly framed, freshly repeated
views. Root inspected both actual sheets and the combined-heavy ready sheet.
All remain unaccepted art. The new forward test adds a previously missing
contract: native toes and their real skinned surfaces must face forward; no
existing assertion, pixel tolerance or simulation statistic was relaxed.

Review: the shared exporter remains the sole coordinate-conversion owner; no
runtime branch, dependency or second skinning path was added. Independent peer
review found the frozen-study drift described above and the weak skeleton-only
test; both findings were addressed. Local shape/diff/docs review also removed
an unsupported appearance claim from the hand-authoring comment. The requested
Codex CLI review was attempted with its configured defaults, but installed
v0.144.4 exited withHTTP400 because `gpt-6-astra` requires a newer CLI. No model,
installation or account settings were changed. This is a recorded unavailable
review, not a passing CLI review.
