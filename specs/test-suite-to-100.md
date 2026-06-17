# Spec: the road to 100% — what's left after the surgical-fix session

## State

`cargo test -p sim --no-fail-fast` → **127 passing / 28 failing** (up from 112/43 at
the start of the foundation work, 119/36 at the start of this session). The contact
foundation HOLDS (the clash no longer passes through or swirls). The big lesson of
this session: **deep-equilibrium reworks all regressed; surgical fixes of specific
traced behaviors all landed.** Trace the exact failure, fix the one mechanism.

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

### Chaos/morale-coupled (a correct fix exists but trades another test) — do NOT force
- **`engage_move_backs_off`, `engage_move_extracts`:** the frame feed-forward drives
  a backing-off man along his FACING (+y, toward the threat) while the frame retreats
  (−y) — deadlock. Two fixes TRIED & REVERTED: (1) re-head the feed-forward toward
  the move target — hijacks verdict-locked routers (`the_verdict` regresses, real
  morale break); (2) DISABLE the feed-forward when the target is behind the facing —
  morale stays clean (19/0) and fixes `engage_move_backs_off`, BUT chaos-flips
  `weapon_swaps` (whose green was itself flank-curl chaos-luck). Net-zero either way.
  The honest fix is to make `weapon_swaps`' fumble-beat assert robust (it compares
  kills in a 2s window, knife-edge) AND take the disable — then it's net +1.

### Deep reworks (specced; each its own multi-iteration pass)
- **Trample/impale (×7):** `move_order_rides_through`, `cavalry_charge_keeps_burst`,
  `dense_infantry`, `a_frontal_charge_bloodbath`, `eight_ranks_toll`,
  `light_horse_tramples`, `cavalry_usually_rides`. Ram-drag `v²` spikes on contact and
  bogs a thin-line plow. Ram-drag is the ONLY propulsion brake (removing/​depth-gating
  it collapses `mechanics_charge` 5→2), so it needs the impale momentum-return as a
  REPLACEMENT charge-stop first (`specs/impale.md`).
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
