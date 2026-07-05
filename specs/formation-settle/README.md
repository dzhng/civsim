# Formation settle: kill the never-settling churn

A halted formation must come to rest. Today three measured situations never
do — the sim carries standing limit cycles where a driving force never
reaches zero, so units mill, buzz, or slosh forever. This spec turns the
existing diagnosis into red gates, fixes each family at the force level, and
retires the probe file into pinned mechanics tests.

David's original report (2026-07-05): "after I tell the unit to go to a
place, sometimes once it reaches there, its lines shift left and right and
never settle — 1–2 minutes before it finally settles"; and "the same lateral
shifting during battles."

## The measured families (diagnosis complete)

All numbers from `crates/sim/tests/mechanics_settle_probe.rs` (print-only
probes, `--nocapture`), measured at 3d72b159..973ba374. Idle baseline: a
settled block reads **~0.018 m/s** mean soldier speed (deterministic fidget).

| # | Situation | Sustained state | Owner slice |
|---|---|---|---|
| A | Destination near impassable genmap geometry (seed-1 cliff pocket, margins 10–14m) | 1.7–2.4 m/s, 8–14m excursions, cohesion stuck ~0.08–0.15; margin 10 settles ~90s, margin 14 **never** (180s+) | 02 |
| A′ | Halted squeezed inside a marginal corridor (gap ≈ frontage, files_eff reduced) | 0.10–0.13 m/s buzz forever, cm amplitude | 02 |
| B | Destination frame overlapping a standing friendly block (2/5/10m overlap) | 0.06/0.11/0.21 m/s buzz forever, cm amplitude | 03 |
| C | Immortal 120v120 grind, 10+ min after contact | ~1.1 m/s mean, lateral ~0.63 m/s, 1.8–2.6m excursions, 70–86/120 men, forever | 04 |

**Cleared suspects** (all settle to baseline within one 10s window — do not
re-chase): plain/angled (20–60°)/pivot/frayed arrivals; rough patches, rough
edges, crossed rough strips (roughness only multiplies speed caps, and a cap
cannot move a halted man); adjacent group moves with normal 2m clearance;
spawn-in-place at the family-A pocket (the spot is march-order-dependent).

