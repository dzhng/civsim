---
name: write-tests
description: How to write and iterate on tests in this repo — one test at a time (tracer bullets), fast cargo first, scale 1v1 before armies, control variables, measure mechanisms not noise. Use when adding sim behavior, fixing a red test, or verifying changes. Pairs with [debug](../debug/SKILL.md) and [tweak-mechanics](../tweak-mechanics/SKILL.md).
---

# Writing and iterating on tests in this repo

## The loop: cargo first, browser last

1. **Iterate on `cargo test -p sim` until satisfied.** The native suite is
   ~25s wall-clock (`[profile.test] opt-level = 2` — keep it). Run with
   `--no-fail-fast` and read EVERY failure before fixing any one of them:
   failures often share a single root cause, and the cheapest diagnosis is
   the union of their messages.
2. **Target single tests while diagnosing**: `cargo test -p sim --test
   mechanics_melee <name> -- --nocapture`. Print diagnostics with the
   assert (`"got {x:.1}m"`) so a red test IS the trace.
3. **Only when cargo is green**, run `npm run verify` from `web/` (~75s).
   It covers web-only glue: wasm boundary, zero-copy views, UI plumbing,
   render health. `npm run verify:full` adds the slow behavioral stages —
   release passes only. NEVER use the browser to verify sim behavior; if a
   behavior matters, it gets a Rust test.
   - **REBUILD THE WASM FIRST if you touched any Rust** (`npm run build:wasm`
     from `web/`). The verify harness loads the prebuilt wasm, NOT your live
     source — skip the rebuild and you're testing a stale binary. This once let
     a boot-crashing regression (a new class panicking `class_specs`) pass a
     green `verify` and ship: the sim source had the class, the wasm didn't.
4. **Check the exit code, not just the output.** A python heredoc that
   prints "ok" then a cargo grep that prints nothing looks like success and
   is a compile error. `echo rc=$?` after every suite run.

## One test at a time (tracer bullets, not a batch)

Write ONE test, drive it red→green, learn from it, then write the next — never
a batch of tests up front. In this sim you do not yet KNOW what the physics
does until you instrument it (see "Validate, don't assume" below), so a batch
written against *imagined* behavior pins what you GUESSED, not what emerges —
those tests pass when the mechanism breaks and fail when it's fine. Each green
cycle tells you what the next test should actually assert.

- **Write the assert FIRST so the target is concrete**, watch it go red on the
  un-fixed sim, then make the physics earn green — a test you never saw fail is
  decoration (see "Prove a regression test is really red"). For a physics
  change, tweak-mechanics says the same: extend the `mechanics_*` test first.
- **Assert observable physical behavior through the public API** (`spawn_class`,
  public state polls, measured quantities like cohesion/centroid/pressure),
  never an internal field or the shape of a formula. A test that asserts "the
  line holds" survives a rewrite of HOW the holding force is computed; one that
  reaches into the force term breaks on every refactor and pins implementation,
  not behavior. This is also why browser tests never decide sim correctness —
  the Rust layer reads the behavior directly.
- **Don't anticipate future mechanics.** Minimal scenario for THIS claim; the
  next cycle gets its own. Speculative tests for behavior you haven't built yet
  go `#[ignore]` with a rationale, not green-by-accident.

## Scale: 1v1 before armies

Verify behavior at the smallest scale that can show it, then ladder up:
- **Two units, one mechanic** (most tests): one attacker, one target;
  morale OFF (`no_morale()`) unless morale IS the subject.
- **A few units** only when the mechanic is interaction (envelopment,
  queueing at a gate, rout contagion).
- **Full armies** only for integration (`ai_brings_a_battle_to_a_verdict`).
Small tests run in milliseconds, fail with readable geometry, and don't
entangle five mechanics in one assert.

## Control your variables

Every comparison test isolates ONE variable; everything else is pinned:
- Comparing stances? `set_charge_enabled(false)` on both arms — bursts are
  a different mechanic and they dominate outcomes.
- Comparing kiting vs pursuit? Disable the pursuer's charge: running down
  the leg-jitter tail is real, but it's a different claim.
- Same seed, same counts, same classes across arms. Change ONE thing.
If a test breaks after a sim change, first ask "did an unrelated mechanic
leak into this experiment?" before touching constants.

## Validate, don't assume — in a sim EVERYTHING is measurable

It is a deterministic simulation: every claim about a MECHANISM — what causes
what, where the deaths come from, which force dominates, whether a rout or the
fight did the killing — is directly observable. So never *reason* your way to a
mechanism conclusion and act on it; instrument the scenario and read the number.
A plausible story is not evidence, and in this codebase the plausible story is
wrong often enough to burn a session.

- The cost of validating is one throwaway probe (a `tests/dbgN.rs` that polls
  public state and prints); the cost of assuming wrong is a fix aimed at the
  wrong cause. The probe always wins — write it FIRST, before theorising.
