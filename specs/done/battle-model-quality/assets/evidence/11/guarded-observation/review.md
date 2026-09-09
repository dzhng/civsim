# Guarded-facing observation — numerical seam only

This pass exposes engine-selected posture evidence through the real battle
adapter. It does **not** implement protected action selection, clips, stride
rhythm, or runtime promotion. Existing action priorities, timing and rendering
remain unchanged. No new gameplay state, order, save field or raw timer/momentum
export was added.

## Contract and choices

- `routing` reuses the existing packed unit-info value.
- `incapacitated` reads the existing `stun > 0 || trampled > 0` predicate through
  `Sim::incapacitated`; it is the current condition, not a record that steering
  ran. A timer can expire in a step whose ordinary steering was skipped. The
  expiry boundary is tested explicitly.
- `guardedFacing` records the selected facing owner. `update_unit_motion`
  clears its observation before all branches. Near-threat drift and locked
  contact retain protection; Disengage and automatic-evade drift remain
  eligible while their retained facing is nonforward. These escape branches
  turn gradually, and must not require an acquired soldier target. Alert
  waiting/standing inherits the held formation front. Ordinary free pivot,
  final-facing pivot and arrival early return do not assert this observation.
- `soldier_facing` records live-target and recent-hit facing; unit-facing and
  idle-glance branches inherit the unit observation. The velocity-facing branch
  does not. Soldier observations clear before every steering pass, including
  dead, stunned, bowled and routing early returns. Fresh soldiers initialize to
  zero; exported dead soldiers are zeroed. The adapter selects the unit bit for
  a held pike, because that is the actual displayed-facing override; sidearms
  return to the soldier bit.
- One presentation-only byte per soldier crosses WASM: incapacitated, soldier
  facing, unit facing. It is filled during the existing unit-info refresh and
  read without allocation by the pointer getter. No packed unit-info offsets
  moved. The engine observes branches without reordering any numerical
  movement/facing operations.

Future protected-pose eligibility is alive, not routing, not incapacitated,
guarded facing, and measured backward/lateral displacement in that displayed
basis. There is deliberately no direction threshold, clip binding, or selection
helper in this pass: those need authored clips and their own selection review.
Ordinary forward travel still uses existing locomotion.

The first proposal incorrectly considered excluding Disengage and carried
momentum. Source review and orchestration rejected both: withdrawal can be
legitimate guarded travel, and carried momentum alone is not
a locomotion veto. The subsequent [controlled drive investigation](../drive-observation/review.md)
shows that the earlier assumption of continuously additive momentum is false on
the normal steering path; it must not be subtracted to infer voluntary movement.
Even the existing `kin_v` can include momentum, while steering
velocity can include pressure. A conscious displaced soldier can appropriately
hold protection, but this evidence does **not** establish self-propelled
backpedalling or the correct gait rhythm during a shove. That is the next
explicit motion requirement, not an implicit claim of these booleans.

## Verification and review

Commands run from repository root unless marked `web/`:

```sh
cargo test -p sim --lib
cargo test -p sim --test golden
cargo test -p campaign --test save_load
cargo test -p game-wasm --lib
cargo check -p game-wasm
# web/
bun run build:wasm
bun run test tests/battleActionAdapter.test.ts tests/actionTimeline.test.ts tests/actionTimelineMounted.test.ts tests/playbackPacking.test.ts
bun run typecheck
```

Sim library: 12 passing tests, including four new branch/reset tests. Golden
state remains `0x46c3732a78dc549c`, without changing the expected hash. The
campaign deterministic save/load roundtrip passes; battle simulation objects
are not serialized into that save schema, which is untouched. All five native
WASM library tests pass, including the new buffer test. WASM rebuild and
typecheck pass. All 52 focused browser-library tests pass, preserving existing
timeline/packing behavior. No screenshot acceptance is claimed or needed for
this observation-only change.

Changed-file TypeScript lint passes. Repository-wide `bun run lint` remains red
on two unchanged unused imports (`THREE`, `bakeLocalAnimation`) in
`web/scenes/models/battle-model-palette.mjs`; both exist at this branch's parent.
`codex review --uncommitted` was attempted but CLI 0.144.4 rejects the configured
gpt-6-astra model as requiring a newer CLI. The orchestrating main agent reviewed
the full production diff independently as the authorized fallback: no concrete
correctness finding, with requested fresh-spawn and expiry evidence added.
Refactor/code/docs review retains one packed observation seam, no speculative
clip API or duplicate mechanics predicate in TypeScript.

Parent merged verification after rebuilding its own WASM: all 12 sim library
tests, unchanged golden-state test, five native WASM tests, deterministic
campaign save/load test, all 52 focused web tests and typecheck pass. The parent
also independently reviewed the final adapter test diff, including real
targetless withdrawal and facing-owner switching. No protected clip or action
selection has been promoted by this verification.

## Change ledger

- New withdrawal branch test: previously unobserved; now records targetless
  retained-facing retreat and reset on another branch.
- New threat-drift/locked-retreat/free-pivot/evade test: previously unobserved;
  now distinguishes existing controller branches, including ordered run whose
  engine movement is a walking drift.
- New soldier-facing test: previously unobserved; now pins live-target,
  recent-hit, inherited-unit and velocity-facing outputs with unchanged angles.
- New disabled/routing/dead test: previously unobserved; now pins clearing and
  the timer-expiry distinction without changing timer behavior.
- New native WASM buffer test: previously absent; now pins current timer packing,
  fresh-spawn initialization, pointer ownership and dead clearing.
- Extended held-pike adapter test: previously checked signed-facing basis only;
  now also checks that posture follows that same owner after switching weapon.
- New adapter transport test: previously absent; now preserves routing,
  incapacitation and guarded facing independently alongside negative travel.
- New real-engine adapter test: previously absent; now executes targetless
  withdrawal through generated WASM without synthetic posture bits. Initial
  1v1 probing encountered the engine's automatic rout for remnants of nine or
  fewer, so the fixture uses the smallest non-remnant ten-man formations, far
  apart. It verifies withdrawal rather than accidentally testing rout.
- Existing timeline/packing tests and synthetic replay fixtures only receive
  explicit false observation defaults; their selections and phases do not move.