**Root shape** (force-trace attribution, family A): stragglers split from the
block by wall geometry sit ~60m from their slots; SlotPull + WeaveNet net
force stays nonzero at rest — the "equilibrium failures" signature in
[tweak-mechanics](../../.claude/skills/tweak-mechanics/SKILL.md). The
at-ease reform beat amplifies (re-sorts slots every 45 ticks while cohesion
< 0.9 → ~800 slot changes / 10s) but is NOT the root: disabling it left the
churn at higher speed. Family B is the steer-pass-vs-separation-solver limit
cycle already named in the first-principles backlog (Tier 2, "Limit cycles
damped, not killed") — the reversal-gated idle damp cannot reach it.

## Doctrine (inherited, non-negotiable)

- **Forces, never walls.** The fix is a driving force that goes to zero at
  equilibrium, not a clamp/flag/threshold that hides motion. Every candidate
  fix must name the force it changes and confirm that force ACTS on the
  churning bodies (trace it, don't infer it).
- **A root fix is contained.** The cleared-suspect telemetry above must stay
  at baseline, byte-similar. Golden should hold for slices 02–03 (its maps
  march units on open ground, no wall contact); if golden moves, find the
  leak before re-pinning — a deliberate re-pin needs a one-line cause in the
  same commit.
- Mechanics tests use IMMORTAL fakes, morale off, `micro_rough = 0` unless
  the subject requires otherwise; assert cohesion/speed/settle — never wins.
- One quantity, one measurement: the settle telemetry lives in ONE shared
  test-support module (slice 01), never re-derived per test.
- [debug](../../.claude/skills/debug/SKILL.md) for every red;
  [write-tests](../../.claude/skills/write-tests/SKILL.md) for the harness
  rules; [change-report](../../.claude/skills/change-report/SKILL.md) ledger
  at the end of any pass that moves a test.

## Slice graph

```
01-red-gates ──► 02-wall-split-equilibrium ──► 03-friendly-overlap-cycle ──► 05-close-out
                                    └────────► 04-grind-lateral-slosh ─────────┘
```

02 before 03: the families share the "unreachable target" root shape, and
the family-A fix may collapse part of B — re-run the B gate after 02 lands
before designing 03. 04 is independent of 03 but depends on 01's telemetry
module and benefits from 02's findings.

## Verification gates (standing)

- `cargo test -p sim --no-fail-fast` — trust the exit code, never grep.
- The slice-01 settle gates: red exactly where this spec says, green
  elsewhere. A new red anywhere else is a leak, not progress.
- Golden hash: expected to HOLD through 02–03 (containment signal). Any
  move is investigated first, re-pinned deliberately only with cause.
- Rebuild wasm before any browser confirmation (stale-binary trap).
- Final feel verdict (05): browser session on curated seed-1, move a unit
  into the cliff pocket margin ~14m — visually settles; plus a re-read of
  the standing vibes after re-bless if any moved.

## Non-goals

- No balance retunes; no stat changes. If a fix exposes a balance shift,
  record it for [balance-unit](../../.claude/skills/balance-unit/SKILL.md)
  and keep the physics.
- No renderer work. The flag/camera items from the same report shipped
  separately (b3ab921c, c13e60bb).
- Not a rewrite of the corridor machinery or `gang_cap` (backlog Tier 1
  items) — touch them only where a family's root demonstrably lives there.

## Next Agent Prompt

**Status 2026-07-06 (pass 5 + David's checkpoint): the original report is
browser-VERIFIED FIXED. David has ratified the remaining order — pick up
at 04.**

**Status 2026-07-06 (pass 6): SLICE 04 SHIPPED — the foundation pass is
done.** Both halves landed: the packed lateral friction (all stalled
foot, `fighting[i]` exempt so men trading blows keep full lateral
freedom, reversal judged on the trajectory frame) and the noise-gated
deep reform (a cadence beat with ZERO deaths since its own watermark is
permutation noise and is skipped; with casualties it is de-facto relief
and runs exactly as before — `deep_beat_dead_mark` exists because the
casualty column-close consumes `deaths_since_reform` between beats).
Grind rail 0.635 -> ~0.36 sustained (ceiling tightened 0.7 -> 0.5); rank
profile now monotone front-to-rear (0.80 fighting vs 0.04-0.08 standing,
was 0.89 front / 1.11 REAR). Full suite green incl re-pinned golden.

CHANGE LEDGER (pass 6, every moved test):
- golden 0xa12f53b1d6420bac -> 0x43d5c313ca408b69 (every contact scenario
  touched; deliberate, same commit).
- two_attacking_lines_hold_and_never_cross: pancake floor 0.45 -> 0.40.
  Sharp invariants (facing/gap/interpen) untouched and green; TRACE shows
  sustained depth ~0.50-0.55, the old floor caught one breathing trough.
- a_mortal_wrapping_line_backfills_casualty_tears: late transient rail
  5.5 -> 6.5 (blip peaks 6.2 then closes; final-gap invariant unchanged,
  measured 2.0m).
- survivability_scales_with_the_reference_stats: HP4 band -> 3.7-7.2
  (actual 6.87x), HP2 -> 1.78-2.8 (actual 2.65x) — the documented
  seated-front super-linearity, amplified by quieter lattices.
- a_walked_in_cav_sits_between_medium_and_heavy_foot: no-dominate rail
  0.85 -> 0.75 (actual 0.77, ladder still monotone). BALANCE DEBT: if
  walked-in cav reads too strong vs heavy in play, balance-unit pass on
  the sabre grind — never a physics exception.
- heavy_shields_make_phalanx_a_grind_not_a_deletion: REWRITTEN — the old
  heavy>=40 floor was certified cheese (it passed only because the
  phalanx's own zero-casualty reform beats churned its wall open every
  2s). New contract: intact wall wins near-untouched (phalanx >= 110),
  frontal sword press pays deletion-grade losses (heavy < 40).
  Counterplay is emergent: draw blood and the wall's next beat accepts.
- grind_lateral_slosh_bounded: ceiling 0.7 -> 0.5 (sustained 0.36).
- Vibe baselines re-blessed after frame review: the old heavy-both grind
  read as a C-shaped amoeba; the new one holds two coherent lattices on
  one seam. 4 scenarios (cav-v-pike-wall, heavy-v-archers, penetration,
  multi-penetration) were byte-identical — containment signal.

TASTE CHECKPOINT (non-blocking, frames opened via preview-shots): the
new grind look (front fights, rear stands) and the intact-pike-wall
frontal verdict are presented to David; evidence strongly favors both
(the vibes read as formations, and the wall behavior is historically
sound). Veto path: revert the re-bless commit and reopen slice 04.

Remaining: 03b (anchor deconfliction, David's direction), 02b-2 (last,
droppable), 05 close-out.

DAVID'S DECISIONS (2026-07-06, verbatim intent):
1. **04 foundation pass: GO.** Run it as the deliberate pass this README
   describes: the parked friction widening PLUS the deep-reform relabel
   churn, expect golden + battle-shape pins to move — re-derive each with
   provenance and a one-line cause, film the before/after grind vibes,
   and present the jostle level as a non-blocking taste checkpoint
   (frames via preview-shots, ~5 min window, then decide on evidence and
   record here).
2. **03b: GO**, with David's design direction: "soldier anchors should
   not overlap any other soldier — meaning soldiers will always settle
   at some point." I.e. make the resting TARGET GEOMETRY itself
   conflict-free (a slot/anchor another body occupies is not a valid
   rest target; deconflict at assignment/frame level) instead of gating
   pulls — then every pull reaches zero naturally because every target
   is occupiable. Treat that as the primary candidate; a better
   mechanism is allowed if the evidence convicts one, but the three
   pull-gating variants in the notes below stay banned re-entries.
3. **02b-2: LAST, droppable.** If the corridor fix keeps breaking other
   things, close it as a known limitation in 05 instead of forcing it.

Feel-check (pass 5, real game build, seed-1 gen map, 350-man units,
sim-time driven via advance()): a 35-degree 60m move order settles to
0.0035 m/s — statue-still — by ~60s after arrival where it used to churn
for minutes (`assets/feelcheck3-u0.png`: dressed block, banner centered).
BUT a unit ordered 8m into a standing friendly's flank NEVER settles at
game scale (~2 m/s indefinitely, `assets/feelcheck3-u1.png`: two
interleaved blocks) — the parked 03b family is much louder at 350-man
scale than the cargo 120-man/10m gate suggests. When 03b is picked up,
re-pin its gate at game scale (350 men, wide-frame overlap) and treat
the at-ease-reform relabel storm as a co-suspect with the weave rest
shape (motion ~2 m/s = men WALKING to reassigned slots, the same transit
signature as the 04 deep-reform churn).

Slice 04 findings (attribution probes committed;
`probe_grind_lateral_by_rank` + `probe_trace_grind_lateral_forces`):
- CONVICTION: rank 5 of an immortal grind carries MORE lateral speed
  (1.114 m/s) than the front rank trading blows (0.888) — flat-to-rising
  rear-ward profile = lattice ringing, not combat jostle. Channels:
  PivotSpring, CompPush, WeaveNet dominate the lateral budget, capped by
  SpeedCap.
- FIX CANDIDATE (WORKS, PARKED): widen the pike lateral friction to all
  packed foot — drop `strict_formation()`, key on MEASURED advance
  (`mass_advance < charge_spent_speed`, replacing the `order_advancing`
  OrderMode gate per the Move==Attack litmus), judge the lateral reversal
  in the trajectory frame (`last_disp`, not steer-only kin_v). Restores
  the physical profile: rank 5 -> 0.105, rank 4 -> 0.289, front keeps
  0.70 of honest jostle. Diff: `assets/slice04-friction-widening.diff`.
- WHY PARKED: sweeping footprint — golden moves (every stalled melee is
  touched), `ai_battle_resolves_with_pinned_scale_shape`,
  `light_horse_tramples_at_a_third_the_butchery`, and the grind rail all
  red. The rail WORSENED (0.635 -> 0.777) while the profile improved:
  quieting the rear EXPOSED the engaged-deep-reform churn — slot_changes
  in the grind went 30 -> ~400/window, the reform beat now relabels
  against the front's slow shear every cycle and men take visible
  sideways WALKS to new slots. That transit churn is plausibly the
  battle-time "lots of shifting left and right" David reported, and the
  rail metric conflates it with oscillation. The 04 finish must treat
  BOTH (friction widening + deep-reform churn) with per-pin provenance,
  vibe frames, and David's taste checkpoint — a foundation-style pass.

Pass 4 root fix (orchestrator, after a codex negative result steered it):
**the idle settle damp's oscillation detector was measuring the wrong
frame.** It watched `kin_v` (steer-only, captured before the separation
solver), so any limit cycle closing THROUGH the solver — steer onto an
occupied spot, get shoved back — never looked like a reversal. The damp
now fires when the steer resists the last TRUE step (total displacement,
solver included) AND the trajectory carries no sustained drift (a ~0.5s
EMA projecting to < half the instantaneous step — a shape factor, no
magnitude knob). Three gates triangulated the detector; each frame
variant alone failed one of them: steer-vs-total ate the resistance
spring of a steadily PUSHED block (`an_advancing_block_compresses_...`
red); total-vs-previous-total missed the ~1s standing sway at the wall
(`settle_with_frame_slots_in_wall` red); resist+no-drift passes all
three. Killed the friendly-overlap buzz at 2m and 5m — gate
`settle_overlapping_friendly` live and green, both units asserted.

03b REMAINDER (`settle_deeply_overlapping_friendly`, 10m, ignored/red):
three measured NON-fixes, do not retry them — (a) occupancy-zeroing the
slot pull with a 3m floor: buzz 0.082; (b) with a body-width floor:
0.373 (the floor is a flapping gate — the pull toggles as men drift
across it); (c) floorless: 0.59 (removing the counter-anchor lets the
weave net drape the sheet deeper into the friend). The root is the weave
REST SHAPE: the displaced men's bonds demand they stand inside the
friend, so nsum re-feeds the solver regardless of slot gating. The fix
direction is bond rest lengths that accommodate obstruction (compress at
sustained contact) — a real weave design change; instrument first.

Codex slice-03 exec returned NO diff by its own stop-rule (correct
behavior): its evidence showed slot-pull zeroing insufficient, which is
what redirected the design to the damp frame.

Pass 3 (orchestrator fixup, not codex): the margin-10/12 burst cycle was
NOT the escape-slide/corridor oscillating — the 1s-resolution film
(`probe_burst_second_by_second`) showed the anchor frozen and files_eff
constant through every burst, cohesion crashing BEFORE any slot relabel
(the reform storm is a response, not the trigger). Root: the halted-frame
achievability slide sampled every THIRD slot (`step_by(3)`) and both
in-wall slots dodged the stride forever; their two men jittered against
the wall and periodically resonated the standing lattice. Fix: the slide
checks EVERY slot. Gate `settle_with_frame_slots_in_wall` [10,12] now
live and green.

CORRIDOR REMAINDER (`settle_inside_marginal_corridor`, still ignored/red):
slots are legal-but-body-tight (edge torsos clip the wall ~0.15m; frame
rests offset 0.6m in a gap with no body slack; nothing re-centers a
fitting-width frame at rest). BANNED RE-ENTRY: subtracting body radius
from `update_corridor`'s measured span — tried in pass 3, it flips the
rest state to target<files which activates the centering shift every
beat and the frame CRAWLS sideways forever (1.8 m/s, anchor_lat +2.5m
per window, worse than the buzz). The fix must give a RESTING frame a
stable centered pose (or narrower width) without turning the per-beat
centering nudge into a treadmill — instrument the centering/np-projection
loop first, and expect to touch how `update_corridor`'s shift interacts
with a halted frame, not the width formula alone.

Slice 01 (tests-only, codex): settle telemetry owned by
`crates/sim/tests/common/settle.rs`, gates in
`crates/sim/tests/mechanics_settle.rs`. `SETTLE_SPEED = 0.06`, within 20s
(30s for the family gates). Run remaining reds with
`cargo test -p sim --test mechanics_settle -- --ignored`.

Slice 02a (sim source, codex): the wall-split tractor is dead. Weave/pivot
bonds skip when stretched > rest+2m AND the segment crosses impassable
ground (`Terrain::segment_passable`); a slot > 3m away whose straight
segment is blocked stops pulling (the man stands; cohesion honestly reads
him missing). Cliff margins 12/14/18 settle to baseline in one window
(was 1.7 m/s forever); force nets collapsed ~100x (WeaveNet (+49,+385) →
(+0.03,-0.05)). Gate `settle_near_impassable_pocket` [14,18] is live.

RESLICE during pass 2: the old margin sweep bundled two mechanisms.
Margins 10/12 with slots ON impassable/slow cells (measured margin 10:
blocked=2 slow=6) churn EPISODICALLY (quiet stretches + bursts with
cohesion crashes and slot-change spikes ~170/10s) — that is the
frame-level escape-slide/corridor/reform interplay, now the **02b** gate
`settle_with_frame_slots_in_wall` [10,12], ignored alongside
`settle_inside_marginal_corridor`. Corridor ledger evidence (committed
attribution probes): zero separation-solver records, edge files carry
2.3x force, IdleSettleDamp constantly firing — terrain family, not 03.

Pick up at 02b: the design question is what the FRAME does when its
resting slots are unstandable or wall-tight — the halted-frame escape
slide (sim.rs "slides itself clear", 0.45m steps every 15 ticks), the
corridor width machinery, and the at-ease reform each pull it a different
way. Instrument the margin-10 burst cycle first (force-trace + files_eff/
anchor over time through one burst), convict the oscillator, then fix
THAT. Known limitation to preserve, not fix here: a wall-lost straggler
stays lost until re-ordered (acceptable; a new order re-paths the unit).

Carried-in red (NOT ours): `force_trace_smoke_covers_expected_channels`
fails at HEAD (missing CorridorClamp in its open-ground scenario) — the
feature-gated force-trace suite is not in the default run; predates this
spec. The conservation test that matters
(`force_trace_steering_conserves_pre_collision_displacement`) is green
with 02a. Also: `codex review --uncommitted` cannot start its app-server
inside the workspace-write sandbox — review from the orchestrator side.

You are running one pass of
[implement-spec](../../.claude/skills/implement-spec/SKILL.md) on this spec.
Read [tweak-mechanics](../../.claude/skills/tweak-mechanics/SKILL.md) and its
first-principles backlog BEFORE touching sim code — this spec is an
instance of its "equilibrium failures" and "limit cycles" sections, and its
containment/provenance rules are the acceptance bar here.

1. Run `cargo test -p sim --no-fail-fast`. Account for every red: it must be
   either a slice-01 gate that is red by design (listed in the slice file)
   or carried-in at HEAD (prove with `git stash -u` + rerun).
2. Pick the first unchecked TODO below. One coherent pass per run: usually
   one slice, or one measured sub-step of 02 (it is the deep one).
3. Follow the slice file. Trace before theorizing: the force-trace harness
   (`--features force-trace`) is the ledger; the probe file's helpers
   (`window_motion`, `audit_slots`, the ASCII map) are your instruments
   until slice 01 promotes them.
4. Before committing: `cargo fmt`, full `--no-fail-fast` run,
   [refactor-clean](../../.claude/skills/refactor-clean/SKILL.md), then a
   review pass. Ship a [change-report](../../.claude/skills/change-report/SKILL.md)
   ledger in the pass summary if any test moved.
5. Update THIS section before ending your pass: status date, what landed,
   next pickup point, any new trap you hit. Reslice instead of broadening a
   patch — if a fix wants to touch a second family, stop and update the spec.

Human checkpoints are **non-blocking**: state the decision + options in the
pass summary, wait ~5 minutes, then decide on the evidence, record the
rationale here, and continue. Never idle waiting for sign-off.

### Global TODO

- [x] 01 — Red gates: promote settle telemetry into `tests/common`, pin the
      cleared suspects green, pin families A/A′/B/C as gates (red today) →
      [slices/01-red-gates.md](slices/01-red-gates.md)
- [x] 02a — Wall-split tractor: bonds/slot-pull zero across impassable
      ground → [slices/02-wall-split-equilibrium.md](slices/02-wall-split-equilibrium.md)
- [x] 02b-1 — In-wall slots: achievability slide samples every slot (gate
      `settle_with_frame_slots_in_wall` green)
      → [slices/02-wall-split-equilibrium.md](slices/02-wall-split-equilibrium.md)
- [x] 03 — Grazing friendly overlap (2/5m): damp reversal judged on total
      displacement (solver included) → [slices/03-friendly-overlap-cycle.md](slices/03-friendly-overlap-cycle.md)
- [x] 04 — SHIPPED (pass 6): packed lateral friction + noise-gated deep
      reform; ledger in the Next Agent Prompt; taste checkpoint presented
      → [slices/04-grind-lateral-slosh.md](slices/04-grind-lateral-slosh.md)
- [ ] 03b — Deep overlap (David: GO, anchor-deconfliction direction; re-pin
      the gate at game scale — 350 men, wide-frame overlap)
      → [slices/03-friendly-overlap-cycle.md](slices/03-friendly-overlap-cycle.md)
- [ ] 06 — Run to contact (David, 2026-07-06): armies that run at each
      other must ARRIVE FORMED (catch-up surge escapes the personal
      ceiling / formation paces to its slowest; the scatter screenshot)
      and ARRIVE FRESH (foot ~50% stamina at map-mid, cav ~75%, most
      drain in-battle; today the run empties the tank)
      → [slices/06-run-to-contact.md](slices/06-run-to-contact.md)
- [ ] 02b-2 — LAST, droppable (David). Corridor rest pose; naive
      radius-in-width is a banned re-entry (centering treadmill). Gate
      `settle_inside_marginal_corridor`; if it keeps breaking things, close
      as a known limitation in 05
      → [slices/02-wall-split-equilibrium.md](slices/02-wall-split-equilibrium.md)
- [ ] 05 — Close-out: retire the probe file, browser feel-check, vibe
      re-bless if needed, ledger, then
      [close-spec](../../.claude/skills/close-spec/SKILL.md) →
      [slices/05-close-out.md](slices/05-close-out.md)

## Provenance

Diagnosis ran in the 2026-07-05 session that shipped the probe file
(973ba374): repro sweep (straight/angled/pivot/frayed/rough/corridor/
genmap/overlap/grind), force-trace attribution, and the at-ease-reform
disable experiment. The write-spec three-draft fan-out was deliberately
skipped: the slice cut maps 1:1 onto independently measured failure
families, and the diagnosis session already did the recon a blind draft
would redo. The genuine open design question — which force closes each
family — is exactly what slices 02–04 are shaped to answer one at a time.
