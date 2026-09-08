# Immediate equipment, continuous compatible body pose

Engine-selected equipment remains authoritative on the observation tick. The new
bundle immediately replaces the old one; no switch timer, retained second weapon,
draw/sheath action or mechanics change is introduced. Only its skeletal pose can
start from the old fully composed local pose, through the existing 0.15-second
blend. This does not interpolate a pike's shape into a sword or claim an authored
attachment handoff.

The shipped pike/rest/sidearm rigs (3/16/18 and 14/17/19) each have 26 joints;
cavalry 6/15 have 47. Within each family, ordered names, parents, bind TRS and
inverse binds match exactly. The timeline caches these layout signatures once
per admitted catalog. Different layouts retain the prior reset behavior; there
is no general name-based remapper or retarget framework.

## Verification / changed-test ledger

- Existing renamed-clip equipment/injury test previously required a new phase-zero
  clip source. It now requires immediate new appearance and new clip destination,
  but an exact frozen prior body pose. Red before implementation, green after.
- New rapid reversal and simultaneous-death test retains exact prior locals at
  each boundary, terminal death and reset semantics.
- New bind-translation/rotation/scale, inverse-bind, name and ancestry controls
  require reset for incompatible rigs.
- New mounted test freezes the complete active overlay, including simultaneous
  release or death. Disabling the compatible branch makes its local-transform
  assertion fail; restoration passes.
- Actual shipped-bundle test covers eight directed equipment edges, requiring
  immediate destination identity and exact old composed locals under the new rig.

`vitest run tests/actionTimeline.test.ts tests/actionTimelineMounted.test.ts
tests/playbackPacking.test.ts`: 3 files, 75 tests, exit 0. Web `tsc --noEmit`:
exit 0. An attempted older adapter suite had four missing-placeholder-path errors
because this isolated tree predates the parent's fixture cutover; no test/source
workaround was committed. Parent owns merged consumer/replay verification.

Independent Codex review completed clean, including priority, completed-interval,
upper-mask and frozen-source lifetime paths. Main-agent shape review retained one
timeline/pose evaluator and no additional controller. No GPU or Blender work.

Choice: exact compatible-space reuse instead of blanket bundle reset. High
confidence for skeletal continuity; equipment geometry still changes immediately
and new equipment initially follows the prior body pose. Natural draw/sheath
gestures are not represented by this bounded fix.
