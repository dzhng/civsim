# Spec: a directional (+y/−y) bias decides the symmetric clash

## It is a REAL gameplay bug, not a test idealization — fix must be structural

Tested whether a realistic battlefield position jitter randomizes the winner (which
would make the bias a parade-ground artifact safe to ignore): per-seed random
position noise of 0.1, 0.3, even 0.6 m does NOT move it — 1v1 stays 0/20, 120v120
stays 19-20/20. The deterministic bias dominates well past any real deployment
variation. So two evenly-matched units genuinely favor one side in play, and the
"accept it, test fairness over seeds with jitter" reframe is DEAD.

The fix must therefore be STRUCTURAL — make the contact passes M-equivariant by
construction: double-buffer them (Jacobi: compute all forces/strikes from the
tick-start snapshot, apply together) instead of in-place Gauss-Seidel where the
second-processed body reads the first's freshly-updated state, and symmetrize the
discrete switches (surge, per-man speed cap keyed on slot not index, contact
detection) together. Big blast radius (re-validate the whole combat suite), but it
is the only thing that makes a sub-ULP seed DECAY instead of being switch-amplified
into a decided battle. `mechanics_symmetry.rs` (1v1 coin-flip) is the gate.

(Amplifiers neutralized individually with NO effect on the win — do not re-try in
isolation: surge step, per-man speed cap, every tunable contact force, dir() cos
residue, spawn/index order, round-robin phase, RNG, frontage re-slot, gang cap,
position jitter to 0.6 m. The instability re-seeds from whatever sub-ULP asymmetry
remains; only making the core M-equivariant removes the re-seeding.)

## HOW TO RUN THE REPRO

```
cargo test -p sim --test mechanics_symmetry -- --nocapture
```
Both tests are RED today (by design — they catch the instability):
- `a_one_on_one_duel_is_a_coin_flip_not_a_fixed_winner` — the 2-soldier case;
  prints `1v1: south won N/24` (≈12 = fair). It is the GREEN-LIGHT test: when this
  passes, the amplifiers are tamed and the symmetric/mirror suite goes green with it.
- `the_clash_winner_does_not_depend_on_unit_size` — pins the scale-flip.

To re-trace from scratch, the throwaway probes used (recreate in `tests/dbgN.rs`,
delete after): a unit-size sweep (south-win-count vs n ∈ {1,3,8,16,30,60,120,240}),
a per-pass mirror check (`std::env::var("DBGM")`-gated `pos[0]+pos[2]` print after
each tick pass), and a per-soldier velocity log before the position update. See the
commits `spec: …` on this file for the exact numbers each produced.

## ★★ MINIMAL REPRO + scale-flip (2026-06-18) — start debugging from HERE

`crates/sim/tests/mechanics_symmetry.rs` is the dedicated minimal repro (RED, by
design — do not repin):
- **1v1 (TWO soldiers): the north (+y) unit wins ~24/24** — every event is
  traceable. This is the smallest case.
- The bias **FLIPS SIGN with unit size**: south-win-count is 0/16 at n=3, ~15/16
  at n=120, crossing ~even at n=16–30. So it is not "south always wins" — it is a
  scale-dependent positional preference that REVERSES. A real fix must make BOTH
  ends fair, not move the crossover.