- Worked case: the hypothesis was "morale rout is causing all the casualties —
  the loser breaks and gets chased down." A 10-line probe that recorded each
  unit's alive-count *at the moment it routed* vs at the end showed the opposite:
  ~50 of ~54 loser deaths happened BEFORE the rout (n=60), the chase added ~4.
  The fight, not the rout, was the killer — so tuning rout/pursuit would have
  fixed nothing. One probe redirected the whole effort.
- This is the affirmative twin of "measure the mechanism, not the noise" below:
  that rule says don't ASSERT on chaotic outcomes; this one says when you have a
  question about CAUSE, the sim can answer it exactly — go ask it, don't guess.

## Measure the mechanism, not the noise

Outcome metrics (kill counts, displacement) are CHAOTIC downstream of the
mechanism — they flip sign across seeds and float profiles. Assert the
physical signature instead:
- Depth pressure = crowd pressure / line gap, not "pushed 0.5m farther".
- Charge = burst speed at contact and momentum carried, not corpse count.
- Rear vulnerability = use victims who actually evade (light classes);
  heavies barely evade, so their rear test carries the BLOCK asymmetry.
- Facing/direction asserts: only sample where the direction is DEFINED —
  interpenetrated masses (<8m center distance) have no meaningful unit
  bearing; past threat range, turning away is correct. Band your samples.
- If you must assert an outcome differential, give it a wide margin and a
  comment naming it chaos-marginal. A 1.05x bar WILL flip someday.

## The one-line split: mechanical = tight + deterministic; balance = distribution

`crates/sim/tests/README.md` is the current test map. Use it before adding a
new file or moving a test; the short version is:

| Bucket | Question answered by a failure |
|---|---|
| `mechanics_*` | "Did the physics/invariant break?" |
| `balance_*` | "Did the stat-vs-price outcome move?" |
| `*_scenarios` | "Did a public-API behavior stop emerging?" |

Use `crates/sim/tests/common/` only for neutral mechanics like ticking, no-morale
tunables, death counts, and simple living-unit geometry. Scenario-specific
measurements stay local so the assertion remains readable.

The two families want OPPOSITE things from a number, and conflating them is the
single most expensive test-design mistake in this repo:

