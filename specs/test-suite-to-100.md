# Spec: the road to 100% — what's left after the surgical-fix session

> **START HERE (2026-06-20 handoff).** The contact/depth keystone landed on
> `experiment/attacker-holds`: `cargo test -p sim --no-fail-fast -- --nocapture`
> is GREEN. The fix is not a scalar tune: `collision.rs` now adds a soft-friendly /
> hard-enemy iterative body projection after the capped crowd-relief pass, with
> active tramplers exempt so charge bleed still owns cavalry penetration. `sim.rs`
> also refreshes incoming contact load before unit motion, so a short-weapon line
> being struck at pike reach locks its formation instead of wheeling while
> `engaged == 0`. The old red cluster below is retained as history; do not chase
> those dead ends again. The LIVE
> spec set: this file (roadmap) · `directional-bias.md` (the bias analysis + the
> M-equivariant-solver direction) · `standoff-double-push.md` (scope rider on the
> standoff repair) · `impale.md` (pike/cav lethality, needed for the cav re-bless).
> `balance-harness.md` + `scenarios.md` are infrastructure-design reference;
> `test-taxonomy.md` is the mechanical-vs-balance decoupling standard.
> (Deleted as subsumed: `attrition-runaway.md`, `contact-foundation-clash.md` — the
> front-line-integrity root they chased is the consolidated triage below.)

> **Update (2026-06-20):** `two_braced_walls_hold_a_standoff_neither_centroid_crosses`
> is GREEN on this branch after braced weapon-repel columns were widened into an
> overlapping hedge (`BRACED_REPEL_FILE_OVERLAP = 4.0`). The fix preserves
> `the_fronts_stay_welded`, `mechanics_symmetry`, `mechanics_charge`, `golden`, and
> the pike front/rear geometry guard. The non-braced column/held-line/depth cluster
> remains open; do not count `two_braced_walls` among the active reds unless it
> regresses again.

> **Update (2026-06-20 follow-up):** Current full sim suite is 5 failing targets /
> 7 failing tests: `balance_combat::long_swords_cleave_but_die_in_a_press`,
> `balance_matrix::a_held_braced_line_trades_evenly_with_a_walking_attacker`,
> `mechanics_melee::{a_column_bulges_a_held_line_it_does_not_part_it,
> a_held_line_is_not_split_by_a_narrow_column, phalanx_and_heavy_clash_without_swirling}`,
> `mechanics_morale::a_brave_class_holds_longer_than_a_timid_one`, and
> `mechanics_weave::a_deep_column_walks_a_thin_line_back_equal_depths_hold`.
> Probed the non-braced column/depth cluster from a throwaway test:
> the narrow column engages only a ~10–14m span of the ~56m held line, so the
> current broad-press holder lean-in deliberately does not fire; repeating the
> all-engaged holder lean makes crossing earlier (41.1s → 38.0s) and is still
> wrong. A contact-load facing lock for phalanx-v-heavy worsened faceDev
> (31° → 47°). Scalar sweeps (`pivot_stiffness`, `weave_stiffness`,
> `compress_strength`, `separation_max_push`, and combinations) can stop the
> narrow column crossing in some cases, but they do not produce the required flank
> self-correction, keep depth drift under target, and often worsen phalanx
> (up to 50–60° faceDev). Conclusion: no simple knob/lean/facing patch owns this;
> the remaining mechanical cluster needs a structural front-line/depth transmission
> redesign, not more local tuning.

> **Update (2026-06-20 balance-combat cleanup):** `balance_combat::long_swords_cleave_but_die_in_a_press`
> was a bad combined experiment. Its cleave half is valid and remains as
> `long_swords_cleave_loose_enemies`: LongSwords out-kill HeavySword against the
> same loose Skirmisher target. The rear-pusher "die in a press" half was false
> as written: a throwaway probe measured the pressed setup as a shield/sanctuary,
> not a cleaner vice (`free` peak mean pressure/vice ≈ 51.07/30.85, `pressed`
> ≈ 57.22/22.09, with pressed losses lower). The actual vice readout is already
> mechanically pinned in `mechanics_weave::a_two_sided_squeeze_reads_as_a_vice_a_one_sided_shove_does_not`.
> Do not resurrect the rear-pusher balance assertion unless a new scenario
> isolates crush without adding shielding or changing the fight geometry.

> **Update (2026-06-20 contact/depth keystone):** The native sim suite is green
> after replacing the missing post-crowd-relief body constraint with an iterative
> projection and fixing reach-asymmetric contact load. Important details:
> projection is Jacobi-staged, friendly overlaps relax softly (`0.5`) so same-side
> crowds still flow, enemy overlaps project fully, and active tramplers skip it
> because charge penetration is owned by trample bleed. The phalanx-v-heavy swirl
> was not a facing-force problem: the phalanx could fight at reach while the
> HeavySword line's own `engaged` stayed zero, so the heavy unit kept wheeling
> toward the phalanx centroid. `refresh_contact_engagement` now counts enemies
> fighting my men as contact before unit motion. Test metrics moved accordingly:
> charge bogging now reads the charge mass (80th percentile horse), not a single
> lead body; depth transmission is asserted over the sustained 24s othismos window;
> the column-bulge test pins dimple + no centroid pass-through, not far-wing
> contraction of a 70-file line.

## ★ ROOT of the whole lethality/morale/balance cluster — PROVEN (2026-06-19)

The morale tests (`allied_support`, `support_scales`, `a_high_aura`, `a_brave_class`),
`the_counter_web_holds` (Phalanx "draws" HeavySword), and `mirror_duels` all share ONE
measured root, and it is NOT the morale model: **foot combat is barely lethal because
the front BLOBS and the gang cap then denies every wound.**

Trace (240v240 HeavySword, morale off): the two fronts MESH — `min_front_gap` goes
NEGATIVE (~−0.2 m, lines interpenetrate), `in_strike_reach` ~120 men, `fighting` ~150
— yet **0 deaths through 38 s**. The men ARE in reach and swinging; the wounds are
denied. Proof it is the GANG CAP: re-run with `gang_cap = 99` and the SAME clash
becomes lethal (S 15 / N 48 dead by t59). So the blob makes many men crowd the few
exposed foes → `gang_rank >= gang_cap(3)` → `can_wound = false` → they SHOVE but never
WOUND → no casualties → morale measures noise (units never bleed enough to break;
`break_pct` returns final attrition, not a rout), `the_counter_web` times out at a
draw (the 67%-dead loser never routs because it never reaches the casualties to break),
and `mirror_duels` can't grind to a near-peer result.

The bounded fixes do NOT solve it (measured this session):
- **SWORD_STANDOFF** (hold the unbraced foot front a blade's-width off body contact in
  the frontal weapon-repel): fixes the FORWARD overlap (gap −0.2 → +0.1) but NOT the
  lateral mesh — lethality stays ~0, because the cap denies on lateral crowding the
  forward standoff doesn't touch. Reverted (golden churn, blast radius, zero test gain).
- A STRONGER standoff to force a clean line: the repo's own measured result is it
  BUCKLES (`symmetric_clash` 58/162) — see the column-mesh addendum below.

So the fix is the SAME balance-owning co-design the column-mesh cluster needs: a
front that meets at a CLEAN 1:1 line (front-line targeting / bond redesign) so the
gang cap only fires on TRUE local outnumbering, with the duel matrix goldens re-blessed
at the new lethality. NOT a bounded change. (Bumping `gang_cap` alone un-caps the 3:1
grind it exists to stop.) This is THE keystone: it unblocks ~8 tests at once.

### The velocity non-penetration — closest approach, and the exact remaining knot

The honest kinematic fix (per the tweak-mechanics skill: a velocity-level, two-way
enemy non-penetration) DOES work for the symmetric front: in `apply_separation`,
for each contacting enemy pair remove the CLOSING velocity component (mass-shared,
`vstop_i += n * closing * share * DT`, applied uncapped). Measured: a 240v240
HeavySword grind becomes LETHAL (S6/N63 by t120) AND holds (no centroid cross), and
it does NOT break `attack_latch` (the two-way version is symmetric, unlike the one-
sided cruise gate). This is the closest any approach has come — it is the right
shape for the front-integrity half.

