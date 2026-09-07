# Signed motion observation

Simulation positions remain authoritative. The battle adapter preserves their
measured displacement in the soldier's presented facing basis so authored
protected travel can later distinguish backing away from ordinary forward travel.
This pass adds observation data only: action selection, clocks, clip bindings,
simulation state and rendering remain unchanged. It does not complete protected
travel animation or classify intentional travel versus knockback.

The owner is [BattleActionAdapter](../../../../../../web/src/battle/battleActionAdapter.ts);
the signed field contract lives in
[ActionObservation](../../../../../../packages/crowd-runtime/src/actionTimeline.ts).
Existing synthetic observations explicitly supply forward travel; they are still
synthetic, not measurements of a battle.

## Choices audit

- **Sound; high confidence — use the current presented facing.** When a held
  pike is displayed along its unit facing, a step is measured against that same
  facing, rather than the soldier's separately stored angle. The request specified
  presentation facing but left the lateral sign open: positive means right,
  negative means left. Future carry selection can interpret these fields directly.
- **Sound; high confidence — retain the observation window.** If a soldier moves
  between two reads, project that interval's net displacement against the current
  facing. This is an interval measurement, not an instantaneous velocity or a sum
  of distance traveled along a curved path. First reads, newly appended soldiers
  and resets yield zero; repeated ticks reuse the prior observation. Keeping the
  scalar speed calculation and sampling cadence preserves existing playback.
- **Sound; high confidence — required numeric fields.** All current producers
  provide the two components, avoiding optional data and a second fallback
  interpretation. No new state machine, helper layer, dependency or WASM export.

## Verification and review

The new direction test first failed against the unchanged adapter: expected
forward -4 m/s, received undefined. It passed after the actual observation builder
was wired. Focused Vitest run: 50 tests passed across battleActionAdapter,
actionTimeline, actionTimelineMounted and playbackPacking. Typecheck and focused
lint passed. Existing timeline/packing assertions and rendered submission tests
are unchanged; no image quality claim or screenshot baseline change is made.
No Rust source changed; tests reused the existing built WASM through an untracked
local symlink. Format/lint initially rejected parent-relative paths; running the
same pinned tools from the repository root passed.

Shape review retained one measurement owner and two plain fields. Diff review
confirmed the scalar arithmetic and selection branches are unchanged, and that
projection occurs after the held-pike facing override. Documentation review
kept rationale here; the integrating agent owns the parent spec's evidence link.

Integrated as `a56d108c`; the root worktree repeated all 50 focused tests and
typecheck successfully. A fresh independent reviewer found no actionable issues
and independently repeated the 50 tests. CLI review was attempted but could not
start: the installed CLI rejected the configured model as requiring an upgrade.
The fresh reviewer is the fallback, not a claimed successful CLI review.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| battleActionAdapter: motion retains forward and lateral signs in the presented facing basis | Direction absent; new assertion failed with undefined | Facing +y, displacement (+3,-4) over one second gives forward -4, right +3, speed 5; facing +x and moving +y gives forward 0, lateral -2 | Preserve signed physical travel, new coverage (moved). |
| battleActionAdapter: held pike motion uses the presented unit facing, returning to soldier facing for a sidearm | No signed observation coverage | +x motion with displayed +y pike facing gives forward 0/right 1; sidearm displayed +x gives forward 1/right 0 | Align observation with the actual submitted facing, new coverage (moved). |
| battleActionAdapter: observation histories survive append and memory growth, but reset on rewind or explicit identity reset | Scalar motion and identity/reset assertions | Same assertions, plus signed forward motion survives growth and all components are zero after append/reset | Apply existing observation lifetime to both new fields (moved). |

Other touched tests only fill required observation fields; no assertions or
expected playback changed. No unit stats, gameplay tests or golden hashes moved.
