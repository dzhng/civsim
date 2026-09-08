# Rejected hand-mass study

Both candidates are rejected. The canonical hand source, editable human assets
and generated human bundles were restored exactly to `0d8f8634`; the human
bundle check passes. No natural-hand acceptance, baseline blessing or runtime
change resulted from this study.

## Candidate 1: changes traded defects

Compare the [sword](B-sword.png), [shield](B-shield.png) and [empty hand](B-empty.png)
with the matching [settled closure evidence](../power-grip-closure/review.md).
The [source diff](candidate-1.patch) narrows palm/cup mass, shortens the thumb and
changes finger sections/joint positions together. Source SHA256:
`fb5d1dccfc91488510d737eedddeeb25e61b89fd8d2710a82e027bc50ab4afb9`.

These are twelve native tiles with newly rendered byte-stable repeats, captured
under an explicit root-granted GPU turn. The first boot failed because Vite had
exited; the successful retry produced these images. Blender used default
threads. Fitting used frozen `f1962716` gear in this worktree's old export basis,
not root's current modular equipment or independent basis correction. No full
root-gear refit was run.

Fresh neutral review inspected six matched A/B sheets, all 24 enlarged crops,
whole-body A context and the infantry reference. High-confidence verdict:
**both wrong; candidate 1 mainly trades defects rather than materially improving
a natural power grip.** Its shorter/slimmer thumb is a small gain, but angular
finger rails and sharper finger-root/thumb-base steps are regressions. The
slab-like palm, weak opposition and conspicuous upright fingertip ends remain.
Shield views 0/3 obscure the hand; whole-body scale cannot resolve these defects.

The rejection holds despite passing strict human/heavy exports, retained-data
checks, zero hand self-intersections and zero actual handle/guard crossings over
930 sampled poses. Clean fit is not a substitute for anatomical structure.

## Candidate 2: no valid render

The [second source diff](candidate-2.patch) compacts the finger spacing and
redistributes palm/thumb volume. Source SHA256:
`e163495e09fa1e4fdecd24b4eec290c59af380c10fcb80265ccfbef53b39574e`.
Both builds hit the [duplicate-face exception](candidate-2-failure.log) during
graft insertion. Blender's process returned zero despite the Python failure;
the build was not treated as passed. No topology gate was weakened.

Candidate 2 has **no valid rendered output**. Candidate-1 images were not
relabelled as candidate 2. This failure does not establish whether a compact
fist silhouette would have been better; it establishes that this source could
not produce a valid candidate. No third shape iteration was attempted.

Further mass-only tuning of these lofts did not resolve the natural-hand target.
Next work should reconsider integrated palm/metacarpal and phalange construction
while preserving the settled grasp envelope and body/rig controls—not repeat
arbitrary width/depth tweaks, add ornamental detail, or relax the art/contact gates.
