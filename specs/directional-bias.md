# Spec: a directional (+y/−y) bias decides the symmetric clash

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
