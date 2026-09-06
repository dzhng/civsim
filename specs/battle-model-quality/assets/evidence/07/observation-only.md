# Observation-only timeline update

The controller now observes atomically through `update(): void`; `sample()` is the sole playback-output owner. The battle and replay consumers already ignored the old returned array. Removing it avoids a second per-soldier playback construction on observation frames without changing the history transition arithmetic, immutable snapshot cache, or commit boundary. The existing unconditional construction of `previous` for same-appearance histories remains untouched; this result does not establish that further change is warranted.

## Verification

Baseline: `362cf738`. Node v24.14.0, Darwin arm64. No GPU run.

```sh
TIMELINE_PROFILE_BASE=362cf738 ./web/node_modules/.bin/vitest run --config specs/battle-model-quality/assets/evidence/07/frozen-capture-profile.config.ts
cd web
./node_modules/.bin/vitest run tests/actionTimeline.test.ts tests/actionTimelineMounted.test.ts tests/playbackPacking.test.ts tests/battleModelReplay.test.ts
./node_modules/.bin/tsc --noEmit
```

The 47 focused tests and typecheck passed. Every production timeline consumer already separates observation from output sampling. Test value consumers were migrated directly, without a compatibility wrapper.

Root integration0129ee2e repeated all47 focused tests and typecheck successfully.
Integration review found no pose assertion or tolerance changes, no new runtime
owner, and no compatibility path. The production diff removes redundant output
construction (four added logic lines, five removed, plus one contract comment).
The larger test diff is the direct API migration; raw profile rows dominate the
evidence size. Browser cadence and temporal capture remain separate open gates.

The opt-in profile compares real loaded class 4 and mounted 41 fixture bundles, 30,000 independent histories, synchronized and deliberately interleaved release ages, seven observation ticks, and three paired repeats with alternating execution order. Timing brackets contain only update; both versions sample and compare complete evaluated poses afterward. All **2,520,000 exact posed-output comparisons passed**. Raw timings are in [observation-only-profile.json](observation-only-profile.json); `aMs` is the pinned baseline and `bMs` the candidate.

Timing is mixed across these short, allocation-sensitive runs. Example median-of-three results in milliseconds:

| Case | Tick | Baseline update | Observation-only update |
| --- | ---: | ---: | ---: |
| Foot synchronized release | 10 | 8.159 | 4.438 |
| Foot synchronized restart | 11 | 5.276 | 7.947 |
| Mounted synchronized release | 10 | 11.566 | 9.873 |
| Mounted synchronized restart | 11 | 11.188 | 28.948 |
| Mounted interleaved restart | 11 | 664.224 | 657.349 |

These numbers establish exactness and removal of known unused output work, **not** a robust elapsed-time improvement, browser cadence improvement, or art-budget acceptance. The paired process shares JIT/GC pressure and has only three observations per case; it is not a warmed frame benchmark. Hardware cadence must be evaluated separately after integration. No timing threshold or visual expectation was weakened.

## Change ledger

No asserted pose value, tolerance, priority, phase, memory count, or rejection condition changed. The 28 tests below were mechanically migrated from the returned update result to a separate sample at the just-committed observation tick. The API source changed first and produced type errors in these callers; the direct migrations restored typecheck and all unchanged assertions. No unit stats changed.

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| web/tests/actionTimeline.test.ts: corpse presentation leaves live instances unchanged and keeps manual corpses terminal | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: corpse presentation is terminal for initially dead and reset histories | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: action entry starts locally and locomotion follows authored duration | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: held pike readiness selects its authored rest action only while stationary and not at ease | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: death starts at observation, holds its last pose and freezes equipment until reset | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: only observed injury starts recoil, which completes before returning to movement | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: paused observations cannot replay events; growth retains histories and backwards time resets | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: engagement repeats complete authored melee efforts without fabricating hits | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: firing enters the authored release marker once per observed onset or refresh | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: render sampling advances clip time without advancing observation or consuming injury | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: mounted effort overlays ongoing gait and full-body injury clears that overlay | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: completed mounted action fades back to the current gait without resetting its phase | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: equipment changes retain injury history but never mix old and new clip indices | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: death beats simultaneous release, injury and engagement; inapplicable release stays absent | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: interruptions preserve the exact blended pose, including repeated early and late interruption | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: consumers cannot mutate controller-owned interruption snapshots | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: identical interrupted poses share one immutable numeric snapshot without synchronizing later actions | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: snapshot reuse ends at reset, rewind, and replacement catalog boundaries | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: nearly equal release phases stay distinct while an exact repeated pose can reuse its snapshot | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: a rejected batch cannot commit a partial terminal death or reset existing histories | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimeline.test.ts: an already-decayed firing observation starts after its marker and clamps spent recovery | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimelineMounted.test.ts: mounted overlay enters from the displayed pose during a base crossfade | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimelineMounted.test.ts: mounted release restarts continuously before and after blend midpoint | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimelineMounted.test.ts: overlay exit converges toward evaluated advancing base, not its destination clip | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimelineMounted.test.ts: mounted death captures the full composed pose during simultaneous base and rider blends | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimelineMounted.test.ts: paused mounted playback sampling is deterministic and does not mutate retained poses | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/actionTimelineMounted.test.ts: mounted injury interrupts the composed pose and returns continuously to gait | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| web/tests/playbackPacking.test.ts: real action timeline interruptions and upper exit pack the same composed mounted pose | Asserted the named behavior using playback returned by update. | Identical assertions using sample after update at the same tick. | Single output owner; invocation-only API migration, no re-pinning. **moved** |
| frozen-capture-profile.test.ts: timeline update preserves exact poses versus a pinned controller | Timed update and compared its returned playback for all 30,000 soldiers. | Times update alone, then samples both controllers outside timing; exact composed-pose assertions remain. | Supports the void observer and a selectable pinned baseline; no acceptance threshold. **moved** |
