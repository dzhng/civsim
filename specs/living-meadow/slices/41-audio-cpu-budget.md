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

Budget summary (LM41AUDIT-9e4d): the documented fixed bed floor is 41 active nodes
before one-shots: wind is 12 active nodes (2 BufferSource + 5 BiquadFilter + 5 Gain)
and water is 29 active nodes (1 BufferSource + 6 BiquadFilter + 6 band Gain + 6
Oscillator + 6 LFO Gain + lowpass + highshelf + output Gain + StereoPanner). Bird
one-shots are capped at 4 concurrent phrases, with each phrase costing 5-13 nodes
(StereoPanner plus 2-6 oscillator/gain pairs), so the transient one-shot cap is 52
nodes over the bed floor; the valley IR remains a one-time build cost measured in
slice 22 at 17.981 ms median over 15 stereo OfflineAudioContext runs at 44.1 kHz.

## Delegated
The exact per-frame budget threshold; whether to expose a "low audio" quality tier
that drops the reverb/insects.