★ THE FIRST DIVERGENCE (velocity log, 1v1): at t84 both soldiers have v.y = ±3.296
(perfect mirror); at **t85 south surges** (v.y jumps 3.296 → 3.519) while north
stays 3.333; **north surges one tick later, t86** (v.y → −4.22). The AMPLIFIER is
the SURGE: `max_sp = if err > surge_err_threshold { sprint_sp } else { keep_up_sp }`
(sim.rs ~1518) — a DISCRETE switch that snaps a man's speed cap up to the sprint
ceiling the instant his stretch `err` crosses the threshold. The two mirror
soldiers cross it ONE TICK APART (a sub-threshold `err` difference decides which
crosses first), and the surge's big velocity step turns that into the visible
mirror break; the one who surges first reaches contact first, halts first, and the
other advances past it and wins. So the surge threshold is the discrete amplifier
(per the tipping-point thesis); the SEED is the sub-threshold `err` (stretch)
difference between the two mirror soldiers at ~t85. NEXT: log `err`/`soldier_stretch`
for both at t83–85 and find why one is fractionally larger — that is the true seed
(candidate: the per-man speed cap `stagger01(i)` is index-keyed, so the two have
slightly different caps → slightly different lag → different stretch; a constant cap
did NOT fix the WIN though, so the seed and the positional WIN may be two effects —
verify the constant cap makes the v.y mirror EXACT first). Possible FIX once the
seed is known: make the surge SMOOTH (ramp the cap with err) instead of a discrete
step, so a sub-threshold difference can't be amplified into a one-tick speed jump.

UPDATE: tried the smooth surge (ramp keep_up→sprint across a 2 m band). It did NOT
fix the win (n=1 still 0/20, n=240 still 20/20). So the surge step is a SYMPTOM/
amplifier, not the seed — even ramped, the soldier with fractionally larger `err`
still moves a touch faster, reaches contact first, and loses. Reverted. The seed is
DEEPER: the two mirror soldiers' `err` (=`soldier_stretch`, which at 1v1 is just
`|anchor − p|`) is bit-identical at t84 but DIVERGES by t85 despite mirror
positions. Since `|to|` = `sqrt(to.x²+to.y²)` is bit-exactly mirror-invariant, the
divergence must come from a non-mirror INPUT to t85 — the anchor or the position,
set by `integrate_units` between t84 and t85. NEXT: log `unit.anchor`,
`unit.centroid`, `frame_speed`, and each soldier's `p` for both units across
t84→t85 and find the FIRST quantity that isn't a 180° mirror. That single
non-mirror value, in the frame/anchor integration, is the true seed.

UPDATE 2: traced the UNIT-level state (anchor, centroid, frame_speed) across
t84→t86 — they are bit-perfect mirrors through t85 (`frame_speed` 3.33371 == 3.33371),
the centroid breaking only at t86 (+0.006 y). So the UNIT integration is symmetric;
the break is purely SOLDIER-level. At 1v1 the soldier's `err = |anchor − p|` is 1-D
in y and bit-identical for the mirror pair, so the surge comparison is symmetric —
the only soldier-level quantity that differs by index is the per-man speed cap
`(0.62 + 0.44·stagger01(i))·sprint`. But replacing it with a constant did NOT fix
the win (still 0/24). CONCLUSION: the bias is MULTIPLY-DETERMINED — several coupled
discrete switches (the surge step, the index-keyed per-man cap, the contact-halt
detection) each amplify the same sub-ULP seed, and equalizing any ONE leaves the
others to decide the winner. There is no single bad line; the combat+movement
equilibrium is a tipping point that converts sub-ULP noise into a decided battle.
The real fix is to make the amplifiers continuous/symmetric TOGETHER (smooth surge,
non-index per-man speed, symmetric contact detection) so a sub-ULP seed decays
instead of being switch-amplified — a comprehensive stabilization, exactly the
program in the combat-instability analysis. The 1v1 in mechanics_symmetry.rs is the
green-light test for that program: when a 2-soldier duel becomes a coin-flip, the
amplifiers are tamed.

