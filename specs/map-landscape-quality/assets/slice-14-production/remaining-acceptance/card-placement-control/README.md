# Spatial city-card placement control

This is a read-only verification of the extracted card-placement owner and
its north-to-south ordering in the must-show band. No canonical baseline,
scene assertion, threshold, renderer source, physics, seed, or save changed
in this evidence pass.

The unchanged campaign-lod scene supplied the entire history through its
border-fog stop: normal campaign, paused day 1, 1280×800 DPR 1, player army
placed in Roma, Roma panel open, political view and fog enabled,
cam(-430,380,2.2). The unchanged campaign-collision scene then verified
overview, Roma, and Pella arbitration, including its synchronous two-frame
DOM/report ordering assertion. Temporary orchestration retained only the
border-fog and two canonical collision images; screenshots here are evidence,
not replacements for canonical baselines.

Control: unchanged 5196. Candidate: 5209, worktree
`game-campaign-card-placement`, HEAD 58ad33b6 plus the uncommitted
`resolveMapCards` extraction and must-show ordering change. No label shader
change. Both use matching local WASM and the same patched Three dependency.

## Observed placement and protected behavior

| Border-fog card | Before top | Candidate top | Change |
| --- | ---: | ---: | ---: |
| TIBUR | 458.480837 | 258.796382 | −199.684455 px |
| ROMA | 294.863077 | 300.796382 | +5.933306 px |
| OSTIA/PORTUS | 352.863077 | 358.796382 | +5.933306 px |

The candidate matches the independently replayed production solver result.
All 15 border-fog cards remain visible, with zero pairwise card overlap.
The original collision checks pass: overview, Roma and Pella have no readable
label/card overlaps; Roma retains all required cards; first-frame reported
cards=1 with no stale rects, second-frame reported=DOM=15 with no stale rects.
The original own-city/model-anchor checks at regional and close views pass.

All three control images match the immutable remaining17 captures exactly.
The comparison and exact-repeat numbers are in report.json.

## Bounded visual verdict

Direct full-frame and 2× cluster inspection agrees with fresh, unprimed
review: Tibur returns from isolated open water to its city cluster, with no
visible card overlap, text clipping, or sidebar regression. The reviewer
found the candidate visibly better. Roma and Ostia move slightly downward;
this does not harm text readability, but increases their model distance.
Ostia's offshore card and residual card/model association ambiguity remain
known limitations of the downward-only placement policy. The candidate
retains the existing no-cull and anchor-clearance policy; this pass does not
claim complete card-association design or final material quality.

## Unchanged failures

Every run retains four existing campaign-lod behavioral failures: regional
label brightness, named-crop green coverage, Rome-close green coverage, and
selected-army/city green coverage. They reproduce the original metrics
(labelRatio .0001; named green .0871/.0599/.0712; close .0986; selected .1004).
These are independent color/label owner investigations, not waived gates.
Full original check results and published geometry are preserved in
report.json. No canonical snapshot comparisons were re-blessed.

Final result: all three candidate repeats have **zero differing decoded
pixels**. Border-fog changes 39,314 pixels against control; overview and
regional collision images change zero. All three controls also have zero
pixel differences against the immutable first captures. The browser exited
successfully with no page errors; all 33 recorded checks per run include
three evidence snapshot writes and the original unchanged scene checks.
City-body geometry is unchanged; candidate published geometry repeats exactly.
