# 21 — Wind bed (+ rustle)

**Track:** audio · **Gate:** Offline RMS band-energy + by-ear · **Depends:** `20`.

## Contract
The always-on wind ambience and the grass-rustle layer — the acoustic bed of the
meadow.

## API seam
`packages/ambient-audio/src/beds/WindBed.ts` — **`WindBed`**:
- **wind:** pink noise → `low` (lowpass 150), `mid` (bandpass 520), `hiss` (bandpass
  2600), `whis` (bandpass 1450, Q8 — the gust whistle); gains + mid/hiss corner
  freqs slew toward the director's `windSpeed`/`windGust`.
- **rustle** (sub-layer): white noise → bandpass 4200, gain tracks
  `windSpeed · grassNear`.
- All → `AudioMixer` submix. Fixed node count (record it for `41`).

Driven by a constant wind level in this slice; the real `windSignal` coupling lands
in `23`.

## Verification
Offline render asserts low/mid/high band energy present; `muted` → silent. By-ear on
`/renderer/meadow-audio`.
Fixed node count recorded for `41`: 12 active nodes (2 BufferSource + 5 BiquadFilter + 5 Gain).

## Delegated
Filter constants (copy pen values, tune by ear); the `grassNear` proxy source
(deferred to `23`/`26`).
