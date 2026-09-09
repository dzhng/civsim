# Live root / phase agreement

Candidate based on `e879fb47`, including the motor-capable travel observation.
The bounded endpoint-extrapolation candidate is **rejected**. CPU clock agreement
does not compensate for amplified contact corrections. This leaf archives a
failed presentation experiment, not accepted runtime behavior or snapshot gates.
The production patch and capture scene remain isolated and unmerged in
`codex/live-root-phase` and its ignored `throwaway/root-phase/` scratch archive.

## Contract and limits

Roots sample the latest authoritative endpoint plus the existing simulation
fraction times raw endpoint displacement per observed tick. Each new observation
reanchors the endpoint; rendered predictions never become history. Batched reads
use their interval average. This includes disabled transport, unlike the motor
travel used for gait. It neither identifies voluntary movement nor proves a foot
plant. There is no teleport threshold or correction smoothing. An unobserved stop
can overshoot for a fraction of one tick; a later correction can visibly snap.

First appearance, rewind/shrink and death have no prediction. Ordinary pause
retains the fraction. Explicit freeze samples the integer endpoint without
discarding the rate, so unfreeze restores the held fractional sample. The current
debug API has no same-tick soldier-position setter: spawn appends bodies, orders
and formation changes do not directly rewrite their endpoints, and advance moves
the observation tick. No new same-tick mutation protocol is introduced.

The crowd returns the same displayed-root array it submits to the renderer.
Selection rings consume it explicitly; attack arcs read that array locally.
Readouts/standards retain their existing displayed-centroid path. Order grids,
paths, queued destinations and authoritative world accessors are unchanged.

## CPU evidence

The actual Game → views → adapter → crowd fixture uses the production SimClock.
The original fractional tracer failed with 0 m root displacement versus
0.0171881585605214 m of stride-scaled phase advancement. The implementation makes
those agree without a new clock. Both paused samples remain identical; explicit
freeze uses the raw endpoint and unfreeze restores the previous live sample.

The existing residual-easing expectations were deliberately replaced: a one-metre
observation now anchors at one metre, not 0.75 m; a stationary next observation
stays at one metre, not 0.82 m. Additional assertions cover same-tick fractions,
append, batched averaging, rewind, a large correction, disabled transport and
death. The attached-overlay test separately fails when either arc origins or
selection-ring origins are mutated back to authoritative positions. Destination
rings and ground cues are protected unchanged controls.

Focused adapter/crowd tests: 12 passed. Final full web suite: 345 tests in 60 files
passed, as did typecheck. An independent CLI review found no actionable
regressions and independently passed typecheck and the 12 focused tests (session
`01a07d41-09bf-7311-b1bd-e2d0e9c250a4`); it did not verify browser visuals.
Raw red, mutant and green outputs remain
in this worktree's ignored `throwaway/root-phase/` directory.

## Decision scope

Endpoint extrapolation, authoritative freeze, displayed attached overlays and the
absence of correction thresholds were specified by the parent policy. Local
implementation choices are separate endpoint/rate arrays, explicit return of the
rendered roots to the tactical-overlay caller, and a read-only clock snapshot in
existing debug stats. The latter exposes no setter or new animation authority.
The prospective incapacitated-gait policy remains a separate follow-up.

### Local choice audit

Both entries belong to this bounded pass. Their local ownership is reasonable,
but neither rescues the rejected visual policy.
The selected prediction policy itself is already specified, not a new choice.

- **Reuse the submitted roots for the next overlay draw.** When a soldier is
  drawn partway beyond its latest engine position, the following ring draw gets
  that same array rather than fetching engine positions again. The plan required
  attachment but did not choose the handoff shape. Returning the existing array
  avoids a second prediction or per-frame copy. Its reach is local: consumers
  must read it during the current draw, not retain or modify it as world state.
- **Keep endpoint rates in double precision.** When several engine ticks arrive
  together, division by their count produces a fractional displacement. The
  cached engine endpoints and final submitted roots remain 32-bit numbers, while
  that rate uses 64-bit numbers until the final sum. The plan required separate
  caches but did not choose their storage widths. This adds 24 bytes per soldier
  for endpoint plus rate caches (720,000 bytes at 30,000 soldiers), allocated on
  size/reset changes, not each frame. There is no serialization or save change;
  no frame-rate or hardware-envelope claim follows from this choice.

The read-only clock diagnostic was explicitly approved before implementation.
It returns existing clock values through existing debug stats; it does not permit
setting the fraction. The repaired smoke and repeat exercise the live fractional
path deterministically; that setup proof is not visual acceptance.

## Behavior-change ledger

