# 23 — Director wind coupling  ●── JOIN: windSignal ──●

**Track:** audio · **Gate:** windSignal unit test + Offline band-tracks-input ·
**Depends:** `01`, `21`. **The audio side of the wind join** (tightened by grass `07`).

## Contract
Wind and rustle respond to the **same `windSignal` the grass reads** — so gusts you
*see* sweep the field and gusts you *hear* swell together.

## API seam
`AmbientAudioDirector.update` reads `sampleBattleWind(listenerXY, t)` from
`packages/game-renderer/src/battle/windSignal.ts` (`01`) and maps
`speed`/`gust` → `WindBed` band gains + mid/hiss corner freqs via ramped
`setTargetAtTime` lerps (the pen's `setG` behavior). Audio uses `ctx.currentTime`
for *scheduling*, but its wind *modulation* reads the deterministic signal.

## Verification
`windSignal` determinism unit test (from `01`); Offline probe shows band energy
tracking a scripted wind-speed ramp; by-ear on the harness sliders.

## Join note
`07` (grass wind) and this slice read the same source; once both land, a visible
gust and its whistle are phase-aligned. This slice works off `windSignal` even before
`07` ships — `07` only *tightens* the visual coupling.

## Delegated
Gain-mapping curve from wind speed → band gains.
