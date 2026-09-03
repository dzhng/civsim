# 24 — sim-knobs-and-probes

**Contract unlocked:** `Tunables` holds only knobs production varies; the
closed melee-blob attribution probes and their copied helpers are gone.

## Seam

- Delete `Tunables::disorder_norm_spacings` (`tunables.rs:61`, default `:338`;
  read nowhere).
- `engaged_deep_reform`, `engaged_deep_reform_ticks`, `corridor_deployed_width`,
  `seeking_flank_curl` (`tunables.rs:267-290`): written only by env-var hooks
  in `tests/mechanics_melee.rs:83-98` and `tests/force_trace.rs:74-95`.
  Collapse to their defaults (`tunables.rs:395-400`: true / 60 / false / true)
  so the branches at `sim.rs:1130-1132, 2294, 2839, 2854` become straight
  code. Hash-preserving because defaults are kept.
- Delete the `#[ignore]` attribution probes that read them: 13 in
  `mechanics_melee.rs` (2288-3581) and 5 in `force_trace.rs` (from 371); they
  reference melee-blob slices 03/04/05 whose spec is in `specs/done`. They
  cannot compile once the knobs go, hence one slice.
- `tests/common`: single owners for `pca_major_axis` (force_trace.rs:231 /
  mechanics_melee.rs:858), `cohort_rotation_deg` (:312 / :3367), `block()`
  (mechanics_formation.rs:16 / mechanics_weave.rs:244), `run()`
  (mechanics_trample.rs:78 shadows `common::run`).
- `src/bin/weave_shots.rs:197-262` copies the perturbation helpers of
  `tests/mechanics_weave.rs:351-425`: `#[path = "../../tests/common/mod.rs"] mod common;`
  or a `sim::testkit` module behind the `shots` feature — pick the one that
  keeps `tests/common` the single owner.

## Decisions resolved here

Probes are deleted, not moved; the spec that needed them is closed.

## Delegated to the implementer

`testkit` module vs `#[path]` include.

## Verification

- G-infra identical. G-mech, G-scn, G-ft (probe count drops by 18; the
  non-ignored tests unchanged).
- `grep -rn "#\[ignore\]" crates/sim/tests | wc -l` → the remaining ignored
  tests are documented instruments (`balance_matrix`, `scenario_ranged`
  calibration), not probes.

## Must stay green

Golden hash; every non-ignored sim test.

## Feedback that would change this slice

David wanting an attribution probe kept → it moves to `tests/probes_*.rs`
with its knob turned into a probe-local parameter, never a `Tunables` field.