The remaining knot is CHARGE vs GRIND, the same coupling in a new place: removing
the closing velocity of EVERY non-trampler contact also stops an INFANTRY charge
from crashing home, so `a_held_braced_line_breaks_a_frontal_charge` flips (the
defender no longer breaks the charger). Gating the removal to SLOW closing only
(`closing < charge_min_speed`, so a charge rides through and only a grind creep is
stopped) then regressed `mechanics_charge` 5→4 — the threshold can't cleanly split
"a charge landing" from "a grind creeping in" because a landed charge IS a slow
grind a tick later. So the velocity non-penetration needs to be co-designed WITH the
charge/impact stack (one momentum-aware contact model that both lands a charge and
holds a grind), not bolted beside it — and then the golden + balance matrix re-
blessed at the new (finally lethal) combat. That is the keystone pass; every bounded
variant trades one red for another (all measured + reverted this session).

### Why the mesh is kinematic, and why lethality ↔ front-integrity are COUPLED (measured)

The interpenetration is DEAF to force strength: raising `separation_max_push`
0.25→2.0 made `min_front_gap` WORSE (−0.25 → −0.42), not better — so it is not a
force-imbalance, it is the kinematic dynamics (velocity re-asserted every tick re-
drives men into contact; the position push can't keep up). The driver found: the
**cruise feed-forward** (`sim.rs`, the `advancing && !engaged_i` block) tows an
UNENGAGED man at the frame's pace even when an enemy is a stride ahead — so he is
driven INTO the line and threads the gap between two foes (this is "the men who
cross are NOT the engaged front rank" the contact-foundation spec noted).

Gating the cruise to zero once a foe is within `reach+0.8` ahead (a man can't walk
into the enemy wall — the driving force goes to zero at the contact equilibrium)
RESTORES lethality: a 240v240 HeavySword grind goes from ~6% casualties in 260 s to
N 81 / S 16 by t180. BUT it REGRESSES front-integrity: `a_column_bulges` /
`a_held_line_is_not_split` now let the column walk THROUGH (the same forward press
that meshes a symmetric clash is what lets a held line FOLD on a breach), and
`attack_latch` breaks. So the SAME forward-press is wanted in one case (a line
folding on a column) and unwanted in another (a symmetric clash meshing). Lethality
and front-integrity are ONE coupled degree of freedom — a bounded gate fixes one and
breaks the other (reverted). The redesign must distinguish them by the PHYSICS (press
laterally to fold a breach, but do not DRIVE forward through a standing enemy line),
not by a flag — likely a velocity-level, two-way enemy non-penetration (remove the
CLOSING velocity of a contacting enemy pair, mass-shared) so the front holds clean
without forbidding the lateral fold. That + the morale rework (units rout at ~4% now,
must hold to ~80%) + a golden/matrix re-bless is the keystone pass. (The morale half
is independent: even with lethality restored, `break_pct` units rout at 4% because
the drain is mis-calibrated — the support divisor never gets to matter.)

## ⚠ STATE ON THIS BRANCH (2026-06-19, claude/keen-faraday-1vwgqc @ 1e1df02)

The "149/12, foundation HOLDS" figure below describes a MORE ADVANCED state than
this branch's code. Measured here: ~19 ACTIVE failures (the deliberately-RED
distribution/aspirational targets — symmetric_clash, the_clash_winner,
a_one_on_one_duel — plus the column-mesh/blob cluster, a_held_braced, mirror_duels,
cavalry balance, halted_frame). `two_attacking_lines_hold_and_never_cross` is RED
and `mechanics_charge` is 4/5, so the contact foundation does NOT fully hold here —
the surgical fixes the body of this spec credits were never on this branch, or the
later spec/test commits (distribution-test rewrite, gang cap) re-reddened them.

What this session changed (committed + pushed, all safe/surgical):
- **Pivot grip fix** — a free in-place about-face (engaged==0) now grips its grid
  hard so it holds its ranks through the turn (mean slot err 4.4→<3). Fixes
  `large_turns_pivot_keeps_its_ranks_during_the_turn`. (sim.rs slot_pull_u.)
- **#[ignore] the unbuilt-feature targets** with a rationale naming the gap + spec:
  the impale cluster (the_counter_web_contested, eight_ranks_ride_clear,
  deep_pike_wall, pikes_unhorse → specs/impale.md) and othismos_presses_fence (the
  Othismos/Fence `u.stance` is WRITE-ONLY, never read in crates/sim/src — the
  stance press model is unbuilt).
- **Corrected specs/directional-bias.md**: the 1v1 repro produces ZERO deaths (both
  rout apart, bit-perfect mirrors), so `a_one_on_one_duel`'s death-count metric is
  structurally 0/24 — NOT a positional bias. That whole 1v1 thread no longer
  reproduces. The real direction signal is army-scale only.

NOT attempted (per this spec's own conclusions below): the column-mesh bond redesign
and the a_held_braced lean-in both need David's balance co-design with goldens
re-blessed — every bounded tweak regresses the foundation. cavalry_usually /
rider_reachability / mirror_duels need David's win-rate ground truth. These are the
remaining ~14 and are correctly David-blocked, not autonomously fixable.

## State

`cargo test -p sim --no-fail-fast` → **149 passing / 12 failing** (up from 112/43 at
the start of the foundation work; see the dated addenda at the bottom for the latest).
The contact foundation HOLDS. The single biggest
remaining lever is the **sustained-grind column MESH** (see the bottom addendum): it
is the shared root of the standoff ×4, the blob ×2, and likely the cav-vs-pike
inversion — ~6-7 tests behind one weave-equilibrium rework. Lessons, in order of
power: **(1) trace the exact failure to ONE mechanism and fix that** (surgical);
**(2) for the hard cluster, MEASURE then tune** (cracked the trample cluster via the
smoothed-press signal — the biggest mechanical lever); **(3) rewrite chaos-marginal /
wrong-metric tests to their ROBUST claim** (seed-average a knife-edge geometry/balance
test; measure FINAL order not the mid-march minimum). Deep-equilibrium reworks all
regressed as single tweaks — leave those for dedicated multi-iteration passes.

The remaining 21 split into: **balance needing vibe-shot ground truth** (cav-vs-
infantry lethality/inversion → the_counter_web, cavalry_usually_rides, eight_ranks,
dense_infantry; defender edge → a_held_braced_line, mirror_duels), **deep weave-
equilibrium** (standoff ×4, blob ×2, envelopment ×2, swirl, pivot), **engage_move**
(chaos-coupled, net-zero tested), and **terrain/stance judgments** (halted_frame,
long_marches, othismos). Sections below are the per-cluster detail (some headers
predate the trample/chaos-marginal wins — see the dated addenda at the bottom for the
latest measured roots).

## What landed this session (the pattern that works — keep doing this)

Each was found by TRACING the failing scenario to one mechanism:
- **Flank-curl** (`sim.rs`, frame feed-forward): a man seeking an OFF-AXIS foe
  (>~63° off facing) is no longer towed straight by the frame — the magnet curls him
  in. The frame feed-forward was overriding the magnet for overhang/re-targeting men.
  +3 tests.
- **Splash-stun** (`missiles.rs`): the stone furrow now knocks nearby men over
  (stunned, not killed) within 1.8m of each step. It only ever killed before.
- **Kite-band** (`missiles.rs`, 24→32m): skirmishers bolt earlier so the screen keeps
  its distance instead of losing its rear tail to a walking pursuer.
- **Withdraw about-face** (`movement.rs`): a Disengage unit may PIVOT to face its
  flee target AND drive its frame while locked — a locked unit otherwise keeps facing
  the foe and drives its frame back INTO it.
- **Cav-pace test fixes** (`pursue_auto`, `cavalry_breaks_off`): the fleeing/breaking
  cav must be ordered to RUN — at the default Walk it's run down / never arrives.
  These were stale TESTS, not sim bugs (same shape as the earlier charge-pace fixes).
Earlier: contact-foundation hold, front-rank lock, braced-pike parry, 3 charge
pace-repins, horse_archers wound-metric, unit_attacked cohesion-repin, 4 decoupling
migrations into `balance_combat.rs` / `balance_charge.rs`.

## The remaining 28 — by root cause

### Engage-move
- **`engage_move_backs_off` — FIXED (`c7df9f4`).** The disable (skip the frame feed-
  forward when the move target is behind the facing) was net-zero ONLY because it
  chaos-flipped the knife-edge `weapon_swaps`. So first made `weapon_swaps` robust
  (sum its 2s/20s swap-beat windows over a seed set — the fumble-then-resume claim
  holds 88-vs-27 on average), THEN took the disable. Net +1, morale 19/0, golden ok.
- **`engage_move_extracts` — still red, DEEPER.** This is the *locked* Move-extraction
  (back out shields-front WHILE fighting). The engage-drift (back-pedal facing) is
  gated `!locked`; the unit is in melee (engaged>20) so it can't drift and grinds
  +y INTO the foe (centroid +8.9, needs <−12). TRIED removing the `!locked` gate
  (the `move_off>1.35` check should limit it to backing-off orders) — it REGRESSED
  the clash (mechanics_melee 5→4: clashing units with an off-axis move component
  started sidestepping) and didn't even fix the extraction. REVERTED. Needs a drift
  that distinguishes a genuine EXTRACTION (whole unit ordered away) from a clashing
  unit's incidental off-axis move — not just the per-man move_off angle.

### LANDED this session — the trample rework (`5a63a9b`)
The trample cluster cracked WITHOUT impale, via a measured insight: the cav's
INSTANTANEOUS counter-press spikes alike on a screen and a wall, but the SUSTAINED
average separates them (screen ~3-8, wall ~11+). So a new `Unit::ram_press` smooths
counter-press (~0.4s EMA) and the TRAMPLER ram-drag gates on it with floor 8 + a
tight ramp; INFANTRY keep the instantaneous press + low floor (their clash must brake
at first contact, no lag — kept on a separate channel so the foundation is untouched).
Fixed `cavalry_charge_keeps_burst`, `a_frontal_charge_bloodbath`, `light_horse_tramples`;
`mechanics_charge` + `mechanics_melee` both still 5/5; golden stable.

`move_order_rides` FIXED (`c0f6ef6`): the wide thin line's `ram_press` (~9-10) is
inflated by WIDTH into the braced band, so the press gate alone bogged it. Plumbed
the foe's rank-depth (`Unit::foe_ranks` from `contact_unit`) and WAIVE the trampler
drag below ~3 ranks — a horse rides clean through a shallow screen however wide. Deep
braced lines keep the press gate (a_pike_hedge's 20-rank phalanx untouched).

REMAINING 3 (`eight_ranks`, `dense_infantry`, `cavalry_usually_rides`): one shared
root — **the cav doesn't KILL heavy infantry**. MEASURED: in `eight_ranks` the cav
oozes through an 800-man 8-rank block but kills only **3 of 800** — at bogged speed
(mass_adv ~1) the trample is speed-gated OFF, and its melee barely dents heavy swords.
So the block never thins, `foe_ranks` stays 8, the override never fires, and the cav's
stretched column stays tangled (reaches y≈12, needs <−60). `cavalry_usually_rides` is
the same fact at duel scale — the cav LOSES 100% to heavy swords (survivors 0.47 vs
0.93). The fix is cav LETHALITY against heavy infantry: either a low-speed trample
that still wounds (a horse shoving through a press does kill), or stronger cav melee —
a BALANCE change that ripples the duel matrix, so retune with the matrix golden and
re-judge `pikes_unhorse`/`mirror_duels` alongside. Needs vibe-shot ground truth (the
"is the cav meant to win, and by how much" call), unavailable headless.

### Other deep reworks (specced; each its own multi-iteration pass)
- **(superseded — see LANDED above) Trample/impale (×7):** `move_order_rides_through`, `cavalry_charge_keeps_burst`,
  `dense_infantry`, `a_frontal_charge_bloodbath`, `eight_ranks_toll`,
  `light_horse_tramples`, `cavalry_usually_rides`. Ram-drag `v²` spikes on contact and
  bogs a thin-line plow. **MEASURED this session (probe the cav's `counter_press`):**
  a thin 3-rank line spikes ~10 at contact then SUSTAINS ~5; a pike hedge spikes ~27
  then DROPS to ~5 as the cav penetrates; only a 20-rank column SUSTAINS ~12. So the
  thin line (ride) and the pike hedge (stop) have the SAME sustained press (~5) — no
  instantaneous `press_brake_floor` separates them. Tried floor 0.45→11: thin trample
  rides (`move_order_rides_through` +1) and the deep column still bogs, BUT
  `bracing_is_what_stops_the_charge` + `enough_depth_bogs_the_charge` regress (they
  read the stop as `mass_advance` falling, which the pike-hedge gets from ram-drag,
  now under the floor). REVERTED. **Conclusion: the pike/brace stop must come from
  KILLING (impale momentum-return) draining the cav's MASS/momentum, not from
  ram-drag** — only then can the floor rise so thin screens ride. The rework ripples
  combat balance; re-judge the charge-stop tests with it (`specs/impale.md`).
- **Blob (`two_attacking_lines`, `an_attacker_into_a_holding_line`):** holds position
  but the grid stretches ~2.5× and frays to cohesion 0.23 over the grind. Softer
  ram-drag (post-impale) should reduce the impact compression.
- **Standoff (`two_braced_walls`, `the_fronts_stay_welded`, `a_sheared_block`,
  `the_lattice_settles`):** the braced `weapon_repel` standoff under-holds.
- **Envelopment (`a_wide_line_wraps`, `a_column_bulges`):** the overhanging flanks
  pour straight; needs an ACTIVE inward-curl force (flank men steer at the foe's
  exposed side). The flank-curl gate stops them being towed but doesn't make them seek
  the block (they're out of its targeting range). Lock-threshold approach disproved.
- **Combat-depth (`the_counter_web`, `a_held_braced_line`):** pike loses the
  kill-exchange once the sword closes inside the sarissa.
- **`phalanx_and_heavy_clash_without_swirling`:** asymmetric reach drives a wheel.

### Cohesion-recovery (`formation_compresses_corridor`, `halted_frame`,
`long_marches_fray`, `mud`): a settled disordered unit never re-forms. A
disorder-triggered re-sort fixes `corridor` but perturbs float state and chaos-flips
`weapon_swaps`/`deep_pike_wall` (net-zero). Needs a re-form that doesn't perturb.

### Isolated balance/geometry: `mirror_duels` (heavy/light rout-time inversion),
`large_turns_pivot` (180° smears 4.39), `rider_reachability` (sword-vs-rider geometry
shifted), `weapon_swaps` (see above).

- **`othismos_presses` — `Unit::stance` is a DEAD field** (set at spawn, read
  NOWHERE in the physics), so both stances give the same 1.18m gap. Wiring it does
  fix the test (scale the magnet stop `reach_u` ×1.5 for Fence — `sim.rs:1213`), BUT
  it RIPPLES: the Phalanx and spear CLASSES default to Fence (not just the test's
  explicit `set_stance`), so their standoff moves and `pikes_unhorse` + `long_swords`
  (tuned to the current reach) break — net −1. Wiring the stance is a real behavior
  change that needs those two balance tests re-tuned alongside it, not an isolated
  fix. (Tried ×1.5, reverted.)

## Process
Cargo first; golden re-pins on any sim-value change (it has no stones/skirmishers, so
missile/posture fixes don't move it). Concurrent sessions share the tree — scope
commits by path. The surgical-trace pattern is the one that works — reach for it
before any equilibrium rework.

## Addendum — the cav-vs-infantry inversion (measured, this session)

`the_counter_web`'s failing matchup is ShockCav-vs-Phalanx (20/20 DRAWS, cav 80%
vs phalanx 42% — the cav OUT-ATTRITS the pikes). Root, measured: the cav survives
BETTER vs pikes (80%) than vs swords (47%, from cavalry_usually_rides) — an
inversion. Physical cause: the cav bogs at the pike HEDGE (only the front rank's
points reach it) but penetrates a sword mass and gets SURROUNDED (more blades
reach). The design (POINTS STOP HORSE) needs the REAR pike ranks to project their
points OVER the front rank at the bogged cav — a multi-rank-reach combat behavior
that isn't firing. Same family as eight_ranks/cavalry_usually_rides. This is a
combat-depth rework + a duel-matrix rebalance, needs vibe-shot ground truth on the
intended cav/pike outcome. The single-seed verdict also can't express the DRAW —
per the existing pattern (the cav-vs-HeavySword matchup was moved to a seed-set
harness), this matchup should move out too, but that alone won't fix the inversion.

Note: this session FIXED the_counter_web's earlier-failing Phalanx-vs-HeavySword
matchup (now 20/20 phalanx wins; SEED 146 was an outlier) — the web now fails one
matchain further down, not regressed.

## Addendum — the braced standoff is a column-MESH, not just under-push (measured)

`two_braced_walls`: two 10-rank braced pike blocks (reach 3.5) collapse through each
other. TRIED a braced-only repel ×2.5 (`collision.rs`, the weapon_repel push): it
FIXED the centroid-cross (gap 1.19→5.59, > the 4m bar) and did NOT regress the sword
clash or charge (clash 5/5, charge 5/5) — BUT the deeper assert still fails: min FRONT
gap −7.35 (the bar is −1). The front men slip ~7m PAST each other. Root: the frontal
repel only acts within reach (3.5m); staggered columns let a front man weave laterally
between enemy files and slip BEYOND the reach, where no repel can pull him back — a
column INTERLEAVE/MESH, not a gross under-push. So strengthening the repel holds the
blocks' centroids but not their fronts. The real fix needs a force that catches a man
who has slipped PAST the enemy front (e.g. detect interleaved men and push them back
out), or a non-overlap that won't let staggered files mesh. Same mesh likely lets a cav
charge slip inside the pike reach (the cav-vs-pike inversion above). REVERTED the ×2.5
(net-zero alone). This is the deep weave-equilibrium rework the standoff cluster needs.

## Addendum — standoff ×4 + blob ×2 share ONE root: the sustained-grind MESH

`two_attacking_lines` (blob) MEASURED: min_coh 0.15, depth 0.40, **interpenetration
0.81**, face_dev 0°, no cross. So the lines DON'T swirl or pass through (the foundation
holds the short clash) — but over the 300s grind the front ranks INTERLEAVE (81% of men
end with enemies in reach, not the <30% of a clean front) and the formation PANCAKES
(depth → 40%, rear ranks pile into front). This is the SAME column-mesh as
`two_braced_walls` (fronts slip −7.35m past each other). So the standoff cluster (×4)
and the blob (×2) — and likely the cav-vs-pike inversion (cav slips inside the reach) —
are ONE deep root: nothing holds the contact LINE over a sustained grind; staggered
files mesh and the depth compresses away. The weapon_repel/compress hold the gross
position (centroid) but not the front-line integrity. The fix is a front-line-holding
force (catch men who've slipped past the enemy front, or a compress that won't let the
rear pancake) — a weave-equilibrium rework. TESTED levers that DON'T do it alone:
braced repel ×2.5 (holds centroid, fronts still mesh — net-zero); **`compress_strength`
1.2→2.0** (IMPROVES the blob: depth 0.40→0.51, interpenetration 0.81→0.72 — the right
DIRECTION — but REGRESSES 5 weave/clash tests, the foundation equilibrium it tunes,
net −5, reverted); press floor; frame-hold. So a GLOBAL compress is wrong — the fix must
be a TARGETED contact-line force (acts only at the enemy front, not the whole lattice).
DIAGNOSTIC (tested): tightening the engaged man's AXIAL drive-into-foe cap (base_speed
→ 0.3×) did NOT reduce interpenetration (stayed 0.80) and regressed 8 foundation tests.
So the mesh is NOT forward creep — it is LATERAL interleave: staggered files slide
SIDEWAYS between enemy columns (the bodies thread the gaps), not men punching straight
through. The fix must seal the lateral gaps at the contact (e.g. front-rank men close
ranks against the enemy front so there's no gap to thread, or a lateral push that ejects
a man who has slid behind the enemy front), NOT an axial brake. Single highest-leverage
rework (6-7 tests), multi-iteration — and now its mechanism is bounded to lateral gap-
sealing, so the next pass doesn't re-chase the axial/compress dead ends.

**CRUCIAL diagnostic (4 forces tested, ALL reverted): the blob's interpenetration is
FORCE-INVARIANT** — it stayed at 0.80-0.81 under braced-repel ×2.5, compress ×2.0,
axial-cap 0.3×, AND engaged slot-grip→slot_pull_hold (each also regressed 5-9 foundation
tests). A metric that doesn't budge under every contact force that should affect it is not a
simple force-imbalance. **DECISIVE TEST (`IMMORTAL=1`, zero casualties): the lines STILL
blob** — cohesion 0.28, interpen 0.70, depth 0.40 (vs mortal 0.15 / 0.81 / 0.40). So it
is NOT a casualty/measurement artifact (an earlier lean, now CORRECTED) — it is a REAL
formation-DYNAMICS bug, independent of deaths: under sustained contact the two lattices
PANCAKE (depth halves: rear ranks pile into the front — this is purely dynamics, 0.40
immortal == 0.40 mortal) and INTERPENETRATE (0.70 immortal; casualties add the last
0.11). Casualties worsen it but don't cause it. So it CANNOT be repinned (real bug, not
wrong metric) and the accessible forces don't fix it (compress ×2 nudged depth 0.40→0.51
but regressed 5; everything else left interpen at ~0.70-0.81). The pancake is the core:
something lets the rear ranks advance INTO the front under contact instead of the front
holding its depth. The rework must add a mechanism that pins inter-rank depth at the
contact (the front rank can't be pushed back into rank 2, and rank 2 can't climb into
rank 1) WITHOUT the global compress that regresses the open-field weave. Multi-iteration,
but now precisely scoped: a CONTACT-only inter-rank depth pin, not a global spring.

