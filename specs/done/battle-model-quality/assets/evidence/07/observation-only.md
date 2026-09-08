# Observation-only timeline update

The controller observes atomically through `update(): void`; `sample()` is the sole playback-output owner. Removing the ignored output avoids a second per-soldier playback construction on observation frames without changing the history transition arithmetic, immutable snapshot cache, or commit boundary.

## Lazy prior-pose capture: exactness only

The prior displayed playback is needed only when a lane actually transitions.
Its construction is now deferred to the existing freeze callbacks and memoized
within that observation. A stable reference to the old history is captured before
the next base/overlay history is installed, so simultaneous interruptions still
freeze one exact pre-transition pose. Equipment changes use the existing
same-appearance gate; there is no cross-observation cache or phase quantization.

The existing pinned-source harness includes a small exactness-only case against
`e28080af`: **396 playback and posed-output comparisons match exactly** across
foot/mounted interruptions, fractional samples, repeated observations, overlay
exit, injury, equipment changes, death, count shrink and rewind. Run it with
`TIMELINE_PROFILE_BASE=e28080af` and the `lazy prior capture` test-name filter in
the adjacent harness config. The other41 focused timeline/mounted/packing tests
and typecheck pass; no assertion or expected pose was re-pinned.

The high-detail combined run motivating this seam had interruption delays after
observation ticks:12/13 control and10/11 timed delayed intervals. Preceding frames
averaged about9ms observation and11ms upload. This identifies useful CPU work to
investigate, not the cost of this particular allocation. The lazy change adds a
closure and removes eager blend/sample object construction on unchanged lanes;
it does not skip35-bone pose evaluation that was never happening on that path.
Root integration5a35fba9 passes47 focused tests, typecheck and the396 exact
comparisons. The matched [before](combined-high-detail.json) and
[after](combined-lazy-prior.json) hardware runs both fail the two interruption
cadence gates; no reliable frame-time win is established. Observation-tick median
improved from5.35→4.74ms(control) and5.31→4.31ms(timed), but observation p95 rose
from10.66→11.20ms and10.53→11.23ms. Preparation/upload p95 also rose. These runs
sample different numbers of simulation ticks, so they do not isolate this small
allocation's cost. The next diagnostic is a bounded CPU sampling profile of the
existing interruption window, including GC, to attribute `drawInstances` work.
That phase includes world preparation, LOD/grouping and packing—not just GPU
uploads. All33ms gates remain unchanged. The measurements below concern the
earlier observation-only API change, not lazy capture.

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
