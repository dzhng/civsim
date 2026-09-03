# 23 — force-tracer

**Contract unlocked:** force-trace instrumentation is one value with one
method; the physics reads as physics.

## Seam

```rust
// crates/sim/src/force_trace.rs
pub(crate) struct Tracer<'a> {
    #[cfg(feature = "force-trace")] buf: &'a mut Vec<ForceRecord>,
    tick: u64,
}
impl Tracer<'_> {
    #[inline(always)]
    pub(crate) fn record(&mut self, soldier: usize, unit: usize, ch: ForceChannel, before: Vec2, after: Vec2, tag: &'static str) { /* empty without the feature */ }
}
```

Replaces the 53 `#[cfg]` blocks in `sim.rs` and 17 in `collision.rs`
(the `let before = …; … push(ForceRecord::…)` pairs at e.g. 2914-2930,
3122-3135). Each site becomes one line. The `seeking_flank_curl`
re-evaluation inside a cfg block (`sim.rs:2854`) goes with it.

## Decisions resolved here

Channel names and vectors are unchanged (`force_trace.rs::force_trace_smoke_covers_expected_channels`
pins the set; the untraced-displacement residual ≤ 2e-5 pins the vectors).

## Delegated to the implementer

Whether `before` is captured by the caller or by a `record_delta` variant.

## Verification

- **G-ft explicitly** — `cargo test --workspace` never compiles
  `tests/force_trace.rs` (`#![cfg(feature = "force-trace")]` at line 1).
  Baseline G-ft at HEAD first; it may already be red.
- G-infra identical with the feature off (the tracer compiles to nothing).
- G0.

## Must stay green

Golden hash; force-trace channel set and residual.

## Feedback that would change this slice

None.
