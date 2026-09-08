# Live completed-interval consumer

The approved policy is the slice's **Next live consumer pass** (`f06a0260`).
This candidate replaces residual root easing; it does not layer another smoother
over it. The existing clock and reviewed timeline remain the only time/action
owners. The [held comparison](held/review.md) and [moving film](film/review.md)
record causal clock checks and limited visual retention. The newly scoped
body-region normal comparison passes on both frozen arms; HUD/full-frame repeatability and
final soldier-art acceptance are not claimed.

## Scope and ownership

BattleCrowd retains one pair of copied observation endpoints. Roots and facings
interpolate over the observed interval, while body metadata switches at its right
boundary. New append entries have no invented past. Catalog replacement, rewind
and shrink anchor the entire presentation together. Freeze samples the endpoint
without altering retained history.

The frame-local presented arrays feed selection rings and existing unit
centroid/standard consumers. They are read-only by convention and reused on the
next draw; they are not persistent playback snapshots. The renderer receives
matching pose/root/life inputs, so its existing terrain and visibility consumers
need no new history. Chip metadata is copied per observation with unit state.

Commands, formation previews, debug cues, camera/environment clocks and detached
projectiles remain authoritative/current. Projectile history is not available in
this bounded soldier view. Uniform batched travel cannot reconstruct hidden
starts/reversals, collisions or self-propulsion; disabled-to-enabled transport can
deliberately have no preceding gait. This is not full-scene temporal acceptance.

Implementation choices within the approved policy: retain copied unit-info
records rather than duplicate a chip schema; copy endpoint observations rather
than retain caller-mutable references; keep render arrays reusable. Selection
rings traverse soldiers once with selected-unit membership, rather than scanning
every soldier once per selected unit. No new engine field, per-bone capture,
asset flag, clock or generalized history was added.

## CPU verification

From `web/`, `./node_modules/.bin/vitest run` passed **374 tests / 61 files** including
the additional appearance-boundary tracer;
`./node_modules/.bin/tsc --noEmit` exited 0. This lane contains e94's timeline and
the f06 policy; root's independent manual-life test is not in this count.
These CPU results alone make no GPU, baseline or live art acceptance claim.

The tests use a real WASM Game/memory boundary, actual adapter/timeline/crowd,
unit presentation, orders and clock. Controlled exported observations isolate
presentation arithmetic; they are not assertions about simulated collision
outcomes. The GPU edge records submissions. The culling test feeds those
submissions through the actual instance builder and projected visibility owner.

Original-code reds: the four-tick fixture produced root **0.0975015312 m** rather
than **0.1166666667 m**; the selection ring was **4 m** while its body was **1 m**
(destination correctly **20 m**). Both passed after replacing their old owner.

[Restored deliberate mutants](mutants.txt) all exited 1:

- Future timeline sampling: phase **0.0882352941**, expected **0.0686274510**.
- Latest body metadata: delayed alive **0**, expected **1**.
- Latest unit metadata only: chip **ROUT**, expected **ATK**.
- Freeze discarding history: unfreeze root **0.0333333351 m**, expected
  **0.0166666675 m**, with facing/phase also incorrectly stuck at the endpoint.

## Change ledger

