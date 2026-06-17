# Spec: the road to 100% — what's left after the surgical-fix session

## State

`cargo test -p sim --no-fail-fast` → **135 passing / 20 failing** (up from 112/43 at
the start of the foundation work). The contact foundation HOLDS. The single biggest
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
