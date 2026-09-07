# Connected metacarpal studies — rejected

Explicit connectivity and collision-free equipment fit did not produce a natural
hand. Both studies retained nearly parallel finger loops and an artificial palm.
The final candidate brought its thumb closer to the fingers, but its pointed,
scalloped dorsal transitions were worse than the control's plain surface. Neither
is a replacement for the still-unaccepted settled hand.

There are three distinct states:

- Settled `0d8f8634` is the source retained by root. It is **not** the control
  pictured in this folder.
- `control-*.png` are capture 9037: the first connected-metacarpal construction,
  with a jointly fitted equipment frame and all 930 sampled contacts clear.
- `B-*.png` are capture 22599: the boundary-following palm/knuckle/thumb revision.
  The pixel metrics compare this candidate against 9037, with the same equipment
  frame, cameras and frozen pose.

Author and root inspected all three final four-view sheets and rejected the
visible shape. Independent **source-only** follow-up found no functional defect.
A fresh unprimed visual agent could not be started because of the system's agent
thread limit. There is no fresh-visual-review, accepted-art, whole-body-candidate
or timing claim. Shield views 0 and 3 fully hide the hand.

## Structural findings

The donor wrist has only 18 boundary vertices, spanning 19.0–30.6 mm along the
hand axis. Connecting it to a planar cut at 45 mm created 14–26 mm triangle fans
through the proximal palm. A boundary-following cuff shortened this connector,
but did not solve the whole hand. Region-colored CPU renders showed that the
remaining broad planes belonged to the new palm itself. Smooth face flags,
absence of custom normals and an unposed comparison ruled out a missing smooth
flag, stale split normals or the armature as the primary cause.

The final construction used rounded transverse sections, individually oriented
knuckle ports and a shorter opposing thumb. Its nearest-port surface routing
created pointed dorsal lobes rather than convincing metacarpal masses. Those
lobes are a regression, not acceptable knuckle definition.

Explicit joint tuples also disguised substantial repetition. The control and
final candidate share these authored centerline measurements; they are geometry
values, not measurements of real anatomy:

| Digit | Proximal / middle / distal shaft (mm) | PIP / DIP turn (degrees) |
| --- | --- | --- |
| Index | 39.94 / 30.56 / 22.16 | 77.60 / 50.14 |
| Middle | 40.83 / 35.11 / 23.54 | 79.02 / 57.75 |
| Ring | 41.59 / 37.00 / 21.00 | 81.74 / 57.72 |
| Little | 39.41 / 30.43 / 15.52 | 83.39 / 37.06 |

Almost equal proximal lengths and bend angles explain why the four loops still
read as a template. Another port-routing, tube-radius or normal adjustment is not
the next construction. A reference-led grasp must establish actual knuckle
positions and digit-length hierarchy before fitting the handle to that hand.

## Physical evidence, not art acceptance

Both 9037 and 22599 were clear in expanded whole-skin checks against the sword's
four parts and the shield grip/supports over 930 poses: ready 1, walk 109, run 97,
and 241 samples each for bend, pronation and combined bend/pronation. The new
sword cant removed the previous clinical blade intersections. This sampled
result is useful as a control, not an invariant that future anatomy must preserve.

The final body has 29,776 vertices in one connected component, with zero detected
nonadjacent hand self-intersections. All 10,822 required non-hand positions and
weights, plus rig names/parents/rest matrices, remained exact. Maximum weight-sum
error was 1.64e-7. Strict human and isolated-heavy bakes passed. Grip tracking now
reads the shared authored frame rather than the obsolete literal center; its
sampled right-hand skin drift stayed below 3.88e-7 m without loosening the gate.

Nearest sampled finger-to-grip gaps were 0.36, 1.70, 1.14 and 0.17 mm. The middle
finger region still had no samples within 1.5 mm. The authored thumb-pad mesh
approached the finger surface within approximately 0.57 mm on both sides, with
six samples per side under 1 mm. These are nearest surface samples, not measured
contact areas or proof of soft-tissue pressure.

The entire sword remained one rigidly moved assembly; maximum pairwise dimension
error was below 8.54e-8 m. Its parts and shield grip retained topology, UVs and
weights. Shield body/boss geometry and other frozen gear remained unchanged.
Only the authored grip frame and fitted supports were intentionally different.
No stale whole kit was promoted.

## Provenance and restoration

Both captures used explicit root GPU grants, sequential eight equipped and four
empty-hand views, default headless SwiftShader and Vite 5193. Both finished with
exit 0, byte-stable fresh repeats and no page errors; each GPU slot was explicitly
released after terminal completion. No accepted baseline was blessed.

| Artifact | 9037 control SHA-256 | 22599 candidate SHA-256 |
| --- | --- | --- |
| Anatomy source | `c68f34aaf6b1866cddaf8c185fe479a6246142383ad65ae938f6c88fd4d01db3` | `ffe7e1e89c80ef7a93cb6d3bd850c9db337aa5659aff392bf5e3d2a0cc5be22a` |
| Human GLB | `81466fe2dc6af381b3301679bceb6d09e1ea3596ee6827d594224ed7500cc04b` | `3ad57eac146798bfa3f154ebc95d3bc4d53cd36fb6d7ed2f0131d15338f5cfe7` |

Both use heavy-kit source SHA-256
`bc450ff2299c00cbe1a398ffdd9bfd5db4c40ffaec2a9df5c223b47c5617eac0`.
The two patches are relative to settled source. Editable control/candidate human
and heavy files, full comparisons, crops and CPU logs remain in local scratch
`throwaway/metacarpal-grasp/` and `throwaway/boundary-palm/`.

Builds used default-thread background Blender with the frozen original donor,
not a broad body rebuild. Fitting used the isolated `f1962716` kit, not root's
newer composed equipment or exporter basis. The shared interactive Blender
process was not operated by this lane.

Both authoring files and the canonical human/isolated-heavy generated directories
were restored exactly to this worktree's settled HEAD. The human source hash is
again `0958a94cc79ec1eb208dc810b3793cd1cb65c83afe75b5a1830ec622843e65f7` and
the human GLB is `33753b624d76aa07298f72d95af010b50949739ec7a3f9ca2a427a31b53ee91d`.
Inherited harness files and unrelated mail artifacts were not changed by the
restoration. Root's settled hands remain unchanged.
