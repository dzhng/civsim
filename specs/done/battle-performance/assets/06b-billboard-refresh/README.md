# Skip duplicate billboard camera preparation

A full crowd upload already prepares distant-soldier billboard data for its
camera. Preparation then asks for the same camera again. Native audience history
now retains copied eye/right/up/FOV values from the successful upload. An identical
refresh performs no packing or upload; changed values still refresh, including
mutation of the same caller object. Failed refreshes remain not-ready and cannot
be skipped back into a valid frame. Full uploads always publish new soldier data.

Three's billboard layer similarly retains a copied world transform and FOV and
invalidates that cache on every source upload. Parent-camera transforms are
updated before comparison. No pose, LOD, shadow, density or shader policy changed.

## Hardware work counts

Two 120-frame generated-seed-7 camera sweeps, each after 30 warm frames at paused
tick 30, exercise the actual game routes at 1440×900 CSS and DPR 2. Camera packets
match across each baseline/candidate pair. Native crowd signatures match; source
simulation state hashes match. Final per-frame record/metadata FNV-1a fingerprints
match. These are work-count and payload-fingerprint controls, not pixel acceptance,
FPS improvements, physical GPU transfer measurements or quiet backend rankings.

| Work observed | Baseline | Candidate |
| --- | ---: | ---: |
| Raw billboard record queue writes | 1,854 | 927 |
| Raw record bytes passed to writeBuffer | 145,684,224 | 72,842,112 |
| Three metadata rebuilds | 2,160 | 1,080 |
| Three soldier metadata iterations | 3,035,088 | 1,517,544 |

The raw observer counts the actual labeled instance-buffer writes. The source
observer reads actual metadata attribute invalidations and active soldier counts.
Three can coalesce repeated invalidations before drawing, so its row does not
claim a corresponding reduction in physical uploads. Probe/hash overhead makes
recorded wall times unsuitable as performance claims.

The first source probe lacked its module URL in the retained Resource Timing
entries. It produced no work evidence. The successful probe reserves 10,000 timing
entries before navigation and verifies that real billboard work was intercepted.
Scratch probes remain under `throwaway/`; only successful controls support the table.

## Verification

The new duplicate-work assertions fail on the prior source/native implementations
and pass with the caches. Camera-value mutation, parent motion, FOV, source updates
and failed-upload readiness remain covered. The source assertion was first added
to the existing pose fixture, then separated into its own test without weakening
its assertion. Existing pose/alpha expectations remain unchanged.

The 17 affected source/raw tests and 21 cross-native audience tests pass. Five
relevant TypeScript configurations pass. Independent code review found no actionable
regressions. The final unchanged 30,000-soldier hardware gate passes all 18 checks
with its original 33 ms threshold and content floors. No screenshot was re-blessed.

Full live performance, temporal visual acceptance and backend selection remain
open. Builds at 9374dbc9 predate this cache and must not be called current runtime.