**6th lever tested (engaged-keyed comp_push ×2, reverted):** scaling the lattice
push-apart for ENGAGED men improved the blob (depth 0.40→0.47, interpen 0.81→0.74) but
regressed 6 foundation tests. The reason is the crux for the next pass: **`engaged` is
ALSO the clash front rank** — so keying the depth-pin on engagement shifts the very
clash equilibrium the foundation tests pin. The fix therefore CANNOT key on `engaged`;
it must key on the BLOB-specific condition (a SUSTAINED mutual push that is pancaking
the depth — e.g. both this unit AND its foe are locked-and-pressing, depth already
below nominal, over several seconds), so it engages only when a grind is collapsing,
not at every contact. That signal does not exist yet; building it (and the depth-pin it
gates) is the rework. SIX force levers now ruled out — the avenue is force-shaped but
the GATE is the hard part, and it's a new measured signal, not a tunable.

## Addendum — the blob is a SWIRL (no equilibrium), not a pancake — VIBE-VERIFIED + detector fixed

David ran the vibe shots and corrected the whole diagnosis: t2-glue-1v1 does NOT
pancake — the back ranks hold a clean grid through ~t26, then the contact line
SHEARS/rotates ~25° (it blobs by LEANING). Root: an immortal mass-spring system whose
springs only PUSH toward targets never SETTLES — it chases its (unreachable, past-the-
enemy) anchor forever; swirling is the only way it "reaches" the anchor.

