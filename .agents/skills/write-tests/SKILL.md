---
name: write-tests
description: How to write and iterate on tests in this repo — fast cargo first, scale 1v1 before armies, control variables, measure mechanisms not noise. Use when adding sim behavior, fixing a red test, or verifying changes.
---

# Writing and iterating on tests in this repo

## The loop: cargo first, browser last

1. **Iterate on `cargo test -p sim` until satisfied.** The native suite is
   ~25s wall-clock (`[profile.test] opt-level = 2` — keep it). Run with
   `--no-fail-fast` and read EVERY failure before fixing any one of them:
   failures often share a single root cause, and the cheapest diagnosis is
   the union of their messages.
2. **Target single tests while diagnosing**: `cargo test -p sim --test
   combat_scenarios <name> -- --nocapture`. Print diagnostics with the
   assert (`"got {x:.1}m"`) so a red test IS the trace.
3. **Only when cargo is green**, run `npm run verify` from `web/` (~75s).
   It covers web-only glue: wasm boundary, zero-copy views, UI plumbing,
   render health. `npm run verify:full` adds the slow behavioral stages —
   release passes only. NEVER use the browser to verify sim behavior; if a
   behavior matters, it gets a Rust test.
4. **Check the exit code, not just the output.** A python heredoc that
   prints "ok" then a cargo grep that prints nothing looks like success and
   is a compile error. `echo rc=$?` after every suite run.

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

## Measure the mechanism, not the noise

Outcome metrics (kill counts, displacement) are CHAOTIC downstream of the
mechanism — they flip sign across seeds and float profiles. Assert the
physical signature instead:
- Othismos = crowd pressure / line gap, not "pushed 0.5m farther".
- Charge = burst speed at contact and momentum carried, not corpse count.
- Rear vulnerability = use victims who actually evade (light classes);
  heavies barely evade, so their rear test carries the BLOCK asymmetry.
- Facing/direction asserts: only sample where the direction is DEFINED —
  interpenetrated masses (<8m center distance) have no meaningful unit
  bearing; past threat range, turning away is correct. Band your samples.
- If you must assert an outcome differential, give it a wide margin and a
  comment naming it chaos-marginal. A 1.05x bar WILL flip someday.

## Balance tests use the seed-set harness, not single seeds

Two families of sim test, and they want different things (see the README):
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

## When a test goes red after a sim change

In order of likelihood:
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