- **Mechanical invariant** — a physics truth that holds *every* run. Assert it
  **tight and deterministic**: one seed is fine (the physics is deterministic),
  an exact threshold ("centroids never cross", "cohesion > 0.8", "no blob:
  interpenetration < 0.3"). A mechanical invariant that needs many seeds to hold
  isn't an invariant — it's a balance outcome in disguise.
- **Balance / fairness outcome** — anything tuning-dependent or stochastic
  ("cav wins ~60%", "identical units are even-handed"). Assert it as a
  **DISTRIBUTION over a seed set**, NEVER a single-seed value. A single decisive
  battle is *expected* to be lopsided (the loser routs and is chased — a lopsided
  LOSS COUNT is correct); fairness is "neither side wins systematically across
  N seeds", a band like `win_count ∈ [5, 15]` of 20.

**Why a single-seed balance pin is a trap (worked case, this session):**
`symmetric_clash_is_even_handed` asserted "identical units take even losses" on
the hard-coded seed 4242. It passed for months — because 4242 happened to land an
even-ish split. Rewriting it as a *distribution* (`win_count` over 20 seeds)
exposed, on the first run, a **systematic directional bias: the south-facing unit
won 20/20** — a real engine bug the single-seed pin had masked the whole time.
The lesson: **a single-seed assertion on a stochastic outcome is not a weak test,
it is a BLIND one — it certifies whatever the lucky seed did.** If the property is
"no side is favored", it is definitionally a distribution; pin it as one.

(Corollary: "even-handedness" is therefore NOT a mechanical test — do not assert
two identical units take comparable losses in *one* fight. The mechanical
invariants of a symmetric clash are the *physics* — centroids don't cross, no
blob, the line holds — never the score; the score's fairness is a win-rate band
over the seed set.)

## Balance tests use the seed-set harness, not single seeds

Two families of sim test, and they want different things (see
`crates/sim/tests/README.md`):
**behavior/physics** tests (the bulk) assert a mechanism crosses a threshold
at the smallest scale — everything above is about those. **Balance** tests
ask "does performance match price?" and live on the harness in
`crates/sim/src/balance.rs`:

- Build a `Scenario` (`Scenario::duel(a, b)` for a 1v1 cell, or an N-v-M
  `Scenario { sides, .. }` for combined arms / outnumbered stands), then
  `run_over_seeds(&scn, &BalanceConfig::default(), &Tunables::default(),
  &SEEDS)`. You get an `Aggregate`: per-side win-rate + survivor
  mean/median/**stdev** + median duration.
- This is the principled answer to "measure the mechanism, not the noise"
  for outcomes you *can't* reduce to a physical signature: a duel result IS
  chaotic per-seed, so assert on the **aggregate over the seed set**
  (`agg.winner()`, `win_rate >= 7/8`), and let `stdev` tell you when a
  matchup is a genuine coin-flip rather than widening a single-seed margin.
- To check a *tuning* change, `report(&candidate, &scenarios, &SEEDS)` pairs
  a tuned `BalanceConfig` against the default — read the deltas. Stats are
  runtime now (`Sim::with_balance`); you do not recompile to sweep.
- A balance test that is really about slot/price (one heavy solos two lights
  — fair because the heavy costs more gold but fewer army slots) belongs
  here, not in `*_scenarios.rs`. See `tests/balance_harness.rs`.

## Watch the saturation window

Differential tests die two ways: measure too early (mechanism hasn't
engaged — the press takes ~15s to pack) or too late (both arms saturate at
annihilation: 118 vs 120 dead of 120 shows nothing). Pick the window where
the arms have diverged but neither has capped, and write the reason into a
comment on the `run(...)` line.

## Anchor tests to design contracts, not current behavior

When a test goes red after a change, the reflex is to re-measure and pin
the new number. Resist it: a bar calibrated to whatever the sim currently
does will silently encode bugs as baseline — the flash-rout spread term
survived months because every morale test's timing was tuned DURING its
reign, so the suite certified the bug. Write the assert from the design
contract ("high-tier infantry fights 3-5 minutes to ~70% casualties
before breaking") and make the sim earn it. If no explicit contract
exists for the behavior you're testing, that's a design question for
David, not a number to measure-and-pin. Recalibrating a margin is only
legitimate when the CONTRACT itself changed or the metric is declared
chaos-marginal — and the comment must say which.

## The golden hash

`golden_state_hash_stable` pins exact sim behavior. ANY intentional physics
change moves it: re-pin DELIBERATELY from the printed actual value, in the
same commit, with the cause in the commit message. If it moves and you
don't know why, that's a real regression — stop and find it. Note: the
hash is profile-dependent (opt-level changes float results); changing
profiles means one deliberate re-pin plus a margin check on
chaos-marginal tests.

## Probes change the physics (opt-level 2)

An eprintln/dbg! added inside lib hot code changes float codegen enough
to flip chaos-marginal tests — a probe that prints NOTHING can still
alter the outcome you're diagnosing (observed: a dead-branch eprintln in
run_morale flipped a marginal test 57/48 -> 51/58). Even changing a
float literal (.min(0.6) -> .min(2.5)) shifts marginal outcomes by ULP
drift when the branch never binds. Prefer probing from the TEST side
(public state every N ticks); if you must instrument the lib, expect
marginal tests to wobble and re-judge them only after the probe is gone.

## Prove a regression test is really red

When you write a test for a bug you ALREADY fixed (common for visual/LOD bugs:
fix, then add the guard), the test only earns trust if you watch it FAIL on the
unfixed code. Stash or revert the fix, run, see red, restore, run, see green.
But verify the revert actually took: `git stash push <pathspec>` with a wrong
relative path (e.g. `src/...` from the repo root when the file is `web/src/...`)
stashes NOTHING, silently, and your "red" run quietly tests the fixed code and
PASSES — false confidence that the test discriminates. The tell: the "red"
numbers equal the green numbers. Always sanity-check `git stash list` (or that
the metric moved) before believing the red. A test you never saw fail is not a
regression test, it's decoration.

## When a test goes red after a sim change

([debug](../debug/SKILL.md) is the full loop — classify regression-vs-fragility,
instrument the cause. The short triage, in order of likelihood:)
1. The test encodes DELETED semantics (e.g. arrive-braking made walk-ins
   slow; halt-and-stash made attacks stop). Re-spec the test to the
   contract's real claim, not the old implementation's accident.
2. The test's experiment lost control of a variable (new mechanic leaks
   in). Pin the variable.
3. The margin was chaos-tight. Widen with a comment.
4. The sim is actually wrong. Trace it: write a throwaway
   `crates/sim/tests/dbgN.rs` printing the relevant state every few sim-
   seconds, run with `--nocapture`, DELETE it after. Five minutes of trace
   beats an hour of constant-poking.
NEVER tune sim constants to make one test pass without rerunning the whole
suite: the combat economy is coupled, and a constant that fixes one test
reshuffles three others. If two consecutive constant tweaks each reshuffle
different tests, STOP poking — the control surface is wrong, find the
mechanism (see the charge-window-to-centroid story in memory: three
sessions of "calibration chaos" were one wrong ruler).

## Concurrency

Another session may be editing this tree (check `git status` mtimes if
something impossible happens, e.g. fields vanishing mid-build). Wait for
quiescence (`find crates -newermt '-60 seconds'`), don't clobber, and only
finish another session's rename if it's mechanically unambiguous.
