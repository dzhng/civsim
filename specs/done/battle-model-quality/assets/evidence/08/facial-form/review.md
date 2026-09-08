# Facial-form working candidate

Verdict: retain as an incremental improvement, not completed anatomy. The target
is an integrated, natural neutral adult face, with readable eyes and mouth at
the native inspection view. The Rome II reference guides that target; it is not
a pixel baseline. Both comparison rows remain below final quality.

The [comparison](head-comparison-2x.png) places freshly captured pre-change anatomy
above the final candidate. Each bearing uses a 200×270 crop at tile offset
(220,165), enlarged 2× without filtering. [Neutral](head-detail.png),
[bent](bent-head-detail.png), [whole body](close.png) and
[gameplay pitch](gameplay-pitch.png) retain the original production camera and
environment. The supplemental bent-head framing is recorded in the scene.

## Provenance and control

These are final capture **15130**, not the earlier duplicate-lip trial. Command:
`VERIFY_GPU=1 VERIFY_URL=http://localhost:5181 SCENARIO_REPORT_JSON=../throwaway/face-final-capture.json node web/scene.mjs human-anatomy`.
Bundled Chromium/SwiftShader, 1280×800, DPR1, frozen named bend poses and 640×640
tiles. Every newly rendered frozen crop repeats exactly; loader and page checks
pass. The run exits1 on seven comparisons against older unaccepted local images;
no baselines were blessed. [Raw report](capture.json) owns those checks.

Final GLB SHA256:
`799fda6fc2f597178efc611d3bad52f5e0922fc5899b65bf09c463a6ebdd2f8a`.
Final comparison SHA256:
`759e5673a8573fba41fb03f419a5bf2a949efc558be7b9f8e02bf761c312be9a`.
Final neutral-head SHA256:
`8b885a4f3dca4029f10d89dcf359cf3c22ed7b5faa7a123b0628d266342d1569`.

Historical whole-body PNGs showed broad unrelated drift despite identical body
geometry. They were not used as the final control. The [fresh before run](before/capture.json)
temporarily served the root worktree's unchanged anatomy bundle through this
same worktree/browser; the candidate bundle was restored afterward.
[Pixel comparison](pixel-comparison.json) gives 0 differing hand-detail pixels,
17 rear-head pixels, and 60,011 across the complete head sheet. The latter locates
the face change, not its quality. Rear differences can include silhouette or
normal changes near the face boundary; they are not claimed to be exact parity.

[Source probe](provenance.json) confirms all original vertex weights and body
normals remain identical; changed original positions are confined to the front
head. Local subdivision adds 2,808 vertices, for a provisional 26,120 triangles.
The final mesh has no nonmanifold edges. These counts are not an admitted07
budget. Bakes with `--check` and `bunx tsc --noEmit` from `web/` pass.

## Art and source review

The first independent critique found readable landmarks but protruding lip
shelves and lid crescents. Source review traced the lips to two competing relief
definitions. The added lip definition was removed; projection now recovers the
construction sculpt's single lip surface. Lid protrusion was reduced. A follow-up
source review found that ownership issue resolved and the scoped source clean.
The editable final deform mesh, rather than the hidden construction sculpt,
owns the post-reduction facial landmarks; the source ownership note explains why.

A separate final unprimed reviewer judged B less wrong with high confidence:
eyes and mouth read as structures rather than impressions in a smooth mask.
It still found closed-looking eye slots, a wedge-like nose, projecting lips,
weak jaw-to-neck transition, tall cylindrical forehead and insufficient cheek/
socket/muzzle volume. These are visible at the native head view, not only the
enlargement. The bent view preserves features without obvious facial collapse,
but emphasizes the heavy brow and faintly smiling mouth. Main inspection agrees.

The next facial pass needs broader integrated anatomical volumes, not more small
surface marks. Shoulder seams, joint shape, ears and grip form remain open08
work; this pass did not change them. Heavy equipment must be rebuilt against
the changed head before judging fit. No facial animation, rig, simulation,
renderer or production catalog changes were made.

The required CLI review was attempted and failed because its configured model
requires a newer CLI; [log](codex-review.log). No upgrade or model override was
performed. The independent read-only source review above is the available second
opinion, not a claimed CLI pass.