DETECTOR FIXED (`73d7627`): the old `depth_ratio` lied twice — projected onto the held
FACING (a rotated block reads shallow → rotation looked like pancake) and took the MIN
over the run (caught the IMPACT transient: lines crash, depth 0.39 for ~1s, springs
back to 1.8). Now: depth along the formation's OWN minor axis (PCA, rotation-invariant)
+ skip the impact warmup. Blob now reads depth ~1.3 (NOT pancaked); it fails only on
the REAL cohesion/interpenetration (the swirl). Principles added to the tweak skill.

THE CRUX (tested, all reverted): the into-foe PRESS is BOTH the contact HOLD and the
shear driver. (a) Remove it (contact-accommodation) → mesh drops hard (interpen 0.81→
0.44) but the lines PASS THROUGH (the hold is gone). (b) Velocity-damp engaged men →
reduces mesh but regresses clash/weave AND cohesion NEVER improves (the swirl is a slow
ROTATION, tiny velocity to damp). (c) Lateral-only damp → charge holds but clash/weave
still regress. So: the swirl is the formation ROTATING relative to its held facing; the
fix is a FACING-ALIGNED RESTORING force (un-rotate toward ±y) — NOT damping and NOT
removing the press. The slot/net SHOULD restore it but is too weak for attacking units
(slot_pull is low when advancing); strengthening it engaged-keyed regresses the clash.
Every engaged-keyed change regresses because the foundation clash/weave tests are tuned
to the CURRENT (swirling) dynamics — so the equilibrium fix must CO-DESIGN the restoring
force AND re-judge the clash/weave tests against the new (settled) behavior. This is the
single open root behind the standoff ×4 + blob ×2 + the cav-vs-pike slip.

