# Carry fit: structural attachment before detail

Working study, not accepted art or motion. The target is a soldier carrying the
shield beside the left flank at ease and during ordinary travel, then raising it
forward when battle-ready. Both palms must face appropriately into their grips.

The [whole carry sheet](whole-carry.png) distinguishes those poses without changing
the renderer or simulation. An independent critique found the overall silhouette
clear but rejected the [shield attachment close-up](disconnected-supports.png):
the support rods visibly stopped short of the board, and the open finger loop
did not convincingly bear weight. Root inspection agrees. A board/body clearance
check missed this failure because it did not test the load-bearing connection.

A source-space ray probe measured approximately 12.8 cm between each support tip
and the curved board. Extending both rods by one center-ray distance produced a
new visible defect: their finite-width ends pierced the shield face. The current
[cap-fit close-up](cap-fit.png) instead fits each end vertex to the curved surface.
Root inspection sees no exposed tip in these views; this is not an independent
acceptance verdict. The long hardware and open grip remain provisional. Do not
resume isolated finger sculpting ahead of whole-body motion and equipment form.

## Evidence boundaries

The whole sheet and disconnected-support close-up used GLB
`5ef7d585352fdb439d1eb22a9e5f28d481b781615afc386063b2bfac38749c1b`.
The whole sheet passed 68 capture checks; its close-up passed 10, with no page
errors. The cap-fit close-up used
`0a7beffb16f962e9cbb2993a5a30a83dd0b0c76a2a58a6eabf78f0af6c5f31a8`
and passed 10 capture checks without page errors. These are first-run scratch
snapshots, not accepted regression baselines or proof of motion quality.

Captures use the production candidate route, bundled Chromium/SwiftShader,
fixed daylight, fixed phases, and four 640-pixel-wide views. Whole views use
zoom 230 and target `[0,0,.95]`; close views use zoom 1100, pitch 1.4 and target
`[.25,-.059,.782]`. Whole-sheet rows are at ease, ready, walk and run; travel is
shown at phase .25, not a complete cycle. The committed candidate lacks idle,
so the earlier comparison used its ready clip for the at-ease row. That row
cannot establish same-pose equivalence.

The editable studies and probes remain under `throwaway/both-hands-carry` and
`throwaway/sword-handedness`; they are not production recipes. The candidate
catalog is manual-only. Integration must remove scratch monkeypatch authoring,
preserve unrelated kit, repeat motion/clearance gates and get fresh review.
The engine continues to own state, facing, position and combat timing.

## Complete travel review

The cap-fit source completed the existing two-cycle production travel capture:
`SNAP=travel VERIFY_GPU=1 node throwaway/capture-run-trunk.mjs both-hands-carry`.
All 417 checks passed with no page errors. Each captured frame also repeats
within the run; the scratch baseline's first creation is not an independent
second-run regression. All 64 run frames differ from the previous sword-carriage
capture, totaling 1,345,433 changed pixels at matched framing. No claim is made
for a walk A/B: that prior evidence folder contains run frames only.

Root inspected all 136 frames in chronological strips: each walk view covers
36 samples, each run view 32. Walk frames 00–07 move from extended step through
passing support, 08–15 transfer to the opposite step, 16–23 wrap into the next
cycle, and 24–35 repeat the alternating support. Run frames 00–07 show recovery,
passing and extension; 08–15 repeat on the other leg; 16–31 repeat the full
cycle. Both views retain coherent sword, shield and scabbard silhouettes.
These recentered crops judge pose continuity, not ground-relative foot locking.

The [run](run-oblique.gif) and [walk](walk-oblique.gif) are full-frame derivatives
of those captured frames, shown at their prescribed fixture speed. They were
opened for review. A fresh reviewer inspected all ordered strips and reported
no major attachment or silhouette failure, but identified upright mannequin-like
torso stiffness during running and little equipment response. The low shield
also hides much of the arm and hip, so these views cannot certify hidden contact.
The close grip was judged connected, not evidence of finished natural anatomy.

Verdict: retain the carry direction as a working authoring improvement; no slice
acceptance. Next improve whole-body loaded motion and verify protected travel
against canonical observations. Detailed fingers stay deferred. The editable
candidate still needs clean recipe integration and full affected regression;
no current production appearance has been replaced by this study.
