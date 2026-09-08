# Usable fitted heavy death

The user prioritized a usable complete implementation over further individual
asset refinement. Retain the existing fitted AQ fall for integration and record
its shoulder/fall polish as follow-up. Do not replace its body with the rejected
AV reconstruction. This pass adds the genuine death action to the current fitted
heavy source; presentation remains manual-only until the main integration owner
binds the completed appearance.

## Source ownership

The12-action source at root1ae00b66 is byte-identical to the frozen control used
to author AQ. The existing `blender-heavy-motion.py --action-donor` composition
owner appends only `death`, with a matching bind rig. No procedural whole-kit
rebuild or new authoring/controller owner is introduced. The committed editable
Blend retains the action keys; the GLB and both generated candidate folders are
its fresh export/bake products.

Reproduction uses the existing owner with `--source` pointing at the12-action
source and `--action-donor death` pointing at frozen AQ's Blend, then runs
`node packages/soldier-assets/bake/heavy-kit.mjs`. The source donor's SHA256 is
`cbdeb8d6879c0607aaf173df4ba524a249ed427ed3e371651a2003a27e035300`.
The controls alongside this review retain exact source comparisons. No tangent
pinning is used; three primitives have natural fresh-export tangent-byte changes.
Prior-image parity therefore requires the main merged regression, not an
inference from geometry equality.

## Verification and limits

Native controls preserve all37 meshes, rig and old12 action keys exactly. The
composed native result also matches all13 AQ actions and geometry exactly.
GLB controls preserve old12 animation tracks, positions, normals, UVs, indices,
weights, material/image payloads and rig-related source controls; only the
appended action and identified tangent bytes differ. Bake/check, typecheck,
all13 bake test files and the existing four travel-helper tests pass. Initial
bake-suite failures were absent committed fixtures in the sparse checkout;
restoring those inputs made the unchanged tests pass.
The full web suite also passes382 tests. Independent read-only code review
reported no findings (session01a08040-7e89-7a90-928a-b2d95c087523); it explicitly
does not infer prior-image parity from source controls.

The actual decoded baked death is1.4seconds, nonlooping, and its terminal local
pose equals the sample five seconds later exactly. All169 quarter-frame imported
fitted-kit floor samples are nonnegative (minimum0.000000259m). This samples
vertices, not continuous triangle collisions or universally plausible support.
Known shoulder deformation, restrained/staged landing and contact-readability
limitations remain cosmetic follow-up, not a reason for another polishing loop.

The new `death-fall` sheet uses explicit dead life state through the existing
manual model fixture. Shared candidate sheets default explicitly to alive;
no action-name heuristic is added. The harness checks requested life state as
well as the submitted clip/phase. Existing sheets remain present and unchanged
in scope. This is source/manual-motion verification, not a new engine death
state or a claim that detailed live appearance binding is complete.

## Captured closeout

`VERIFY_GPU=1 VERIFY_URL=http://localhost:5484 SNAP=death-fall node web/scene.mjs heavy-kit`
passed capture21517 and immediate repeat98207:12 poses,27 checks, zero differing
pixels and no page errors. No prior baseline was updated. Both browsers closed;
the owning5484Vite was stopped. The active baseline is the existing heavy sheet
owner's `death-fall.png`; readable chronological bands are archived here.

Main and root inspected all12 poses. Complete body and kit render, and the finish
reads as fallen. Fresh neutral critique (session01a08044-427e-7f10-a707-914ac4469d4d,
terminal0) found no obvious detached limb, missing major surface, exploded
geometry or equipment separation. It records stiff/braced terminal posture,
unconvincing hooked/spread shield-hand contact and uncertain ground support.
These agree with the known cosmetic follow-ups; under the user's explicit
current-quality decision they do not trigger another polishing pass. Root
independently approved this usable retention after reviewing all three bands.
The sparse stills do not certify every intervening motion frame or impact timing.

## Change ledger

The existing candidate-sheet assertion additionally verifies explicitly requested
life state; old cameras default to alive, while the new death-fall camera requests
dead. The new sheet covers six points of the nonlooping fall from two bearings.
No existing assertion is loosened or prior baseline replaced. No simulation,
controller, appearance-state or material/shader behavior changes in this pass.
