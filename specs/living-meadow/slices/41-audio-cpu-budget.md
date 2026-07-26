# 41 — Audio CPU-budget audit (deferred, D2)

**Track:** perf · **Gate:** no-accumulation unit test + `director.update` cost in the
averager · **Depends:** `20`–`26`.

## Contract
The ambient-audio subsystem has a bounded, leak-free cost that we've measured, not
assumed.

## API seam — instrumentation
- Active-node count over a 60 s run (the manual harness already publishes
  `activeNodes`).
- `director.update` wall-time added to the perf averager window (must stay
  sub-0.1 ms — it does control-value lerps only; scheduling is self-clocked off the
  render loop).
- One-time IR-build cost (`22`) measured once.

## Budget model
Beds are **O(1)** — 2 looping noise sources + ~12 biquads + 1 convolver, a fixed
floor measured once. One-shots (birds) are the only growth risk → the `25` voice cap
+ interval floor + `onended` disconnect.

## Verification
Unit test asserts node count **returns to the bed floor** after a 60 s bird storm (no
accumulation); `director.update` stays under budget in the averager.

## Delegated
The exact per-frame budget threshold; whether to expose a "low audio" quality tier
that drops the reverb/insects.