All new tests below are in `web/tests/battleCrowd.test.ts`. Values come from
controlled inputs/assertions or the recorded red/mutant runs, not image quality.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `live crowd uses one completed batch for root and measured gait at fractional time` | Original root 0.0975015312; future-sample mutant phase 0.0882352941 | Root 3.5/30 m; gait phase (3.5/30)/stride; standard at same root | One observed interval owns all three samples. **moved** |
| `selection rings follow the presented body while destination cues stay authoritative` | Rings [20,4] m | Rings [20,1] m; command target remains 20 m | Only body-attached ring inputs use presented geometry. **moved** |
| `attached standards, chips and attack arcs keep preceding life and weapon until the endpoint` | Latest-metadata mutants give alive 0 or ROUT before endpoint | Alive 1, ATK, standard/arc x=1 before endpoint; no standard at dead endpoint | Discrete body and unit metadata use matching history; no current-centroid fallback. **moved** |
| `real clock pause and freeze preserve the same delayed roots, facing and local pose` | Freeze-history mutant remains at root 1/30, facing -3.04159 after unfreeze | Delayed root .5/30 and shortest-arc π facing restored exactly with pose; pause and same-tick source mutation do not move them | Freeze is an override, not a history update. **moved** |
| `a disabled left boundary transports the body without inventing gait before recovery` | No live-consumer coverage | Root 3.5/30 with prior rest clip; recovery starts gait at 0; subsequent enabled interval counts .5/30 before final disability and 1/30 at endpoint | Exercises approved disability policy through the actual crowd submission. **moved** |
| `append anchors only new soldiers while catalog replacement, rewind and shrink reset atomically` | No combined attached-consumer lifecycle coverage | Existing x=1 retained on append, new x=20 anchored; replacement x=9, rewind x=12, shrink x=15 with reset phase; no standard for absent soldier | Root and timeline share first-known boundaries. **moved** |
| `production instance seating and visibility consume the delayed root, not the outside endpoint` | No live-root-to-visibility coverage | Presented x=1 / elevation=.1 visible; authoritative x=20 outside | Existing terrain/visibility owners consume submitted geometry. **moved** |
| `a newly selected direction cannot retroactively change the preceding gait stride` | No actual crowd unequal-stride coverage | Preceding march stride owns elapsed 29.5/30 s; endpoint transports normalized phase to distinct directional stride, which owns the next interval | Reuses reviewed timeline ownership, not final-direction backdating. **moved** |
| `equipment and death switch at the same endpoint as facing, root and attached metadata` | New coverage; deliberately bypassing completed history produces appearance18 before endpoint | Before endpoint: appearance3, alive1, root1, facing.3, standard1; endpoint: sidearm18/death phase0, alive0, root4, facing1.2, no standard; unfreeze restores earlier output | Real phalanx equipment switch confirms e94 retains old completed appearance before resetting current history; no production correction required. **moved** |
| `production crowd preserves delayed positions across append and resets playback on catalog replacement` (`web/tests/battleActionAdapter.test.ts`, renamed from `smoothed positions`) | Integral samples x+.75, append x+.75, next x+.82 | x, append x, next x+1; same append/new-root/catalog/rewind assertions retained | Approved replacement of residual easing by delayed interpolation. **moved** |
| `held(ctx)` in `web/scenes/battle/battle-delayed-root-phase.mjs` | Original freeze/unfreeze kept the authoritative endpoint instead of restoring the fractional root | Candidate restores identical root, facing, pose and attached inputs; fixed-world-time causal frame is pixel-exact | Same completed history survives the freeze override; ordinary environment time remains current. **moved** |
| `motion(ctx, kind)` in `web/scenes/battle/battle-delayed-root-phase.mjs` | Exploratory full-frame B repeat had 40 failures confined to 11 static HUD pixels; no prior committed live-region gate | New explicitly named fixed body-region targets pass 128/128 per arm at zero pixels, with complete original traces unchanged | Approved scope excludes HUD rather than loosening existing gates; source/layout causes were falsified, compositor mechanism remains unproven. **moved** |

## Review status

Shape/diff self-review: existing root and attached consumers changed in place;
obsolete easing and selection-only soldier-range dependency removed. No parallel
renderer or history module. Independent CLI review (session
`01a07fd3-2b9c-77b1-9559-bbf5e3039fe0`, terminal 0) found no actionable
regressions and independently passed the 19 focused crowd/adapter tests plus
TypeScript. It did not verify browser visuals. Its exact final verdict was:
"No actionable regressions were identified in the changes. The 19 focused crowd
and adapter tests and TypeScript checking passed; browser visuals were not
verified." Full transcript remains in the isolated worktree's ignored
`throwaway/live-consumer-review/independent-review.txt`.

Final independent code/scene review (`01a08018-bc6c-7fc2-ac3b-0b2574f0182f`,
session 56763, terminal 0) found no actionable correctness or shape issue in the
completed-interval alignment, attached metadata, lifecycle boundaries or crop
plumbing. It independently passed 20 focused CPU tests and TypeScript. It did
not run a browser, benchmark or PNG inspection; those claims remain in the
separate visual leaves. Transcript: `throwaway/live-consumer-review/final-review.txt`.

### Local decision audit

All motion/time choices are already banked in f06. The least-confident remaining
implementation choice is keeping the whole existing unit-info record. When a
unit changes from attacking to routing, the old record keeps its old chip until
the presented endpoint. A hand-selected list could store fewer numbers, but
would duplicate the chip reader's field list and risk omitting a future chip.
This is **sound, medium confidence**: bounded per-unit storage with no new schema;
future readers must still distinguish delayed attached metadata from live orders.

The immediately following selection-ring draw receives the same reusable arrays
as the body renderer, not another calculated position and not a durable snapshot.
A later frame overwrites them. This is **sound, high confidence** for the existing
synchronous draw chain; any future asynchronous consumer must copy what it keeps.
Root owns global handoff prose and the browser queue.

### Appearance-boundary follow-up

Root raised a possible old-metadata/new-appearance mismatch. The new real
phalanx consumer tracer passes on unchanged production: completed history keeps
appearance3 before the endpoint, and current history resets to sidearm18 only at
the endpoint. A [negative control](appearance-mutant.txt) removing retrospective
history selection failed with appearance18 instead of3. That mutation was fully
restored; the timeline has no net diff. Facing, position, weapon, alive and
standard visibility change together in the same controlled interval.

No right-hand alpha clamp was added. For finite nonnegative battle time scales,
SimClock either subtracts the accumulated whole ticks, leaving a remainder in
[0,1), or hits its frame cap and sets the remainder to0. Pause/freeze preserve
that already bounded remainder. Live controls select1× or3×; there is no second
alpha producer needing a defensive presentation policy.
