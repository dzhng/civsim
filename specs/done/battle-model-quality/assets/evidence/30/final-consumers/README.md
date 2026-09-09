# Final production-consumer repeat

The [ordinary serial run](repeat.json) passes 744 checks across arrows, terrain
seating, action replay and the production workbench, with no failures or page
errors. All 59 snapshot comparisons (58 distinct images; submission parity is
checked twice) report zero differing pixels. No UPDATE flag or relaxed image
tolerance was used. The source tree stayed unchanged until the process exited.

After archive-link and test-title updates, the [web suite](web-tests.txt) passes
404 tests in 69 files, [TypeScript](typecheck.txt) and the [production build](build.txt)
pass, and the [regenerated diagnostic check](fixture-check.txt) confirms 20
appearances and 2,793,456 sampled vertex positions within bounds, with deterministic output. The only
generated fixture change is its review-matrix link to the archived rationale;
production geometry, animation and catalog bytes are unchanged by archiving.
The final CPU/build console logs are whitespace-trimmed; structured run reports
and captured image bytes are unchanged.

Run from `web/` with bundled headless Chromium and SwiftShader:

```sh
VERIFY_GPU=1 VERIFY_URL=http://localhost:5437 SCENARIO_REPORT_JSON=../throwaway/final-consumer-repeat.json node scene.mjs battle-model-action-replay battle-model-workbench battle-arrows battle-seating
```

Earlier campaign/LOD and corrected live-gait results remain in the parent
integration record. This run does not claim full campaign pixel identity or
performance acceptance. The earlier standing/frame-time limits are unchanged.

## Two fixture failures, separately resolved

**Arrow setup raced asset loading.** The new start-tick assertion failed at
354 before the fix in [the red run](arrows-start-red.json). Simulation had
advanced while the scene waited for renderer readiness. A one-shot initialization
hook now calls the existing freeze owner when the debug API is installed, before
the first simulation frame; it restores the ordinary writable API property.
No game flag, simulation rule, seed or volley order changed. The
[update](arrows-update.json), [focused repeat](arrows-repeat.json), and final
serial repeat all start at tick 0 and capture the volley at tick 1280. Both
ordinary repeats have zero differing pixels. The baseline change includes the
authored-roster cutover and corrected fixture timing/camera position; it is not
an isolated shader comparison.

**The reload deadline expired before successful preparation finished.** The
[diagnostic](workbench-reload-diagnostic.json) preserves the original 30-second
failure. At 30,008 ms the button was still disabled and loading, with no pending
network request; the error field still held the previous intentionally injected
failure. Reload completed at 43,192 ms with reloads=2, error=null and the button
enabled. The functional wait now allows 60 seconds with the same success
predicate. This software-renderer observation is not player-hardware loading
speed or a frame-time result.

The [subsequent update run](workbench-update-interrupted.json) refreshed the
images but failed in its final late-reload probe after the main agent overlapped
it with formatting and the next browser launch. The execution context was
destroyed; the server log did not establish HMR as the cause. This is not a clean
verification run and is not credited as a production pass. The final ordinary
serial run independently repeats every image and passes the late-admission
check: rejection preserves active appearance 14 and 171 scene nodes.

## Visual review and limits

The main reviewer inspected the current full images and focused crops; fresh,
image-only reviewers independently inspected the same subjects. The curated
equipment/control/volley set was opened in one Preview window for a non-blocking
review, then closed after five minutes without new direction. The user's
previously accepted quality cutoff remains the decision, not inferred new approval.

- The equipment handoff clearly reports tick 165, sidearm appearance 18, a
  frozen local source, walk destination at phase 0 and blend weight 0. Sword,
  shield, helmet, scabbard and legs are visible. The destination-only footer
  is less precise when read alone; the explicit source/weight fields resolve it.
- Workbench formation shows 16 separate coherent figures. The phalanx side view
  clips its long weapon at the top; full-kit sheets own full-weapon inspection.
  Manual alive/dead images intentionally keep the same standing clip and change
  corpse treatment; they do not purport to show a fall.
- The far image/crop shows 20 distinguishable groups. At only a few pixels per
  soldier, it cannot certify anatomy, equipment completeness or ground contact.
  Some groups read low/flat; no missing model was established.
- Arrow silhouettes are visible, but thick/dominant against pale distant
  soldiers; altitude cues and far formation detail are weak. Close soldiers have
  readable bodies but similar pale surfaces and irregular rank spacing. No
  definite detached equipment or floating body was established by these stills.
- Patterned mail, blank faces, ambiguous pale sleeve/hem patches and inherited
  top-navigation clipping remain visible limitations. These are not newly
  certified anatomical/material finishes or a lab-navigation redesign.
- Terrain seating checks verify every sampled soldier elevation and slope span,
  not close-up sole contact: the overview images cannot establish planted feet.

These limitations remain in the feature's follow-up record. Exact pixel repeats
prove controlled capture, not finished artistic quality.

## Changed-image inventory

Workbench comparison against `16984d54` isolates the final posed-normal renderer
change with its established subjects: heavy-front 3,566 pixels/max channel 17;
phalanx-side 1,450/14; formation 10,627/55; submission-parity 799/60;
manual-alive 3,564/17; manual-dead 3,451/16; controls 3,595/26. The far frame is
unchanged. All current frames repeat exactly in the serial run.

The [five existing replay-frame deltas](replay-existing-delta.json) compare the
old synthetic figures to authored production figures and their bound clips;
they are not an isolated shader experiment. The temporal semantic replacement
inventory and full-frame review remain in [replay review](../replay-review/review.md).
The [equipment-only update](equipment-update.json) selects one snapshot but
still runs the replay's functional/numerical checks; it does not claim a full
snapshot comparison. The final ordinary run supplies that complete comparison.

## Review disposition

Independent source review and the final read-only Codex CLI review found no
actionable defect in the six changed scene/helper files. The frozen-source
handoff check was renamed to describe its kind/weight assertion rather than
claiming it independently measures retained pose values; existing timeline
tests own actual pose continuity. A misleading pause/freeze test title was also
corrected without changing assertions. No production code or unit statistics
changed in this final fixture pass.