All test names below are in `web/tests/battleActionAdapter.test.ts`. No simulation,
unit-stat, weapon, golden-output or save-format inputs changed.

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| production crowd preserves smoothed positions across append and resets playback on catalog replacement (renamed to production crowd reanchors endpoint prediction across append, batches, corrections and reset) | A 1 m observation submitted 0.75 m, including after append; the next stationary tick submitted 0.82 m. | Integer observation submits 1 m; same-tick fractions submit 1.5/1.75 m; the stationary tick stays at 1 m. Append starts new bodies at raw endpoints; reset, batch, correction, disabled transport and death are pinned explicitly. Catalog replacement still resets playback phase. | Replaced once-per-observation residual easing with the specified endpoint prediction, deliberately retiring the old easing contract. **moved** |
| production crowd root and gait share fractional simulation time (new) | On the original implementation, the tracer measured 0 m of root travel while stride-scaled phase advanced 0.0171881585605214 m. | Those distances agree to six decimals; pause holds, freeze anchors, unfreeze restores, and a stationary observation stops translation. | The real SimClock fraction now reaches both root and phase sampling. **moved** |
| soldier-attached rings, arcs and readout inputs follow displayed roots, not order destinations (new) | A root at 1.5 m would leave selected rings and arc origins at the 1 m engine endpoint. Independent reverted-origin mutants each fail. | Rings, arc origins and readout inputs equal the submitted 1.5 m root; destination rings and ground cues remain exact. | The ring caller now receives submitted roots explicitly and arcs use the same local array. **moved** |

The existing distance-driven crowd test only shares the factored canonical heavy
fixture loader; its measured-distance, phase, pause and unqualified-transport
assertions are unchanged. All other existing assertions are unchanged.

## Visual evidence

The repaired held smoke and exact repeat passed at alpha 0.18, with an approximately
147-pixel projected soldier. The earlier post-boot fake-clock installation did not
produce the intended tick interval and was rejected; the next correct-clock attempt
was only 24 pixels tall and was rejected as unreadable. Both remain in scratch.

The matched A/B comparison contains two 64-frame windows per variant. A retains
the original residual easing; B predicts beyond the latest endpoint. Commands,
engine ticks, fractional clock, authoritative endpoints, selected identity, alive
state and formation match exactly across all 128 paired samples. The start window
issues a real move at frame 8 and G/Reform at frame 40 after 0.1770409658436936 m
of travel. Reform is not an instantaneous stop. The contact window first records
engagement at frame 6. Both captures completed successfully with closed browsers;
there was no full-film repeat or accepted baseline promotion after rejection.

[Ordered sheets, looping review GIFs, whole contexts and raw paired traces](rejected/)
preserve the comparison. GIFs use 20 ms frames for 16 ms sample steps, so they are
review-only, not a cadence measurement. Sheets preserve every frame in order.
All 64 images differ in each window; pixel counts measure change, not quality.

The author inspected all 256 ordered tiles across both windows and the whole
contact context. B's contact frames 11–13 and 38–40 clearly move the body/ring
cluster forward and back more abruptly than A. At frame 39 the B submitted root
is about 0.5 m beyond its current authoritative endpoint; the A/B root separation
is 0.8426382112876817 m. Start movement can look more continuous toward an endpoint,
but B also increases rank weaving. Attached rings broadly follow bodies; this is
not evidence of planted feet. Occluding ranks and translucent attack arcs prevent
reliable foot-contact and some limb-boundary judgments.

The [fresh neutral critique](rejected/critique.txt), session
`01a07d6d-060a-7010-8186-4c85f4b6190b`, inspected all 16 sheets/256 tiles,
four whole contexts and four enlarged frame-39 crops. It preferred A for start
(moderate confidence) and contact (high confidence), independently identifying
the same contact excursions. Parent review inspected all sheets and full B
frames 38–41 and confirmed rejection. No additional capture was authorized.

The next policy requires a separate decision: interpolate only an observed
interval, with root and completed-distance phase at the same delayed time. Merely
sampling the previous action history at its old predicted rate is not sufficient,
especially when a speed change and an interruption share a boundary. No delayed
history, event policy, threshold or replacement smoothing is implemented here.

The first smoke stopped at renderer boot because Vite denied an external WASM
symlink (403); no images were produced or judged. An ignored local byte-identical
copy corrected the setup, without changing source or server permissions. WASM
SHA-256: `8ab9bd8ea4cfd2d3de456bc0ca25d7f33a6f941d2b51babf0bfc493638e2a8a5`.
The second boot attempt retained Vite's cached old resolved URL and failed for
the same reason. Restarting only this worktree's server corrected the transformed
chain: `/src/main.ts` imports `/src/wasm/game_wasm.js`, which resolves the local
`/src/wasm/game_wasm_bg.wasm`; all three fetched successfully, and the final
1,079,943 bytes compiled on CPU. The stale donor `@fs` URL still correctly returns
403. That exact URL/body and repaired-chain probe are preserved in scratch.

The A-control worktree is also based on `e879fb47`. Its only tracked-source
changes are identical read-only clock and submitted-root diagnostics; its capture scene and WASM
match the candidate byte for byte. Neither worktree changes engine, package or
public-asset source. The control retains the original easing and original overlay
root sources, rather than trying to reconstruct them from the new implementation.
