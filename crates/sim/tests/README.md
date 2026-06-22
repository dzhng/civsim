# Sim test map

The Rust sim tests are organized by the question a failure should answer. When
adding a test, pick the narrowest bucket that makes the failure meaning obvious.

## Buckets

| Bucket | Use for | Signal |
| --- | --- | --- |
| `mechanics_*` | Engine invariants: geometry, facing, cohesion, pressure, symmetry, fatigue, morale mechanism | “The physics changed.” |
| `balance_*` | Stat-vs-price outcomes over matchups or seed sets | “The numbers/economy changed.” |
| `*_scenarios` | Public-API behavioral contracts and end-to-end emergence | “A promised behavior no longer emerges.” |
| Infrastructure | Determinism, runners, micro-harnesses (`golden.rs`, `runner_smoke.rs`, `terrain_micro.rs`) | “The test harness or replay contract changed.” |

The litmus test is: if every class stat were rebalanced to nonsense but the
engine code stayed the same, should the test still pass?

- Yes: put it in `mechanics_*`.
- No: put it in `balance_*`.
- It is mostly about the public API or a player-visible behavior across several
  systems: put it in a descriptive `*_scenarios` file.

## Naming and migration

- Prefer adding new mechanical invariants to the existing focused file:
  `mechanics_melee.rs`, `mechanics_pressure.rs`, `mechanics_symmetry.rs`,
  `mechanics_charge.rs`, `mechanics_fatigue.rs`, `mechanics_morale.rs`,
  `mechanics_weave.rs`, or `mechanics_gang_cap.rs`.
- Prefer adding new priced outcomes to `balance_harness.rs`,
  `balance_matrix.rs`, `balance_combat.rs`, or `balance_charge.rs`.
- Avoid adding new tests to the generic `scenarios.rs` unless the behavior truly
  has no clearer home. Prefer a domain-specific scenario file.
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
