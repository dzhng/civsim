# Bounded body experiments remain rejected

The authorized fixed-topology shoulder study has not produced a retainable
body. Three CPU trials preserve the same patch boundary, distal body/hands,
rig and all13 actions, but trade one pose's folding for another. No trial was
captured as an accepted visual improvement and no garment fitting followed.
This does not prove that the topology must change.

## Controlled scope

The same frozen AQ fitted source owns each trial. Both shoulder patches keep
their176 boundary vertices fixed. At most538 interior vertices change, with
exact old-position/weight correspondence into the merged runtime mesh.
All35 other mesh objects, topology, UVs, materials and rig remain unchanged;
every action key stream remains exact. Garments and the medium source stay
frozen. The failed shared anatomy-owner function was archived with each trial,
then removed with a scoped patch; no rejected implementation remains in the
tracked production diff.

- **AS:** local cap mass/taper and alternating surface smoothing, plus local
  relaxation of existing shoulder weights. Maximum rest displacement8.645mm;
  maximum individual weight change0.1915.
- **AT:** original rest positions, stronger outer-cap upper-arm support while
  preserving inner support and patch edge. Maximum weight change0.7233.
- **AU:** original weights; a single rest mesh adjusted using bind, ready and
  late-fall poses as offline authoring views. Maximum displacement19.980mm.
  No corrective shape, per-pose runtime geometry or new deformation mechanism
  is exported. The result is simply a different fixed rest mesh.

## Cross-pose results

Nonadjacent triangle crossing pairs in the same shoulder patches:

| Pose/side | AQ | AS | AT | AU |
| --- | --- | --- | --- | --- |
|Bind L/R|0/0|0/0|0/0|0/0|
|Ready R|12|49|28|14|
|Fall33 L|41|19|40|31|
|Fall33 R|66|68|91|65|
|Fall42 L|40|26|51|36|
|Fall42 R|81|73|93|79|

AS position-only and weight-only in-memory controls separate its effects.
Position-only raises ready-right crossings12→18 and fall42-left40→48;
weight-only raises ready-right12→38 while lowering fall42-left40→21. Neither
component is independently a nonregression. No such counterfactual was saved
over a source file.

Edge/area telemetry across both shoulders at relaxed carry, ready, bend,
pronation, sword effort, hit and late fall is preserved for each trial. These
are five evenly spaced samples per earlier clip and fall33/42, not complete
motion review. Some minimum ratios improve while others worsen. For example,
AU fall42-right minimum edge/rest falls0.2156→0.1631 and area/rest
0.0707→0.0654 despite its small reduction in crossing-pair count. Aggregate
counts alone cannot establish a better anatomical surface.

AU's imported packed-pose floor check remains nonnegative across169 quarter-frame
times; its minimum is0.000259mm at frame0, unchanged sole contact. That does
not compensate for the shoulder failures. No floor waiver or source lift is used.

The failure involves editable interiors, not only wholly frozen boundary
triangles. Therefore these results do not justify silently widening the patch,
changing topology, adding bones or changing action keys. Further threshold
nudging or automatic relaxation is not established as a useful next step.
The next design must address the actual shoulder mass/support relation seen in
the unchanged unarmored views; source freedoms beyond this bound require a
separate decision. No anatomy or reaction acceptance is claimed.

Raw controls, vertex deltas, cross-pose metrics and crossing identities are
preserved in the sibling `body-trials` folder. Frozen editable trial sources
and owner/recipe copies remain under the isolated worktree's
`throwaway/heavy-death/{as,at,au}/`. No failed source is promoted.
