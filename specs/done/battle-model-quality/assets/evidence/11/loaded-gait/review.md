# Loaded gait: whole-body response

Less-wrong working candidate, not locomotion acceptance. The comparison freezes
the prior equipped source, rig, geometry, materials, cameras and clip durations.
The [prior pace rationale](../heavy-run/review.md#pace-rationale) still applies;
simulation, runtime sampling and prescribed speeds are unchanged. New belt,
footwear and anatomy revisions require the parent's combined refit.

## Authoring decisions and axis correction

The prior interpretation of local Z as axial torso rotation was wrong. Actual
bone matrices show local Y follows the near-vertical body segments. The
[basis/pose probe](bone-basis.json) records both rest columns and evaluated
world-space deltas. Authoring now composes explicit world-Z yaw and world-X
lean, rather than inferring axes from bone names.

Delegated motion-art choices in this pass:

- Forward-set pelvis/chest with opposing yaw and a substantially level head.
  This separates gaze stabilization from shoulder response. Run chest lean is
  about 15½ degrees; walk is about 7 degrees, with small impact response.
- Sword-arm excursion is larger than shield-arm excursion. Carriage opposes
  the advancing leg; the loaded shield does not swing like an empty hand.
  Exact excursion is an artist choice, not an accepted handling contract.
- Walk heel rise starts earlier, paired with greater early recovery knee bend.
  Existing cadence, stride length and support/flight partition are retained.
- World-oriented legs compensate for the moving hip origin in the fore/aft
  trajectory. No target solver, new bones or planted-foot state enters runtime.

These choices produce visibly different whole-body motion, but do not establish
historical handling accuracy or biomechanical validation.

## Evidence and verdict

Every authored frame has a production-path capture from four bearings with an
exact fresh repeat per tile. [Capture output](capture.log) retains unaccepted
baseline comparisons; no baseline was blessed. Native side frames, complete
contact sheets and 2× feet crops accompany review-only real-time and slowed GIFs.
GIF timing is unchanged from the prior candidate.

Fresh unprimed A/B review inspected every numbered frame in all 16 bearing
sheets, both feet-sheet sets and native examples. It prefers B (this candidate),
with moderate confidence: run side 08–14 shows credible forward commitment and
shoulder-hand response; walk 10–13 / 23–26 has clearer terminal heel rise and a
more connected push-off silhouette. No new pose defect blocks provisional
integration. The author independently sees the same improvement.

Remaining findings: lateral trunk transfer over the supporting leg is restrained;
the rear run leg is stiff before recovery; the recovering ankle remains fairly
flat. Larger sword excursion could read as pumping if too quick, which stills
cannot establish. Neither agent observed timed GIF playback, so cadence and
temporal carry quality are explicitly unverified. The GIFs are supplied for the
parent/user's timed review, not presented as proof that it passed.

[Artifact checks](artifact-checks.json) show approximately 1.46 million changed
walk-side pixels and 1.66 million run-side pixels against the frozen prior.
Ready and all inspection clip payloads are exact, and locomotion endpoints agree
exactly. [Source integrity](source-integrity.json) proves unchanged mesh positions,
topology, weights and bind matrices.

The authored-frame support guards pass without weaker thresholds. The
[quarter-frame probe](grounding-subframes.json) still finds 2.27 mm walk / 2.63 mm
run sole penetration between keys; this pass did not solve interpolation contact.
Measured flat-support residuals are 3.7 / 7.5 mm fore/aft and below 0.6 mm lateral.
Sampled sword vertices remain outside the body. A separate scabbard probe finds
four inside-body vertices already in ready and at most four in locomotion; this
does not establish exact scabbard clearance and is not a new-penetration proof.
All contact acceptance remains open.

## Integration and review

The existing `author_motion` composition seam is unchanged: rebuild current kit
with this module, then use the existing heavy baker and motion scene. Do not copy
the frozen candidate mesh over newer root geometry. Reproduction uses the same
[candidate route](../heavy-run/review.md#reproduction-and-integration).

Shape review retained one local world-body authoring helper; it owns the actual
coordinate-space decision shared by both gaits. Removed the unused old sway
calculation. Bake check, typecheck and diff checks pass. The installed CLI still
rejects the configured model ([review attempt](cli-review.log)); it was not
upgraded or overridden. Independent source review found no blocking correctness
or simplification issue: parent-rotation removal and hip-compensation ordering
are correct, and parsed rig/ready/inspection data exactly match the prior commit.
