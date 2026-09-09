# Retained medium thrust I

The user explicitly accepted the current cosmetic quality and prioritized a
complete usable roster over further first-pair refinement. I is therefore
retained as a manual authored action, superseding the earlier rejection as a
delivery decision—not as a claim that its weight and rhythm concerns vanished.
The [frozen critique and controls](revision-i/review.md) remain the evidence.

The fitted source gains one non-looping thrust with exact held-ready endpoints.
Its art timing does not set simulation cadence, reach or damage. Existing eight
actions, geometry and rig are preserved; the candidate's presentation remains
null, so this does not invent a runtime brace or strike event. More complete
bindings and missing actions belong to the roster-delivery pass.

## Ownership and review

The saved medium assembly remains the geometry owner. Its existing Blender
motion recipe authors the new action from saved pike-ready, replacing only that
action rather than accumulating transforms. It reuses the existing two-bone
joint solver and supported-leg helper; the left elbow reference deliberately
uses ready-world space because the shield follows that forearm. There is no
independent shield motion or alternate hand attachment.

The existing travel fixture becomes the medium motion fixture, sharing its
production draw, time sampling and exact-repeat checks with the stationary
thrust. Old travel arithmetic and ordering remain unchanged. No compatibility
alias, parallel controller or engine clock is introduced.

Main shape/diff review found no remaining functional defect. Independent CLI
review identified the provisional thrust baselines as stale: the retained I
animation must replace those expectations through the shared snapshot gate.
That finding is addressed by the explicitly authorized selective refresh and
full regression, not by tolerances or copying failed actuals into baselines.

## Changed-test ledger

| Test surface | Before | Retained behavior | Reason |
| --- | --- | --- | --- |
| Medium static coverage | Existing fitted posture/travel sheets | Two additional thrust milestone sheets | Make the new action reviewable in opposed whole/full-pike views |
| Medium motion coverage | Ordinary walk/run and formation checks | Adds one stationary 27-frame thrust from four views | Prove clip submission, exact repeated pixels, terminal hold and return to ready |
| Existing 358 images | Accepted pre-thrust source | Must remain exact | New action must not change unrelated assets or draw arithmetic |
| Model travel CPU tests | Import travel fixture | Import renamed shared motion owner; same assertions | Consumer ownership change only |

## Verification pickup

The I study already demonstrated 108 immediate exact repeats, source/rig/action
preservation and sampled explicit-thrust contact controls. The selective shared
snapshot refresh passed (session 95542): 376 checks, 110 snapshots, no failures
or page errors. All 108 refreshed motion frames are RGBA-exact to frozen I's
previously inspected film, not a newly altered animation. The normal full run
(session 23637) passed all 1,552 checks and 468 snapshots: every one of the
original 358 images is zero-pixel exact, as are the 110 thrust expectations.
There were no failures or page errors; the browser closed before GPU release.
No new art iteration is part of this integration.

CPU verification: six bake suites pass, four model-travel tests pass, TypeScript
passes, and the medium bake's `--check` passes. The initial six-suite attempt
could not find the sparse-excluded two-bone fixture; including that exact tracked
fixture and rerunning resolved the setup failure, without test changes. The
independent review's presentation-test sandbox limitation was separately covered
by the successful six-suite run.

Reproduction uses `node scene.mjs medium-phalanx` from `web`, with
`VERIFY_GPU=1` and the isolated server selected by `VERIFY_URL`. The selective
refresh additionally used `UPDATE_SHOTS=1 SNAP=medium-phalanx/pike-thrust`;
the normal full run used neither option. Structured reports are adjacent in
`retain-i`. Current saved GLB SHA256 remains
`ea1e2f2d35f957995267a69691dbc0989638479af22a1efeb913f59cbe1649fe`.

## Choice audit and retained limits

The shared fixture rename reflects its new stationary action responsibility;
travel drawing is not replaced. Twenty-seven samples include the terminal pose,
and the review GIF replays these same captures rather than inventing a second
motion clock. The non-looping 1.3-second duration, relative limb trajectories and
ready-world support-elbow reference remain art choices, not engine rules.

The retained motion has subdued weight transfer and a conspicuous shield
retrieval. Sampled sole/grip and triangle checks do not prove continuous
collision clearance, detailed hand purchase, live combat reach, or grounding at
arbitrary gameplay speed. These uncertainties are deferred under the user's
explicit current-quality acceptance, not hidden by the regression gate.
