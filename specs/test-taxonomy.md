# Spec: mechanical vs balance test decoupling — the taxonomy and how to hold it

## The principle (David's, the standing test-suite directive)

A test answers exactly ONE of two questions, never a blend:

- **MECHANICAL** — *"does the physics do the right thing?"* A tight, deterministic
  INVARIANT of the engine. Same seed, same answer; the margin is small and the
  claim is structural (a centroid never swaps, facing stays ±y, a flanked man
  feels less pressure, deep pikes bite only to the front). A mechanical test must
  NOT move when someone retunes a weapon's damage or a class's price — if a balance
  knob can flip it, it was secretly a balance test.

- **BALANCE** — *"is the matchup priced right?"* A DISTRIBUTION over a seed set:
  who wins, by how much, for what cost. Any single seed of a decisive fight is
  lopsided and lands either way; the truth is the majority/mean over seeds. A
  balance test must NEVER be pinned to a single-seed outcome (that measures the
  dice, not the design) and must read a stats-vs-price quantity (win-rate, survivor
  share, casualty fraction, cost-efficiency).

Why decouple: a "bit-of-each" test fails for two unrelated reasons and you can't
tell which. A mechanical regression (the front blobs) and a balance shift (swords
got cheaper) both move it, so it flaps on every recompile and teaches nothing. Split
them and each failure has ONE meaning: a red `mechanics_*` test = the physics broke;
a red `balance_*` test = the numbers need re-pricing. The keystone triage
(`test-suite-to-100.md`) only became legible BECAUSE the mechanical invariants were
already isolated — all 8 reds landed in `mechanics_*`, pointing at one engine root.

## The litmus test (which bucket?)

Ask: **"if I rebalanced every stat to nonsense but left the engine code untouched,
would this test still pass?"**
- YES → mechanical. It asserts a physics property, not an outcome.
- NO → balance. Its truth depends on the numbers.

Corollaries:
- A test that asserts a WINNER, a kill count, a survivor %, or a price is balance.
  It belongs in a `balance_*` file and must run over a seed set.
- A test that asserts a GEOMETRY, a facing, a cohesion floor, an interpenetration
  bound, a pressure ordering, a "this force equals that force" identity is
  mechanical. Single-seed deterministic is fine (and preferred); turn morale OFF so
  it can't confound the physics.
- "It uses two units and a fight" does NOT make it balance. The question is what it
  ASSERTS, not what it spawns.

## The current taxonomy (file naming IS the contract)

Three test layers + infrastructure. The prefix declares the bucket; keep it honest.

**`mechanics_*` — engine invariants (deterministic, morale usually off):**
`mechanics_melee` (clash physics: centroids, swirl, interpenetration, latch≡move),
`mechanics_weave` (the formation as a mass-spring lattice in isolation),
`mechanics_pressure` (contact pressure + ground, flank-vs-front ordering),
`mechanics_symmetry` (the +y/−y bias repro — distribution-shaped but a MECHANICAL
fairness invariant, not a price), `mechanics_charge` (trample absorption),
`mechanics_gang_cap` (the wound cap), `mechanics_fatigue` (fatigue saps speed/output),
`mechanics_morale` (per-class bravery, allied-steadiness — the morale *mechanism*,
not matchup outcomes).

**`balance_*` — stats-vs-price outcomes (N-seed, distribution verdicts):**
`balance_matrix` (the 9×9 counter-web + generated matrix), `balance_harness`
(N-seed harness; cav-vs-heavy survivor verdict lives here), `balance_combat`
(per-class combat performance), `balance_charge` (cavalry/charge matchups). All read
win-rate / survivor share / cost-efficiency over seeds; none pins a single seed.

**`*_scenarios` — behavioral/emergence contracts (the integration layer):**
`combat_scenarios`, `class_scenarios`, `morale_scenarios`, `ranged_scenarios`,
`missile_scenarios`, `weapon_scenarios`, `posture_scenarios`, `nav_scenarios`,
`pacing_scenarios`, `terrain_scenarios`, `ai_scenarios`, `scenarios.rs`. These drive
the PUBLIC API end-to-end and assert a promised emergent BEHAVIOUR ("archery softens
but doesn't gate", "a phalanx hit from behind pays", "the AI fights with the same
verbs as the player"). They are deliberately the broadest layer (per the review
creed: test the outermost entry point). Each scenario test should still lean one way
— a behaviour it asserts is usually a mechanical contract verified through the API;
if it asserts a PRICE/winner it has a balance flavour and should read a seed
distribution, not one roll.

**Infrastructure:** `golden.rs` (bit-identical regression hash — the determinism
tripwire; re-pin only with an intended physics change), `runner_smoke.rs`
(campaign-facing runner integration), `terrain_micro.rs` (micro-terrain harness).

## Holding the line (the maintenance standard)

1. **Name by bucket.** A new physics invariant goes in a `mechanics_*` file; a new
   matchup verdict in a `balance_*` file. Don't add balance assertions to a
   `mechanics_*` file or vice-versa.

2. **The mixing tripwire (run it before declaring "decoupled"):**
   ```
   # balance words leaking INTO mechanics files:
   grep -lE "win_rate|unit_cost|\.surv|price|usually|majority of seeds" mechanics_*.rs
   # mechanical words leaking INTO balance files:
   grep -lE "faceDev|max_facing_dev|interpenetration|centroid.*cross|swirl" balance_*.rs
   ```
   Both empty = clean. (Verified empty 2026-06-20 — the suite is already split; this
   spec documents the invariant so it STAYS split, and gives the next author the
   rule rather than taste.)

3. **Decouple a found mixer by SPLITTING, not deleting the coverage.** When one test
   asserts both a physics invariant and a priced outcome (the classic "bit-of-each"),
   cut it in two: the invariant half (deterministic, morale off) to a `mechanics_*`
   file, the outcome half (N-seed distribution) to a `balance_*` file. Each half
   keeps its own, single-meaning failure. Precedent this session:
   `cavalry_usually_rides_over_heavy_swords` was a single-seed-flavoured price test
   asserting the wrong metric; it became the survivor-distribution balance test
   `formed_heavy_infantry_holds_a_frontal_cav_charge`, with the
   physical-geometry half (`rider_reachability_is_pure_geometry`) already separate in
   `combat_scenarios`.

4. **A balance test that can't pass yet is `#[ignore]`d with the target + the gate**
   (e.g. `a_frontal_charge_bloodies_the_infantry_even_when_repulsed` — gated on the
   lethality keystone), NOT repinned to a passing seed. A mechanical INVARIANT that
   catches a real engine bug stays RED, not green-pinned (the bias gates — see
   `directional-bias.md`). Hiding either is the cardinal sin: it converts a true
   signal into a silent lie.

5. **Mechanical tests turn morale OFF** (`Tunables { morale_enabled: false, .. }`) so
   the physics isn't confounded by will; balance tests usually leave it ON (rout and
   pursuit are part of the priced outcome).