PASS bisect (env-gated mirror check after each tick pass, 1v1, sum=`pos[0]+pos[2]`):
the 180° mirror first breaks **inside `steer_soldiers`** (the FIRST pass) — the Y
component drifts from 0 at ~t85 (DURING the approach, ~5 m apart, well before
contact at ~t102) and grows monotonically; `apply_separation`/`run_combat`/
`integrate` do NOT change the sum within a tick (the whole break is steer's). So
it is a MOVEMENT asymmetry, not collision or combat. Ruled out inside steer: the
index-keyed per-man speed cap `(0.62 + 0.44*stagger01(i,…))` (replacing it with a
constant still gives 0/24). NEXT: instrument the individual force contributions to
`steer_to` for the two mirror soldiers (slot_pull, neighbour net, comp_push toward
the FOE, magnet, frame feed-forward/cruise) and diff them — the first that isn't a
mirror is the bug. The frame feed-forward cruise (toward the move/attack target,
read from the foe's centroid/position) is the prime suspect — a Gauss-Seidel
in-steer read where unit 1 sees unit 0's freshly-updated state.

1v1 force bisect (the decisive narrowing): disabling EVERY tunable contact force
one at a time — `hit_push`, `magnet_strength`, `weapon_repel`, `compress_strength`,
`separation_max_push` — leaves the 1v1 at 0/24 (north always wins). Snapping the
cos-even residue in `dir()` to exact zero also does NOT fix it. So the asymmetry is
in the NON-TUNABLE CORE: the non-overlap collision solver (`apply_separation`), the
strike resolution geometry (`combat.rs strike()`), or the kinematic integration —
NOT any spring/magnet/repel/push you can dial. It is positional (the +y/−y placement)
and scale-flipping. Next step is source-level: at the 1v1 contact tick, instrument
each of those three for the south soldier and the mirror north soldier and diff the
outputs bit-for-bit — the first divergence is the bug. (The trace shows south HALTS
at y=−1.349 while north ADVANCES through to ~0 and ends deeper; chase WHY the halt/
advance is not mirrored — likely the in-tick Gauss-Seidel position update order in
the collision or integrate pass, which is positional only via who-reads-stale-whom.)

1v1 trace facts (seed 0, evade/block on, morale off): the APPROACH is a bit-perfect
180° mirror (`south+north == (0,0)` exactly) until contact at t≈3.4; the break is
entirely at CONTACT. It is NOT spawn/index order (spawning north as index 0 still
gives north the win), NOT the combat round-robin phase (processing all soldiers
every tick instead of `(phase..n).step_by(3)` does not fix it), NOT RNG. It is
POSITIONAL (the +y/−y placement), i.e. the cos-even facing seed (below) decided in
the contact dynamics. Trace the 1v1 contact tick-by-tick to see which soldier's
halt/strike/push diverges from its mirror first — with two bodies there is nowhere
to hide.

## ★ ROOT CAUSE FOUND (2026-06-18) — read this, the rest is the trail

The seed is **`cos` evenness in the facing direction**, amplified by the
**marginally-unstable frictionless weave lattice**:

- A head-on clash is symmetric under a 180° rotation M: `(x,y)→(−x,−y)`,
  `facing→facing+π`. North should be the exact point-reflection of south.
- `dir(facing) = (cos f, sin f)`. For the two facings ±π/2:
  `dir(+π/2) = (−4.371e−8, +1)`, `dir(−π/2) = (−4.371e−8, −1)`. The y-component
  negates correctly (sin is odd), but the **x-component is IDENTICAL, not negated**,
  because **cos is EVEN** (`cos(+π/2) == cos(−π/2)` bit-for-bit; both are the FP
  residue −4.37e−8, not 0). So under M the facing-x fails to flip: both units carry
  the SAME tiny −x facing bias.
- That −4.37e−8 lateral nudge enters every force that uses `dir(facing)` (frame
  feed-forward, slot layout). The weave's compression + pivot springs form a
  **frictionless, marginally-unstable lattice** (the limit cycle the tweak-mechanics
  skill documents for idle blocks); running, it AMPLIFIES the perturbation
  exponentially — measured 4e−8 → 0.2 m lateral by t=1 s — which the contact grind
  then runs up to a 20/20 win bias. Confirmed: zeroing `compress_strength` OR
  `pivot_stiffness` (killing the amplifier) makes the mirror PERFECT (dev 0.0000);
  they are the amplifier, not the source (they are bit-exactly M-equivariant — the
  source is the cos-even facing seed they magnify).

**The win bias is MULTIPLY-amplified — no single amplifier owns it.** Critical
caveat to the above: zeroing `compress_strength` OR `pivot_stiffness` drives the
early-symmetry break `dev@1s` to 0.000, but the 300 s WIN-rate stays **20/20**.
So the early weave-lattice ringing is ONE amplifier of the cos-even seed, not THE
one that decides the fight. The win bias also survives removing magnet, weapon_repel,
combat RNG (evade/block=0 still 11-vs-23), the gang cap, and position jitter. The
seed (cos-even facing, −4.37e−8) is unavoidable; the system amplifies it through
SEVERAL coupled positive-feedback loops (the weave ring, the contact press, the
morale break-first cascade), so killing any one leaves the rest. This is the
"system lives on a tipping point" thesis in full — the directional bias is the
canary for a fundamentally unstable combat equilibrium, not a single bad force.

**The fix is STABILIZATION, not a force hunt.** And not ONE stabilizer — the
comprehensive program (frontage-preserving re-slot so a thinning line keeps its
frontage, the gang cap, earlier morale break, and lateral lattice damping that
works during motion) applied TOGETHER, each removing one amplifier, until a
−4.37e−8 seed decays instead of growing to a decided battle. Tried and FAILED to
fix the win-rate alone: gang cap, extending the idle reversal-damp to non-at_ease,
a lateral (perp-to-facing) reversal-damp on the steer velocity (even a HARD one
that kills the reversing lateral entirely — still 20/20, because the amplification
lives in the collision/position layer the steer-velocity damp can't reach), and
zeroing compress/pivot. Each kills ONE loop; the fight stays decided by the others. The seed (FP error in cos/sin of a
facing) is unavoidable for arbitrary facings; the bug is that the lattice amplifies
it instead of damping it. The existing fix template — reversal-gated `idle_settle_damp`
(`v·v_prev < 0` → scale) — does NOT reach this case: it is gated on `at_ease`
(false in a clash) AND, more fundamentally, during RUNNING the forward velocity
masks the lateral oscillation's reversal (total `v·last > 0` even as the lateral
component flips), so the gate never fires. A real fix needs to damp the LATERAL
(perp-to-motion) reversing component during motion too — decompose `v` into
along-`last` and perp, damp the perp part when it reverses — WITHOUT dragging the
steady press (re-validate combat: the skill warns naive global drag regressed
combat −5 to −13). Tried: extending the damp gate by removing `at_ease` alone —
did NOT fix it (20/20), because of the forward-masking above. The gang cap also
does NOT fix it (still 20/20): it bounds the local-outnumbering amplifier, a
different one from the lattice instability.


## The finding (2026-06-18)

Rewriting `symmetric_clash_is_even_handed` (single-seed, "even losses") as
`symmetric_clash_has_no_mechanical_bias` (win-count over 20 seeds) immediately
exposed a **systematic directional bias the single-seed test had masked**:

- Default test (team0 south @ y=−13 facing +y, team1 north @ +13 facing −y):
  **team0/south wins 20/20.**
- Spawn north FIRST (low index): **south still wins 9/10** → not processing order.
- Put **team0 at NORTH**: team0/north wins **1/10** → not a team bias.

Conclusion: **the unit at y=−13 facing +y (north) beats the unit at +13 facing −y
(south) ~95% of the time, regardless of team or soldier-index order.** A genuine
+y/−y asymmetry in the engine. The old single-seed pin passed only because seed
4242 happened to be a south-win with loss-ratio > 0.5.

Why it matters (per the combat-instability analysis): identical units must have
NO mechanical bias — any one clash is decisive (the loser routs and is chased, so
a lopsided LOSS COUNT is fine), but across seeds neither SIDE may systematically
win. A 20/20 (or even 18/20) split is a bug: in the game two evenly-matched lines
would have a hidden "the southern one wins" thumb on the scale.

## Where to hunt (not yet found)

The bias is in WINNING THE GRIND (decided before any rout), so it is a +y/−y
asymmetry in combat / movement / collision during the press — NOT in `home_dir_y`
(rout direction only; symmetric here: map_mid_y = 2.0, south < it, north ≥ it).
Ruled out: processing/index order (swapping spawn order didn't move the winner),
team (team0 at north loses). Candidates to instrument next:

- **spawn_class soldier layout / micro-jitter**: if the per-soldier jitter is
  applied in WORLD coords (not facing-relative), the +y and −y units are not
  perfect mirrors and one gets a better opening formation. CHECK FIRST — cheapest.
- **A force with a hardcoded y-sign** in collision.rs / sim.rs steer / combat push
  (grep for literal `0.0, 1.0` / `* -1.0` on a y-component, or facing-angle use
  that isn't symmetric between +π/2 and −π/2).
- **Float asymmetry in a sequential solver** keyed on absolute y.

Method: fix both units' positions, run one seed, and log the loss differential
every 5 s plus each side's centroid/width — see WHERE south's edge appears (first
strikes? formation? a drift?). The divergence starts ~t20-30 from a tiny edge, so
look at the OPENING, not the settled grind.

## Localization so far (2026-06-18 follow-up — narrowed, not yet rooted)

Ran the bisects. Ruled OUT and IN:

- **NOT combat damage.** Immortal (zero-damage) clash still has north disordering
  more: S.coh 0.35 vs N.coh 0.15 at t25. So it is a MOVEMENT/CONTACT-force
  asymmetry, not who-kills-whom.
- **NOT lattice ties / grid-scan tiebreaks.** A 0.05 m per-soldier position jitter
  (breaking exact equal-distance ties) does NOT move it — still 16/16 south.
  Speed jitter (`micro_rough`) doesn't either. It is a true structural asymmetry,
  not a float/tiebreak artifact.
- **NOT `separation_slide`** (the obvious chirality suspect — its `(−slide·ny,
  +slide·nx)` is a fixed +90° world rotation). Zeroing it: still 16/16.
- **AMPLIFIED BY `weapon_repel` AND `magnet`.** In the immortal cohesion-gap
  bisect (avg S.coh−N.coh over t15-30; +0.144 default), zeroing EITHER force
  collapses it: `weapon_repel=0` → +0.035, `magnet_strength=0` → +0.028. `hit_push`,
  `separation_max_push`, `slot_pull` do not. So the bias lives in (or is amplified
  by) the two enemy-facing contact forces — both read foe geometry off `aim`
  (the unit facing, +y vs −y) and the grid.

**CAUTION — the cohesion-gap localization above is a PARTIAL RED HERRING.** It
identified forces that move the COHESION metric, but the WIN-RATE bias survives
removing them: south still wins 15/16 with BOTH `weapon_repel=0` AND
`magnet_strength=0` (weapon_repel alone shaves it to 12/16 — a real but minor
contribution; magnet to 15/16). So who-WINS is decided by something the cohesion
gap doesn't capture, robust to zeroing the two big contact forces. The root is
deeper / multi-causal. Measure the WIN-RATE (over a seed set), not the cohesion
gap, when bisecting next — they disagree.

What's left standing as the suspect surface: the bias is positional (the y-mirror
RESPECTS it — the −13/+y unit wins whether team0 or team1), deterministic, and
survives position+speed jitter and removal of weapon_repel/magnet/slide/hit_push.
That points at something STRUCTURAL and always-on: the per-unit or per-soldier
PROCESSING ORDER combined with in-place position updates (Gauss-Seidel coupling)
in steer_soldiers / collision / combat, where the ABSOLUTE y of a unit (not its
index) selects which gets the stale-vs-fresh read. Index order was ruled out, but
a y-keyed read inside one of those passes was not. This needs a dedicated session
with careful win-rate bisection — not more single-force guesses (slide, ties,
repel, magnet were all wrong or partial).

**Final localization (the GRIND itself, not approach/charge).** Start the two
lines nearly in contact (sep 3 m) at WALK pace — no run-in, no charge burst —
and south STILL wins 16/16. So the asymmetry is in the steady contact grind, not
the closing. Combined with everything ruled out, the remaining suspects are the
per-unit grind machinery keyed (directly or via a non-symmetric bucketing) on
the absolute facing/bearing: `contact_facing` + the `contact_hist` bearing
buckets (if `bearing_bucket()` isn't symmetric about the facing, +y and −y
bearings bin differently), the weave's response to a +y vs −y shove, or the
collision hard-wall snap order. Bisect by WIN-RATE (not cohesion gap — they
disagree): disable `run_morale`/`contact_facing`/the wheel one at a time over the
16-seed set and watch for the count to drop to ~8. The cheapest first check:
`bearing_bucket(θ)` and `bearing_bucket(−θ)` — they should be mirror buckets; if
the boundaries are `[0,30)` rather than `[−15,15)`, that IS the handedness.
(Checked — bearing_bucket IS symmetric: +y→9, −y→3, mirror about 6. Not it.)

## KEY narrowing: the bias needs COMBAT, not movement (2026-06-18)

The decisive control I'd missed: run the two lines into each other with **MOVE
orders** (no attack, no targeting, no strikes — only bodies colliding). Result:
**cohesion is SYMMETRIC** (at t15 north is even HIGHER, 0.798 vs 0.683; it
oscillates with no consistent winner). The disorder asymmetry only appears with
**attack orders** (the fighting state on). So:

- It is NOT pure movement or the collision solver (move-only is clean).
- It IS in the combat-contact layer that only activates when `fighting[i]==1`:
  the enemy MAGNET (front men pulled toward their specific `target`), `weapon_repel`,
  and the strike push/evade — their interaction. (My earlier "immortal proves it's
  not combat" was WRONG: immortal units still FIGHT, just don't die. move-only is
  the real no-combat control.)
- Consistent with the force bisect: zeroing `weapon_repel` or `magnet` (both
  combat-contact forces) each collapsed the cohesion gap.

**The gang cap does NOT fix it** (still 20/20 south at cap 99/3/2; 19/20 at cap 1).
So it is not the local-outnumbering runaway the cap bounds — capping the gang
damps the loss MAGNITUDE (ratio 0.3→0.56) but not the win DIRECTION. The bias is a
deterministic directional preference present every tick, robust to capping the
amplifier. Leading remaining hypothesis: **sub-ULP floating-point non-antisymmetry**
(atan2/sin/cos are not bit-exact antisymmetric in y) in the combat-contact geometry,
deterministically one-signed, amplified by the grind's core feedback (a different
amplifier than the gang the cap bounds). If so the "fix" is either M-equivariant
combat math (hard) or accepting a sub-ULP lean and asserting fairness with a wider
band — but 20/20 is not sub-ULP in OUTCOME, so something amplifies it consistently.

## STRONGEST localization (2026-06-18, no-RNG mirror probe) — read this first

Set evade=block=0 (no combat RNG) and run the perfect-mirror clash. It is STILL
biased (south loses 11, north 23) — so the root is DETERMINISTIC geometry, not RNG
ordering. Tracked the 180° symmetry directly (the two units are point-reflections:
`north_pos == −south_pos` for matching slots; check `max |south+north|` over slots):

- The symmetry breaks at **t=0.40 s — during the APPROACH, long before contact
  (~t4)** — and the break is in the LATERAL **X** component (`sum.y ≈ 0` always,
  `sum.x` grows 0.001 → 0.2 m by t=0.7).
- It **oscillates between fixed slots** (115 ↔ 157, dev 0.170 ↔ 0.197) — a 2-state
  LIMIT CYCLE, i.e. the frictionless-lattice ringing the tweak-mechanics skill
  documents (edge men step out, separation solver shoves back, repeat), here with
  a HANDEDNESS that breaks the mirror and is then amplified by the contact grind.
- NOT the magnet (zeroing magnet_strength leaves dev@1s at 0.197), NOT lattice
  ties (0.04 m position jitter leaves it at 0.186), NOT RNG (above).

So the ROOT is a MOVEMENT-LAYER x-asymmetry under attack orders — a steering/
collision limit-cycle or wheel/frame handedness active while the block is RUNNING
(`at_ease` is false, so the skill's reversal-gated idle damping does NOT fire here).
Move-only (MOVE orders) read symmetric on COHESION, but attack orders differ in
more than the magnet (the facing/intent-vote can wheel under Attack — grep the
`OrderMode::Attack` vs `Move` divergence). Next bisect: zero the steering forces
one at a time (slot_pull, comp_push, the frame feed-forward/cruise, the wheel) and
watch `dev@1s` — the one that drops it to ~0 is the non-M-equivariant op. This is
the same "frictionless lattice rings, needs damping that doesn't poison combat"
family as the idle-block limit cycle; the fix is likely to make that op
M-equivariant or to extend reversal-gated damping to the moving case.

Older note (the combat-contact angle, now superseded by the approach-time finding
above): what does the magnet/strike contact do differently to a +y vs −y front?
The win-rate is morale-amplified (north disorders a hair more → breaks first →
loses), so even a small asymmetry yields 16/16.

Next probe to ROOT it: take ONE south man and the mirror-image north man at the
SAME relative contact geometry, and log what `weapon_repel`/`magnet` each computes
— which foe is selected, the push vector, the recoil. They should be exact
mirrors; find the line where they diverge. The `aim`/`perp = (−aim.y, aim.x)`
construction and the per-cell grid scan order (`for oy in −r..=r`) are the prime
suspects for a +y/−y handedness; instrument, don't guess (every guess so far —
slide, ties — was wrong).

## The test is correct; the engine is not

`symmetric_clash_has_no_mechanical_bias` (win-count ∈ [5,15] over 20 seeds) is the
RIGHT shape and should STAY — it asserts fairness as a distribution. It will go
green once the directional asymmetry is fixed. Do NOT revert it to the single-seed
pin to "pass"; that re-masks the bug.

## ROOTED (2026-06): the magnet live-read + the index-order combat economy

Two distinct seeds, found by tracing a 1v1 (`DBGE` probe: log `err`, `max_sp`,
`steer_to` for both mirror soldiers at the break tick).

**1v1 seed — target acquisition threshold.** `err` is bit-identical for the two
mirror men, but south's `steer_to` surges (the enemy magnet switching on) one
tick before north's. The magnet is gated on `aware_i` (target acquired) crossing
`DISENGAGE_DIST`; the two men cross that hard threshold one tick apart from a
sub-ULP FP residue, and the one-tick magnet lead is decisive in a 1v1. This is
NOT combat order: the round-robin (`for i in (phase..n).step_by(3)`, phase=tick%3)
means only ONE of the two soldiers acts in combat per tick, so Jacobi-fying combat
cannot touch the 1v1.

**The magnet live-read (FIXED, committed 7c43ac0).** The enemy-seek magnet read
`positions[2*te]` — the LIVE, in-place foe position. steer writes positions[i] as
it iterates, so a low-index man saw his foe at tick-start and a high-index man saw
it already moved — a Gauss-Seidel skew. Now reads `prev_positions`. Net +2 on the
suite. (Two more live foe-reads exist in steer — the fighting-pace clamp ~L1759
and the reactive facing ~L1830. Snapshotting them is M-correct but moves the
front-rank facing/velocity one tick, which the charge/bracing tests are tuned to,
so it regressed ~+4. Left as live for now; they belong with a charge/bracing
recalibration, not a free fix.)

**Army-scale seed — combat index order.** Combat applies kill / stun / push IN
PLACE in index order. Team 0 (south) has the lower indices, so a south front-ranker
strikes, kills/stuns, and shoves his north opposite BEFORE that north man acts the
same tick (`alive==0 || stun>0` skip at combat.rs:99) — a systematic first-mover
advantage that compounds with press depth.

**Jacobi combat — tried, REVERTED.** Deferring death+stun+push (accumulate during
the pass, apply after, so mutual kills are mutual) DOES reduce the bias: n=8 even
clash went perfectly fair (survivor diff 0), n=120 diff fell 163→~82. But it
disrupts the finely-tuned charge / bracing / standoff / pike-wall economy — the
hit_push timing and "who dies at the charge contact" are load-bearing for those
contracts — costing net +18 failing tests. Per "revert if it doesn't work," the
combat-Jacobi was reverted; only the magnet snapshot was kept.

**Conclusion / next step.** The army-scale bias is genuinely the combat economy's
index-order resolution. A correct fix (simultaneous strike resolution) is sound in
principle but REQUIRES re-deriving the charge/bracing/pike/standoff test targets
with David — the current numbers encode the Gauss-Seidel behavior. It is a
design-targets task, not a structural free win. Until then the symmetry gates
(`a_one_on_one_duel...`, `the_clash_winner_does_not_depend_on_unit_size`,
`symmetric_clash_has_no_mechanical_bias`, `mirror_duels_*`) stay RED — correctly.

## UPDATE (2026-06): Jacobi KEPT — contact passes are now M-equivariant

David's call: make the sim architecturally sound first, recalibrate the brittle
tests after. So the Jacobi combat was NOT reverted — it and the rest of the
M-equivariance work are committed:

- **Combat** stages strikes (dmg / mount_dmg / stun / push accumulators) and
  applies them after the whole pass — mutual blows are mutual (commit 423cefa).
- **Steer** reads `prev_positions` snapshots for the enemy magnet, the
  fighting-pace clamp, and the reactive facing (was live in-place).
- **Magnet engage** fades in smoothly over its outer band (no hard on-switch the
  tick a target is acquired).
- **Collision charge-impact** momentum (trample bleed + retain-set) is staged and
  applied after the body loop — cross-body Gauss-Seidel removed (commit f619baf).

Result on an even HeavySword clash (8 seeds, survivor diff; 0 = fair):
n=8 → 0, n=30 → ~2, n=120 → ~136 (was ~163 fully in-place). So small/medium
scale is now FAIR; a deep-press residual persists at n=120.

**The n=120 residual is NOT a per-pass order bug** (those are now all
M-equivariant) — it is morale's positive feedback amplifying a sub-ULP FP residue
into a systematic rout. Two things were RULED OUT as the residual: snapping the
`dir()` cos-even handedness (no change, n=30 worse) and slot-keying the per-man
speed cap (worse — the slot layout is itself mirror-FLIPPED under M, so slot ==
slot pairs mirror-opposite men).

**The likely lever for the n=120 distribution:** the per-man speed cap
`stagger01(i, 0xCAFE)` uses a FIXED salt, so the exact same cap pattern repeats
every seed and biases the same side every run. Mixing the run seed into the salt
would make per-man variation vary battle-to-battle, so over the seed set neither
side is favored (the symmetry gate is a DISTRIBUTION, so this is the right shape).
That is a behavioral/design change (per-man traits become seed-varying; moves the
golden hash and every per-man-speed outcome) — flagged for David, not yet done.

These regressions are DELIBERATE and expected (charge/bracing/standoff/pike pins
were calibrated to the old in-place physics); they get re-derived to the corrected
physics, per "sound sim first."