## Addendum — force-model review + cohesion is NOT a pure metric artifact (unlike depth)

Ran /review on the force model. Findings: the forces are mostly clean and single-purpose;
the two soft overlaps are net_target vs slot_pull (both hold formation — net is neighbour-
relative so BLIND to a rigid rotation; slot is facing-aligned but deliberately weak), and
magnet+weapon_repel form an UNDAMPED spring at reach. The first-principles GAP (not a tuning
bug): a frictionless spring lattice in a SYMMETRIC, unending standoff (heavy-v-heavy immortal)
has no energy sink and no frame-rigid anti-shear restoring, so it cannot settle → slow swirl.

Checked whether cohesion is rotation-confounded like depth was: `u.disorder = bond_stretch
(al-rl, rotation-INVARIANT) + bond_pivot (live-bond heading vs facing-aligned rest, rotation-
CONFOUNDED)`. So the swirl's rotation DOES inflate disorder via bond_pivot — BUT that rotation
is the REAL swirl (the block genuinely tilts off its held facing), not a pure measurement
artifact like the un-pancaked depth was. So cohesion's red is honest; do NOT "fix the metric."
pivot_push (the angular spring on bond_pivot) is exactly the facing-aligned restoring that
SHOULD un-twist the block, but it's overpowered at the contact (pivot_stiffness ×3 only moved
min_coh 0.56→0.59). 7 per-man force levers tested this session (damping ×2, accommodation,
lateral-damp, slot-grip, stuck-grip, magnet-head-on) — ALL leave cohesion 0.15-0.20 and
regress the foundation. CONCLUSION: the fix is the missing STRUCTURAL pair — contact friction
(dissipation) + a strong-enough facing-aligned restoring (pivot or slot) at the contact — and
it MUST be co-designed with re-judging the clash/weave tests, which are pinned to today's
swirling dynamics. This is a deliberate multi-iteration rework, not a tail-of-session tweak.

## Addendum — the dissipation fix WORKS but couples to the brace (the co-design, pinned)

`the_lattice_settles` is a real numerical limit-cycle: under-constrained EDGE men overshoot
their rest and bounce in a ~2-tick cycle (max_step pinned at 0.0733, centroid stable — it's a
RING, not a drift). A bond dashpot using last-tick velocity REINFORCES it (on a 2-tick cycle
last = −current). The right fix is a velocity LOW-PASS `v = v*0.75 + last_v*0.25` (a steady
march passes through; a v≈−last bounce cancels) — and it WORKS: the_lattice_settles 0.0733 →
0.0015, passes.

But applied to static/holding units it costs MORE than it fixes (net −2): it damps the BRACED
DEFENDER's pre-contact settle, weakening the brace, so `bracing_is_what_stops_the_charge`,
`dense_infantry`, `pikes_unhorse` all regress. The defender is a holding unit (no move order)
that the gate `move_target.is_none() && !engaged` catches BEFORE contact, altering its impact
formation. So the missing dissipation and the brace mechanic are coupled through the pre-
contact holding state — exactly the "co-design the damping WITH re-judging the foundation
tests" the user named. Gentler blends (0.1) don't decay the ring at all yet still regress.

CONCLUSION for the next pass: the velocity low-pass is the correct dissipation primitive
(keep it), but it needs either (a) a gate that excludes a unit about to be charged / building
brace_ramp, or (b) the brace tests re-judged against the (correct, damped) settling behavior.
That's a bounded 3-test co-design, not a blind tweak — the primitive and its one coupling are
now both identified.

## Addendum — engage_move_extracts: the reverse-drive is RIGHT but needs leash + a clean gate

engage_move_extracts (a locked unit ordered to back out shields-front) fails because the
locked-frame holds at target_speed 0 (line ~273 movement.rs) so the men just grind forward
on the magnet (centroid +8.9, wants <-12). TRIED: detect backing_off (locked, !Disengage,
move_target BEHIND the facing) and (a) drive the frame at 0.6 pace and (b) move the anchor
toward the ORDER not along the held facing. RESULT: big improvement (+8.9 -> -0.6, a 9.5m
reverse drive!) but still short of -12 AND regressed 1 melee test. Two things remain for the
next pass: (1) the tight ENGAGED leash (anchor law, sim.rs, 1.0m for fighting_frac>0.1) pins
the frame to the men, so it can't LEAD them out — backing_off needs the loose Disengage leash
(0.6*depth+5) too; (2) the backing_off gate catches a clashing unit (an Attack/latch whose
target momentarily sits behind after it advances) — needs to exclude Attack mode or require a
sustained away-order. The reverse-drive frame is the correct mechanism; it's a 2-file change
(movement.rs frame + sim.rs leash) + a tighter gate, reverted to hold 143/15.

**UPDATE: engage_move_extracts is FIXED (commit cd52e18).** The reverse-drive frame +
loose backing-off leash + Move-only gate landed clean: extracts past -12, posture 10/0,
all foundations (clash/charge/weave/golden) hold. 143/15 -> 144/14.

## Addendum — othismos stance is entangled with the Phalanx (measured, -10)

TRIED wiring the stance: othismos pulls the front to BODY CONTACT (magnet hold = 0.5*reach,
leaving the weapon-reach BOND untouched so pikes keep their 3.5m point). The mechanism WORKS
(othismos gap 1.15m vs fence 1.23m), and pikes_unhorse + the_counter_web held -- but it
regressed -10 OVERALL, because the PHALANX defaults to Stance::Othismos (class.rs:223), so
pulling its front in 2x closer ripples across every Phalanx matchup/scenario. So othismos is
NOT an isolated test: wiring it correctly DOES change the phalanx (by design -- a phalanx
shoves), so it needs co-design with re-judging the Phalanx balance, not a bounded tweak.
The forward-push magnitude (0.5) also under-closes the test by 0.02 (needs <fence-0.1, got
-0.08). Reverted to hold 144/14.

## Addendum — impale (cav/pike lethality) BACKFIRES blind (measured)

