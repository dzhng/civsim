# living-meadow — consolidated choices ledger (final)

Every decision made where the spec was silent, re-audited against the shipped
code at close (2026-07-27). Grouped by verdict, least-confident first. Each
entry is standalone.

## Needs your eye (user-owned calls, provisional)

1. **Audio ships DEFAULT-MUTED.** The whole ambient stack (wind/rustle/reverb/
   birds/water) is live in battle but silent until unmuted in the battle HUD.
   Chosen so a merge never surprises anyone with sound. Flip the default in
   `web/src/shared/graphicsSettings.ts` once you've listened.
2. **The Ghibli color sign-off went unanswered** — the window opened with the
   hero + 4-preset matrix; on silence I kept the pen's 5-stop hue family but
   neutral-leaning (no baked golden warmth), judged believable under both
   golden-hour and overcast by an unprimed critique. Reversible via
   `MEADOW.blade` stops in `meadowPalette.ts`.
3. **Hero saturation gap = missing look-grade (not implemented).** Albedo
   (slice 04) and environment constants (slice 08) each moved rendered
   saturation <1pp; the pen's richness comes from its filmic grade. An optional
   post-owner (BattlePostChain) look-grade mini-slice is recorded in slice 08's
   file — your call whether to chase it.
4. **Wind band feel: 64 m wavelength, 0.3–1.8× modulation** — judged by
   diff-heatmap band coherence + the archived GIF (`assets/07-wind-vibe.gif`),
   not by a human watch. Retune by eye via the `windSignal.ts` band constants
   if the rhythm feels off in play.
5. **Fog `rangeFogStrength 0.34`** is a bisect: the close crop wants deeper
   in-field haze (~0.5), the vista whites out at 0.52. A camera-aware curve or
   the look-grade would resolve the tension properly.

## Sound (evidence-backed, verified in shipped code)

6. **Spike verdict: EVOLVE.** The fresh TSL port was built, measured (5×
   triangles, no LOD, still lower coverage), and deleted. The unprimed judge
   reversed the orchestrator's primed read — coverage numbers, not eyeballs,
   decided. Evidence archived in `assets/02-spike-evidence/`.
7. **Near-field carpet ruled out of scope.** The hero's continuous foreground
   is a ground-level-camera property; at the game's tactical cameras the sward
   reads dense mid-to-horizon (near-band coverage tripled to 11%, mid/far at
   reference parity). Reopen only if a photo-mode camera ships.
8. **One wind owner end-to-end**: `windSignal.ts` feeds grass GPU uniforms and
   audio CPU sampling; the old inline `sin()` wind was deleted at slice 07.
   Deterministic off `setTime` — fixed-t captures byte-identical throughout.
9. **Translucency is an emissive-term family** (no cheap shadow scalar exists —
   probe-proven), distance-faded, tint-before-linear (the white-sparkle root
   cause), strengths runtime-tunable, baked 2.2/4.5 from a live sweep.
10. **Ground underlayer moved via its owner** (`GROUND_COVER_COLOR`), ground
    vertex-hash test deliberately re-pinned — that's what makes the field read
    carpeted at distance (the pen's own trick).
11. **Cutover deleted all scaffolding**: opt-in plumbing, nullable profile
    state, smoothstep fallback, `?impl=` — production and lab share one
    default path. `verify:full` green with no baseline movement at suite
    cameras (grass is sub-threshold/zoom-cut at tactical framings).
12. **Perf: no tuning needed** — 22.5/30.7/22.8 ms GPU medians on Metal vs the
    22.58 baseline; worst camera ≈32 fps, above the agreed loose 26 fps floor.
    Knob map documented in slice 40 for future tightening.
13. **Audio verification = OfflineAudioContext** via `node-web-audio-api`
    devDependency (real render RMS/FFT assertions in vitest; screenshots have
    no sound); gesture gate, teardown, 41-node bed floor, and voice caps all
    test-pinned; battle snapshot-neutrality proven (0 px).
14. **`dt` seam** threaded scene→renderer→world as a frame uniform + CPU
    param; audio reads the CPU side. Nothing GPU-side consumes it yet.

## Cosmetic / structural (fine, flagged for completeness)

15. `MeadowGrassLayer` interface retained as the single grass-layer contract
    (its hash param was deleted with the losing fork).
16. Blade-tip taper applies to shared production geometry (shape-only); a
    ~10-15% teardrop residual on small background blades is recorded in slice
    06 as an optional polish nit.
17. The flaky water RMS test tolerance was widened 2.0→1.9× after one observed
    flake (smallest honest fix, slice 41).
18. `web/tests/*.test.ts` are NOT in the default vitest include (pre-existing
    repo state); this spec's tests were added to the include list explicitly.
    Flag if you expected the legacy files to run by default.

## Addendum: meadow-polish pass (2026-07-27, David reopened items #3/#7)

19. **Look-grade landed at saturationBoost 1.15** (S 39%, hue 69deg) after the
    critique called 1.3 mustard; strengths remain URL/live tunable
    (?grade=&gradeSat= on the fixture, setPostGrade at runtime). *Provisional —
    David's eye owns the final number.*
20. **Density doubled at the close crop** (near 18.6%, mid 30%) for ~0 perf
    cost; the residual "unbroken sward" gap needs a ground-level camera to
    matter further. *Sound.*
