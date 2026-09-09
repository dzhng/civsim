# Controller clip admission

Generic appearance validity is not gameplay validity. A Blender diagnostic can
legitimately contain only `bend`, while an appearance driven by the current
battle controller must handle every action that controller can request. The
generic bundle loader therefore remains vocabulary-neutral; controller admission
lives alongside the controller's clip vocabulary in `animationState.ts`.

Production battle creation/reload and campaign startup require that vocabulary
before allocating or replacing GPU resources. An explicit candidate workbench
catalog supplies an empty required-clip list because its poses select authored
clips directly. The world retains that list across reloads; active-pose validation
still prevents replacing an asset with one that cannot render the chosen pose.
This does not introduce fallback clips or change animation timing.

## Evidence

The new workbench assertion was run before the fix: deleting non-active
`attack_a` from the served animation returned `{ok:true,error:null}`. The existing
five snapshots remained identical, demonstrating why current-frame pixel parity
alone could not catch the later-action crash.

After admission validation, the same reload fails with
`Appearance 0 is missing required crowd clips: attack_a`, retains the old
appearance containing that action, and preserves production pixels. A fresh
production world rejects the same catalog. The ordinary startup path now loads
and validates assets before creating GPU resources rather than discovering the
missing action during a later draw.

Run from `web/` against this worktree's Vite server:

```sh
SCENARIO_REPORT_JSON=../specs/battle-model-quality/assets/evidence/03/clip-admission-checks.json VERIFY_GPU=1 VERIFY_URL=http://localhost:5179 node scene.mjs battle-model-workbench blender-production-candidates campaign-visual
```

[Checks](clip-admission-checks.json) pass: five workbench baselines, two candidate
contact sheets, and eight campaign captures are pixel-identical. The candidate
fixtures still initialize and reload `bend`, `gait` and `rider-action`; bad
candidate rebuilds retain the last good render. There are no browser/GPU errors.
Typecheck and the four existing animation-state tests also pass. No visual art
change is claimed; inspected production/candidate/campaign frames are unchanged.

## Review and decision audit

The value list and clip type have one owner, so adding a controller action also
updates its admission requirement. The public override is a readonly clip list,
not a second loader, compatibility mode or fallback behavior. Its explicit empty
candidate value is the limited exception; normal battle and campaign default to
the controller contract. The integrating agent approved this boundary before
implementation. Future action-timeline work owns any vocabulary evolution.

Independent Codex review returned no findings on boundary correctness, resource
ordering or rollback. Its sandbox could not rerun GPU scenes; the direct browser
run linked above provides that evidence. The local shape/diff/docs review found
no duplicate loader or new animation behavior.

Changed-test ledger: existing behavior is unchanged; the workbench adds checks
for rejecting a missing non-active action on reload and initial startup. All
existing rollback and candidate-vocabulary checks remain active.