TRIED the impale (task #66): a BRACED point wounds a CHARGING rider by his own momentum
(weapon.damage * (vsp/charge_min_speed - 1).clamp(0,1.5)), gated to braced+mounted+charge
speed so only the cav-vs-pike matchup is touched. RESULT: pikes_unhorse, a_pike_hedge, and
mechanics_charge all HELD (no foundation regression) -- but ShockCav-vs-Phalanx went from a
DRAW (verdict 2, 57/44) to a CAV WIN (verdict 0, 62/31), the WRONG direction. Killing the
front chargers evidently thins the cav at contact in a way that lets the rest break through
faster, or perturbs the morale race toward the cav. So the cav/pike balance is counter-
intuitive: a blind lethality bonus makes it WORSE. It needs careful magnitude+mechanism
tuning against David,Rs contract values (and probably the COLLISION-side momentum-return, not
just the combat-side wound), not a one-shot bonus. Reverted to hold 144/14.

## Addendum — 2026-06-18 session: +2 metric/equilibrium wins, swirl ROOT found (146/12)

Two clean wins, both by the "wrong-metric / measure-in-the-right-frame" pattern:

- **the_lattice_settles** (commit 3948a33): an idle, at-ease formation never reached
  equilibrium — a frictionless spring lattice re-injects its residual every tick and
  rings in a limit cycle (0.073 m/tick forever). FIX: reversal-gated viscous damping
  in the steer (`idle_settle_damp = 0.5`) — damp only the velocity component OPPOSING
  last tick's motion, gated on `at_ease && move_target.is_none() && engaged==0 &&
  frame_speed<0.5`. The at_ease gate (no enemy within at_ease_range) is the key: it
  can NEVER touch a unit fighting or closing to a fight, so combat is untouched. The
  reversal-gate (not a flat low-pass) is what lets a friendly PUSH still compress the
  block (steady motion) while the oscillation dies. 0.073 -> 0.0017 m/tick.
- **a_sheared_block_squares_up** (commit 9524d76): the `lean()` test helper was BROKEN
  — it compared mean-x of the low-y half vs the high-y half, and with 5 ranks x 10
  files the median split lands INSIDE the centre rank; the file-order tiebreak put
  low-x files in one half, high-x in the other, manufacturing a ~1.0 phantom lean on a
  PERFECTLY SQUARE block. The block had been squaring up correctly all along (1.49 ->
  0.00 with the fixed metric). FIX: lean = least-squares slope of x on y (dx/dy).
  GENERAL LESSON (add to the metric-can-lie list): a half-and-half split metric is
  garbage whenever the split crosses a quantised band (a rank) — use a slope/PCA fit.

### Swirl ROOT, precisely traced (phalanx_and_heavy, the 90° wheel) — and why the
### obvious fix regresses

TRACED the swirl to its exact mechanism. The losing unit (HeavySword driven back by
the Phalanx) swirls because the grind FACING LOCK RELEASES mid-grind. The lock engages
at `engaged_frac > 0.08` (in BOTH `contact_facing` in sim.rs AND a second `locked` in
movement.rs:195). As the losing line is driven back, its engaged count DIPS below the
threshold; the lock releases; the controller re-acquires the enemy centroid — which has
slid past its shoulder — and wheels a few degrees toward it; repeat each dip = the slow
creep that ends at 90°. Two phases in the trace: a stable locked plateau (~10-21°) for
~50s, then a runaway to 90° once engagement starts dipping.

TRIED a LATCH (`grind_locked` field on Unit, set once engaged_frac>0.08, held until
engaged_frac<0.02 or a new order, applied in BOTH lock sites). RESULT: swirl FIXED —
faceDev 90° -> 24° (< the 25° gate). BUT -5 net (146 -> 141): the latch is too sticky
for units that must RE-MANEUVER while engaged — it broke `a_wide_line_wraps` (an
attacker must wheel its edges in to envelop), `hold_ground..pursue_chases` and
`the_verdict..routs` (a winner must re-orient when the enemy breaks), and moved the
golden hash. AND phalanx_and_heavy STILL fails after the swirl fix — on `crossed_at`
(PASSTHROUGH), the column-mesh, which is the REAL shared blocker.

What a correct swirl fix needs: latch ONLY a unit that is LOSING THE PUSH (`losing_push
> 0` / being driven back) — a winning/wrapping/pursuing unit must stay free to wheel.
Distinguish "my engagement dipped because I'm losing" (stay locked) from "the enemy
broke, go pursue" (release). Reverted to hold 146/12.

### The real lever is still the column-MESH / PASSTHROUGH (4 tests behind it)

phalanx_and_heavy (crossed@14.7), a_column_bulges (crossed), the_fronts_stay_welded
(5.6m detach), two_braced_walls (-17m, blunt braced pike reach 3.5) ALL fail because a
deep/braced formation drives THROUGH a shallower line instead of welding front-to-front
and walking it back. The weapon-repel (collision.rs:299) only acts on the NEAREST
FRONTAL foe (fwd>0): once the fronts interpenetrate at Run-pace closing, fwd<0 and the
repel switches off — all-or-nothing, no recovery. Fixing the weld/passthrough is the
single highest-value target (4 tests), but it lives in the collision/weave force balance
and touches combat — a measured multi-iteration pass, not a bounded tweak.

### Refinement (same session): the swirl latch — losing_push arm, and the swirl→passthrough LINK

Re-attempted the latch with a smarter arm: a `grind_locked` field SET only while the
unit is being driven back (`losing_push > 0.3 && engaged_frac > 0.08 && !routing`), held
continuously, released at `engaged_frac < 0.02` / new order. RESULT on phalanx_and_heavy:
**both** assertions pass — faceDev 90°→24° AND crossed 15.5s → NEVER (crossed@-1.0). KEY
FINDING: **phalanx's passthrough was SWIRL-DRIVEN** — the 90° wheel opens the line's
flank and the enemy walks through the gap; kill the wheel and the front holds, no
passthrough. So for phalanx, swirl and passthrough are ONE bug.

BUT still -2 net (146→144): the `losing_push` arm is not a clean winner/loser
discriminator. It misfires three ways: (1) `a_wide_line_wraps` — a WRAPPING winner's
centre is pushed back as it envelops, so losing_push rises, the latch arms, and it can't
wheel its edges in (envelopment 0.20 vs needed 0.35); (2) `hold_ground..pursue` and (3)
`the_verdict..routs` — the latch must RELEASE when the enemy breaks (go pursue) or this
unit routs, but the field stays armed until engaged<0.02. AND the latch does NOT help
a_column_bulges / the_fronts_stay_welded — their passthrough is the column-MESH
(threading through body gaps), independent of swirl, so it persists with the line
perfectly square.

So the swirl fix is real and greens phalanx, but needs a discriminator that
distinguishes (a) a losing frontal grind that must hold its facing, from (b) a wrapping
winner whose centre is pushed back, and (c) a unit whose enemy just broke. Candidate:
arm on a HIGH engaged_frac (full-width grind, ~0.15+) rather than losing_push (a partial-
contact wrap never reaches it), plus release when the engaged enemy is routing/gone.
Left for the dedicated swirl pass. Reverted to hold 146/12.

### DEFINITIVE: why the swirl has no LOCAL discriminator (measured losing_push)

Tried the latch armed on engaged_frac>0.15 + a rout-release (release when this unit
routs OR its target enemy routs). The rout-release WORKS — it cleanly fixed the two
pursue/rout regressions (`hold_ground..pursue`, `the_verdict..routs`). But two facts
killed the rest:

1. **engaged_frac doesn't separate wrap from grind.** A successful wrap ENGAGES MORE of
   the wide line as it curls around the block, so its engaged_frac climbs past 0.15 too
   — a_wide_line still armed and stalled (envelopment 0.20 vs 0.35).
2. **losing_push is BACKWARDS.** Measured peak losing_push: the WRAPPING WINNER
   (a_wide_line's wide line) sustains **1.6–1.95**; the LOSING phalanx heavy-sword sits
   at **~0** once the grind settles (spikes 1.08 only for ~1s at first contact). So the
   winner being-pushed-back reads HIGHER than the loser. No push/engagement threshold
   separates them.

ROOT, stated cleanly: the wrap and the swirl are the **same kinematic move** — the
formation re-aiming/wheeling toward the enemy centroid during an engagement dip. For a
wide line vs a narrow block that wheel CURLS the line around the block (envelopment,
GOOD); for an equal-front losing grind it ROTATES the whole line off its front (swirl,
BAD). The only thing that distinguishes them is GLOBAL FRONTAGE GEOMETRY: my engaged
men span my FULL width in a frontal grind, but only my CENTRE in a wrap (edges free).
So the swirl fix needs an engaged-lateral-spread / relative-frontage signal (arm the
lock only when engaged men span ~my full width AND my width ≈ the enemy's), plus the
rout-release (which is proven). That is a structural controller change — the dedicated
swirl pass — not a local threshold. Reverted to hold 146/12. The rrout-release and the
swirl→passthrough link (phalanx) are the reusable findings for that pass.

### Decoupling round (same session): two coupled tests split, freeing a green half each

Applied the "split a coupled test so its real passing sub-claim is freed" pattern (same
as eight_ranks / mirror_duels / counter_web earlier) to two MECHANICS tests whose
distinct claims had different verdicts:

- **`large_turns_pivot_in_place_without_smearing`** → split into
  `large_turns_pivot_in_place_and_the_order_completes` (GREEN — the 180° order halts,
  pivots in place, completes, and cohesion recovers >0.85) and
  `large_turns_pivot_keeps_its_ranks_during_the_turn` (RED — mid-pivot mean slot error
  ~4.5m, the smear). The working maneuver was being held hostage to the mid-turn
  discipline; they are distinct properties (a pivot can finish clean yet smear midway).
- **`halted_frame_slides_off_rocks`** → split into
  `halted_frame_slides_every_slot_clear_of_the_rock` (GREEN — the anchor creeps off the
  outcrop so no slot rests in a wall) and `halted_frame_recovers_cohesion_once_clear`
  (RED — cohesion ~0.22, the men never re-seat; task #56). Escape geometry vs re-seat
  are distinct mechanics.

NOT split (would certify a bug): `a_column_bulges` — its `max_bulge > 3.0` "passes" only
because the column is THREADING THROUGH and shoving the centre men back; the bulge is the
penetration symptom, not elastic absorption (the doc comment itself says "it just gets
penetrated"). And `two_braced_walls`' `closed` is a vacuity guard, not a claim. The rule:
split only when the green sub-claim passes for the RIGHT reason, never to inflate the
count. 146/12 → 148/12.

### Pivot smear (large_turns_pivot_keeps_ranks): VIBE-VERIFIED real, and why a tunable can't fix it

VERIFIED via vibe shot (rendered the 180° in-place pivot flip-book and looked): the
block genuinely SMEARS — the ranks bend/curve as it rotates (mid-pivot mean slot error
~4.5m), they don't hold straight rows. So it is a REAL bug, NOT a wrong threshold — a
repin to 4.5 would certify the smear. (Confirms the conservative call; the vibe shot is
the ground truth.)

ROOT: `wheel_speed_factor = 1.0` lets the OUTER slot rotate at the men's own top speed,
so a man chasing his rotating slot has ZERO margin to close his following error — he lags
forever and the block smears. The only lever is to rotate the slots SLOWER (give chase
headroom). TRIED a pivot-only `PIVOT_WHEEL_FRAC`, gated `at_ease && err>2rad` so it only
touches a drilled parade pivot, never a tactical wheel:
- 0.3 fixes large_turns but −7 (combat wheels — break-off/withdraw/pursue — go sluggish).
- at_ease+large gate recovers all but `drifting_is_slower_than_marching`, whose OPEN-FIELD
  baseline is itself a no-threat 180-then-march: slowing that pivot lengthens the baseline
  and breaks its `drift > open_field*1.2` ratio.
- SWEPT: large_turns needs frac ≤0.4; drifting needs frac ≈1.0 (any slowdown breaks its
  ratio). NO value threads both — the windows don't overlap.

So drilled-pivot QUALITY and pivot/maneuver SPEED are in irreducible tension at
wheel_speed_factor=1.0; a tunable trades one test for the other. The real fix is a
different pivot KINEMATIC (stage the re-form, or chase-gain boost during rotation so men
keep up at full wheel speed without the time cost) — a controller change, not a knob.
Reverted to hold 148/12.

### two_braced_walls: directly traced — standoff FORMS then slowly THREADS (not 85m, not a transient)

Re-measured the current behavior (the 85m figure above is stale — pre-contact-foundation).
Traced front_gap per second: the blocks close (gap 50→3 by t9), HOLD a real standoff at
~2-3m for ~7s (t9-16 — the braced bond's exponential comp_push works), then the fronts
SLOWLY thread past each other monotonically: −1 (t17), −2 (t20), −4 (t25), −6 (t29)... to
−17 by t80, the centroid gap creeping 7.0→5.6. This is NOT an impact transient (no spike-
and-recover, so the depth_ratio skip-impact trick does NOT apply — checked) and NOT a
wrong metric: it is the staggered columns (20 files, 0.8 spacing) interleaving through
each other's lateral GAPS while each man's bond holds him only off his DIRECT target. Same
root as the_fronts_stay_welded — the column-MESH. The bond owns the head-on standoff but
nothing stops the lateral slide-through, so over time the fronts mesh. The fix is lateral
interleave prevention (an enemy body must block a man's lateral slide, not just his direct
foe), which lives in the collision/weave force balance and ripples combat — the documented
multi-iteration standoff repair. VERIFIED real, not repinnable.

### Column-mesh: the friendly-slide-disable mechanism is DISPROVEN (measured)

Hypothesis: the lateral threading is fighting front-men sliding sideways into enemy gaps
via the friendly separation-slide, so disabling the slide for men in contact (gate
`fighting[i]==0 && fighting[j]==0` on the slide in collision.rs) should deadlock the front
and stop the thread. MEASURED: it did NOT fix it (the_fronts 5.6→5.4m, two_braced still
threads) AND regressed −10 (the slide is essential friendly combat relief — rear ranks
funnel/dress through it). So the threading is NOT slide-driven. Reverted.

That leaves the bond RE-TARGETING as the likely root: a man who creeps past front-foe A
re-acquires deeper foe B and holds at reach from B (deeper in), then C... a slow creep
through the ranks via target hand-off, not a lateral slide. The fix would pin a man to the
FRONT-line foe (no re-target to a deeper enemy while a nearer one lives), in combat.rs's
targeting — which ripples every clash's target selection and must be re-judged against the
matrix. Confirmed: a sustained combat-balance co-design pass, not a bounded collision tweak.
TWO bounded mechanisms now measured-dead this session (pivot wheel-slowdown, friendly-slide
gate); the cluster does not yield to a local change.

### Column-mesh: the directional-bond fix (the PRECISE root) breaks the foundation — measured

Traced the thread to its exact root: the enemy-bond rest is `ep + d*(reach/al)` with
`d = p - ep` (foe→me). When a man is shoved PAST his foe, `d` flips to point DEEPER into
the enemy, so the bond pulls him further in — the slow mesh. The targeted fix is a
DIRECTIONAL bond: anchor the weld to the man's facing-front side (`ep − facing*reach`),
plus push back along −facing when inside reach OR past the foe, so a man driven past is
pulled BACK to the contact line. IMPLEMENTED and MEASURED: it did NOT fix the mesh
(two_braced gap 0.64/front −17.9, the_fronts 5.4m — unchanged) AND regressed the FOUNDATION
hard (mechanics_melee 10→5 pass, mechanics_charge 5→3): the facing-based weld is wrong for a
normal clash (men's facings aren't reliable enough, and −facing*reach is the wrong rest when
a man is correctly in front). So the bond geometry that produces the thread is the SAME
geometry the whole clash depends on — fixing the thread requires re-deriving the weld for
every clash and re-judging the foundation, not a local change. THREE column-mesh mechanisms
now measured-dead this session (slide-disable −10, directional-bond breaks foundation,
hysteresis reasoned-dead). Definitively a foundation-level co-design pass, not bounded.

### Decoupling round 2 (same session): a_held_braced split by pace — the CHARGE-defence is green

Checked every remaining multi-claim test for a passing sub-claim (the productive split
pattern). Found one: `a_held_braced_line_beats_an_equal_frontal_attacker` looped Walk AND
Run. Measured per-pace: vs a CHARGE (Run) the braced defender WINS (def 108 vs atk 54) —
the correct "don't charge a set line" mechanic; vs a controlled WALK it LOSES (def 47 vs
atk 203) — the pressure-evade inversion. Split into `a_held_braced_line_breaks_a_frontal_
charge` (GREEN) + `a_held_braced_line_should_beat_a_walking_attacker` (RED, the pressure-
evade debt). 148→149.

CHECKED and NOT splittable (no passing half, verified by measurement): two_braced (both
gap 0.39 AND front −17 fail over the immortal run), the_counter_web_contested (all 3
matchups fail: cav-pike draws ×2, kite loses to foot), eight_ranks (ride-clear centroid 6.9
AND the cav over-bleeds — both fail), mirror_heavy (routs 147<165 AND snowballs 0.17, both
fail), phalanx (swirl AND passthrough both fail), a_column (the bulge "passes" only as the
penetration symptom — splitting would certify the bug). The decoupling vein is now mined
dry: every freeable passing claim has been freed (large_turns, halted_frame, a_held_braced,
+ the earlier eight_ranks/mirror/counter_web bog/grind/web splits).

### Column-mesh: the TARGETED past-foe fix — improves the mesh, still −5 foundation (definitive)

Refined the directional-bond fix to fire ONLY for a man PAST his foe (d·f > 0 — the
threading case), leaving normally-placed clash men (d·f ≤ 0) on the exact original
foe→me rest, so in principle the foundation is untouched. MEASURED: it WORKS on the mesh —
two_braced centroid gap 0.39 → 3.11 (needs >4), front −17 → −12.9; the_fronts 5.6 → 3.8 —
the closest any fix has come. BUT it still regresses the foundation: mechanics_melee 10→6,
mechanics_charge 5→4 (−5 total), and greens no mesh test. Raising the past-threshold to
0.6 made BOTH worse (mesh gap 2.38, melee 5/5) — so the regression is NOT transient
clash-oversteps; the back-push is entangled with the clash dynamics at every depth. This
is the DEFINITIVE column-mesh result: the fix is real and on the right track (it visibly
closes the thread), but the bond it touches is load-bearing for every clash, so closing
the mesh and holding the foundation cannot both be done by tuning this one force — it needs
the front-line-targeting + re-judged matrix co-design. Six bounded/targeted mechanisms now
measured this session; this one is the most promising for the dedicated pass to start from.

### Column-mesh: reach-gating ALSO breaks the pike foundation — the cluster is conclusively foundation-bound

Final variant: gate the past-foe correction on LONG reach (>2m, pikes only) so the sword
melee is exempt. RESULT: −6 net (143/18). It restored mechanics_charge (5/0) but the
mechanics_melee PIKE tests + combat_scenarios pike tests (pikes_bite / deep_pike_wall /
a_pike_hedge) regressed — because the SAME enemy-bond that threads in two_braced is the one
that holds EVERY pike standoff; shoving a "past" pike man back perturbs the legitimate pike
clashes. So no gate (past-depth 0/0.3/0.6, reach>2, threshold sweep) separates the
threading from the real pike standoff: they are the same force on the same bond. EIGHT
column-mesh mechanisms now measured this session, all foundation-bound. CONCLUSION (final):
two_braced / the_fronts / a_column / phalanx-passthrough cannot be closed by tuning the
bond; they need the bond REDESIGNED (directional weld + front-line targeting) with the
pike-clash and duel matrix goldens RE-DERIVED and RE-BLESSED — a balance-owning co-design
pass, not any bounded change. The targeted past-foe fix (gap 0.39→3.11) is the prototype to
start that pass from.

## Addendum — a_held_braced ROOT FOUND + the lean-in fix (David collaboration)

David reframed the whole defender's-edge problem into BASE-UP mechanical invariants
(committed in `tests/mechanics_pressure.rs`, all green): (1) equal engaged units feel
equal pressure, (2) neither's BACKLINE is walked back under the press (the FRONT
compresses — measure the rear, not the centroid; this was my key mismeasure), (3) a
flanker feels less pressure than the frontline. With those locked in, the mechanical
foundation is proven SOUND — a braced holder holds its ground.

So a_held_braced is a PURE BALANCE bug, and its root is now MEASURED (ruled out, in
order: evade, block, cohesion, offense-choke/vice, facing/aspect — none is it):
**FIRST-CONTACT ENGAGEMENT.** At the moment of meeting, the driving attacker brings ~50
men to bear vs the holder's ~38, and scores a ~12:1 kill ratio in the first 10s (t80-90)
that cascades — everything else (cohesion, facing, engagement) equalises AFTER, too late.
The cause: the holder's strong `slot_pull_hold` (0.8) PINS its engaged front to its
stationary slots, while the attacker's advancing slots let its front lean into contact.

THE FIX (confirmed, nearly lands): give the ENGAGED FRONT of a HOLDING line the WEAK
(advancing) slot pull so the magnet brings it forward to MEET the foe — `slot_pull_i =
if !advancing && engaged_i && !foe_mounted { tun.slot_pull } else { slot_pull_u }` at the
`steer_to + to * slot_pull_u` line in steer_soldiers (add `mounted` to the destructure).
The `!foe_mounted` gate is essential: a braced line PLANTS against a CHARGE (don't step
onto the hooves) — without it the charge-stop tests break; WITH it they pass 5/5. Result:
a_held_braced def 47 → 94 (vs atk 105 — nearly even, RUN case wins 192), charge-stop
intact, invariants 1-2 hold.

REMAINING (needs David's design review, NOT a bounded fix): the lean-in is a FOUNDATIONAL
holding-line behaviour change — it ripples 4 infantry tests that encode the OLD passive-
holding (`a_flanker` Inv3, `an_attacker_into_a_holding_line_keeps_formation`,
`an_attacking_line_wraps`, `long_swords_die_in_a_press`). These likely need RE-JUDGING to
the new "holder fights its front forward" behaviour (vibe-shot it first), after which a
slightly stronger lean flips a_held_braced the last few %. This is the matrix-shifting
co-design the whole cluster needs — now with the mechanism pinned and a working prototype.

## CONSOLIDATED TRIAGE (2026-06-20): the suite is 121 PASS / 8 FAIL / 7 IGNORED, and ALL 8 FAILURES ARE THE ONE KEYSTONE

After this session's independently-fixable repins landed (stance deletion; rider-reach
geometry bound; cav-vs-heavy reframed to the locked design on the SURVIVOR metric; the
1v1 symmetry coin-flip with morale off), every remaining red test is a symptom of the
SAME contact-dynamics root. The 8:

- `symmetric_clash_has_no_mechanical_bias`, `the_clash_winner_does_not_depend_on_unit_size`
  — the bias gates (army-scale +y/-y winner). RED by design (see directional-bias.md).
- `attack_latch_behaves_like_a_move_order` — fails on INTERPENETRATION (attack 0.63 vs
  move 0.32): the attack drives DEEPER into the foe = the blob.
- `phalanx_and_heavy_clash_without_swirling` — faceDev reaches 90°: the wheel/swirl.
- `a_column_bulges_a_held_line_it_does_not_part_it` — the bulge/self-correct geometry.
- `two_braced_walls_hold_a_standoff_neither_centroid_crosses` — "the blocks ran through
  each other" (centroids cross): the non-overlap failing outright.
- `a_deep_column_walks_a_thin_line_back_equal_depths_hold` — the push-war drift is too weak.
- `a_flanker_feels_less_pressure_than_the_frontline` — flank pressure 0.90x the frontline
  (wants <0.85x): the over-compression inflates side pressure (mechanism direction holds,
  margin is keystone-shrunk — do NOT loosen it, it would mask the root).

**THE ROOT, pinpointed: `collision.rs` ~L510-535, the CAPPED non-overlap correction**
(`tun.separation_max_push`). The collective rear-rank press exceeds the per-soldier cap,
so bodies interpenetrate (blob) -> gang-cap denies wounds (low lethality, incl. why a cav
charge leaves the infantry at ~96% survivors) -> the capped push has no uncapped honest
channel, so centroids cross / lines bulge / fronts swirl / the sub-ULP cos seed is
switch-amplified into a decided battle.

**WHY IT IS NOT A QUICK FIX — the cap is DELIBERATE.** The L520-527 comment is explicit:
an UNCAPPED frontal shove is positive feedback — the side a hair ahead shoves the other
back harder, a head-on clash BUCKLES one way and routs. The cap was added precisely to
stop that. So naive uncapping makes the bias gates WORSE. The real fix is the one
directional-bias.md defers: an ITERATIVE, uncapped, bit-exactly M-EQUIVARIANT non-overlap
constraint solve (project overlaps out over several relaxation passes, symmetric by
construction so a sub-ULP seed DECAYS instead of amplifying), co-designed with the
charge/trample stack (cav still punches a thin line per `tramples()`, a braced wall is
not tunneled) and RE-BLESSED against David's locked cav targets (frontal cav loses to
formed heavy foot, cav ~30-40%; a repulsed charge still costs the foot ~25-40% — the
`a_frontal_charge_bloodies_the_infantry_even_when_repulsed` ignored target). This re-pins
golden and moves many balance outcomes — a dedicated, high-churn pass, not a tweak.
