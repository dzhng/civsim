# 25 — spawn-owner

**Contract unlocked:** one spawn, one files clamp, one battle constructor.
Named pins may move and are re-pinned individually.

## Seam

```rust
pub struct SpawnSpec {
    pub anchor: Vec2, pub facing: f32, pub count: usize, pub files: Option<usize>,
    pub class: UnitClassId, pub stats: UnitClass, pub look: u32, pub team: u32,
}
impl Sim { pub fn spawn(&mut self, spec: SpawnSpec) -> usize; }
impl Unit { pub fn files_bounds(count: usize) -> RangeInclusive<usize>; }  // set_files uses it too
```

- `spawn_class` and `spawn_unit` stay as three-line conveniences over
  `spawn`; `spawn_class_with_files`, `spawn_class_stats_with_files`,
  `spawn_class_stats_look_with_files` are deleted (46 test callers → `spawn`).
  `spawn_unit` no longer hardcodes LightSpear stats every caller overwrites.
- Files clamp = `(count / 3).max(lower)` (`sim.rs:644`, `set_files` `:823`);
  the `files.clamp(lower, count.max(lower))` rule at `:560` goes.
- `default_weapon` (grind sidearm, `sim.rs:574-585`) applies on every spawn.
  Today only the quick-battle path (`game-wasm/lib.rs:158`) sets it; campaign
  battles (`battle.rs:70`) never did. Unifying gives campaign cavalry its
  sidearm — the correct behaviour, and a named change.
- `Battle::from_setup → from_setup_with_stats → from_setup_with_stats_and_looks`
  (`runner.rs:53-62`) collapses to one; `deploy_roster` (`battle.rs:421-424`,
  0 callers) deleted; `auto_resolve` (`runner.rs:214`, test-only) moves to
  `tests/common`.

## Sub-slices

- **25a** — unify code with both clamps preserved behind the callers that used
  them and no sidearm change: G-infra identical. Proves the move.
- **25b** — one clamp + sidearm everywhere. Expected movers:
  `custom_deployment.rs:122-140` and `scenario_class.rs:560` (frontage),
  `combat_handoff.rs` (campaign cavalry weapon), possibly `golden.rs`. For
  each: verify the mechanism (tweak-mechanics), re-pin individually,
  `change-report`.

## Decisions resolved here

Clamp rule and sidearm-on-every-path (README). `codex review --uncommitted`
on 25b.

## Delegated to the implementer

Field order in `SpawnSpec`; whether `look` defaults from class.

## Verification

25a: G-infra identical, G0. 25b: G-infra (re-pinned with the stacked-comment
convention in `golden.rs`), G-mech, G-scn, G-bal, `cargo test -p campaign`,
then G-wasm + G-verify.

## Must stay green

Everything not on the mover list.

## Feedback that would change this slice

David wanting a one-rank line spawnable → `files` stays an explicit override
that bypasses the clamp, with one test pinning it.
