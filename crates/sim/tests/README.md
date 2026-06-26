# Sim test map

The Rust sim tests are organized by the question a failure should answer. When
adding a test, pick the narrowest bucket that makes the failure meaning obvious.

## Buckets — defined by what UNITS each may depend on

| Bucket | Units | Use for | Signal |
| --- | --- | --- | --- |
| `mechanics_*` | **IMMORTAL fakes** (zero-damage / 1e9 HP, morale off) | Engine invariants: geometry, facing, cohesion, pressure, symmetry, fatigue, knockdown, charge speed | “The physics changed.” |
| `scenario_*` | **FAKE REFERENCE units** (fixed test-owned stats) | Public-API behavioral contracts and end-to-end emergence | “A promised behavior no longer emerges.” |
| `balance_*` | **REAL class stats** | Stat-vs-price outcomes over matchups or seed sets | “The numbers/economy changed.” |
| Infrastructure | n/a | Determinism, runners, micro-harnesses (`golden.rs`, `runner_smoke.rs`, `terrain_micro.rs`) | “The test harness or replay contract changed.” |

A test may only depend on the layer BELOW it: a mechanics check uses immortal
fakes so no balance can leak in; a scenario uses fake REFERENCE units (the
`mechanics_survivability.rs` `ref_stats`/`REF_BLADE` pattern) with fixed stats, so
a real-class retune can never break it — and those fake stats double as reference
points when balancing. Only `balance_*` touches real class stats; it is the one
layer that *should* move when you tune unit-vs-price.

The litmus: if every class stat were rebalanced to nonsense but the engine code
stayed the same, should the test still pass?

- Yes, and it is a physics invariant: `mechanics_*` (on immortal fakes).
- Yes, and it is a player-visible behavior across systems: `scenario_*` (on fake
  reference units). A scenario pinned on a REAL class is a bug — rebuild it on
  reference units.
- No — it is the priced outcome itself: `balance_*` (on real stats).

## Running — use the focused scripts, NOT the whole suite

The full suite is 10+ minutes; `cargo test` runs binaries in parallel, so a
bucket's wall-clock is just its slowest binary. Run the narrowest bucket for what
you touched (and a single binary is faster still — `cargo test -p sim --test
mechanics_trample`):

| script | covers | speed |
| --- | --- | --- |
| `scripts/test-mechanics` | `mechanics_*` — the physics inner loop | ~tens of sec |
| `scripts/test-scenarios` | `scenario_*` — behavioral contracts | ~tens of sec |
| `scripts/test-infra` | golden / runner / terrain | fast |
| `scripts/test-balance` | `balance_*` — economy matchups | **minutes** |
| `scripts/test-army` | `army.rs` — full-deployment AI battles, swept across sizes | slow, on-demand |
| `scripts/danger-run-all-tests-super-slow` | everything | **10+ min** |

`army.rs` is its own bucket on purpose: full multi-class AI battles fought to a
verdict are end-to-end integration, not focused scenarios, and they're the
heaviest tests — keep them out of the `scenario_*` inner loop.

Changing sim physics? Loop on `scripts/test-mechanics` (or the one binary you're
editing). Only reach for `test-balance` when re-deriving the economy, and the
`danger-run-all` script only before a push that could move everything. The scripts
glob the test files by prefix, so a new `mechanics_foo.rs` is picked up
automatically.

## Naming and migration

- Prefer adding new mechanical invariants to the existing focused file:
  `mechanics_melee.rs`, `mechanics_pressure.rs`, `mechanics_symmetry.rs`,
  `mechanics_charge.rs`, `mechanics_fatigue.rs`, `mechanics_morale.rs`,
  `mechanics_weave.rs`, or `mechanics_gang_cap.rs`.
- Prefer adding new priced outcomes to `balance_harness.rs`,
  `balance_matrix.rs`, `balance_combat.rs`, or `balance_charge.rs`.
- Avoid adding new tests to the generic `scenario_general.rs` unless the behavior
  truly has no clearer home. Prefer a domain-specific `scenario_*` file.
- Migrate old scenario coverage opportunistically when the bucket is
  unambiguous. Do not rename files or split tests just to make the tree look
  tidy; a lower-churn test that still reads clearly is better.

## Shared helpers

`common/` is for tiny, behavior-neutral helpers used by multiple integration
tests:

- `run` advances a sim for seconds.
- `deaths` counts dead soldiers in one unit.
- `living_mean` computes a living-unit centroid.
- `no_morale` and `no_morale_parade` isolate mechanics from rout timing and
  terrain jitter.

Keep scenario-specific measurement local to the test file. If a helper starts
encoding “what this scenario means,” it belongs beside the assertion, not in
`common/`.

## Pass/fail discipline

- Mechanics tests should usually turn morale off so rout timing does not hide
  geometry or pressure regressions.
- Balance tests should use seed sets or aggregate verdicts when asserting a
  priced outcome. Do not pin a decisive matchup to one lucky seed.
- Ignored tests must either be explicit slow review gates (for example the full
  generated balance matrix) or name the missing mechanic/spec gate. Active tests
  should pass before a change is pushed.
