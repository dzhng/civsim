# Completed-interval CPU experiment

**Rejected as a complete policy; unresolved CPU prototype only.** A single retained interval
can provide an already-active gait's completed-distance phase and the exact
composed endpoint used by an interruption. Idle entry and directional stride
ownership remain unresolved. No crowd caller, renderer, engine, browser scene or
snapshot baseline changes belong to this experiment.

The isolated worktree is `/Users/david/dev/game-completed-interval-probe`, branch
`codex/completed-interval-probe`. It started at policy `597ba4d1` and includes
protected selection `0498092b` as `1927cd0c`. The prototype remains an uncommitted
three-file diff, also preserved in ignored
`throwaway/completed-interval/prototype.patch`. This evidence checkpoint contains
no production implementation or changed test assertions.

## What the experiment establishes

The initial scratch tracer calls the real ActionTimeline: tick 6 has phase 0.1;
the next one-tick interval contains 0.5 m/s qualified travel and ends in a hit.
The original sampler rejects its midpoint and freezes the old 1 m/s prediction:
the fixture's translated pose component is 1.1166666666666667 instead of the
completed-distance 1.1083333333333334. Both checks turn green in the prototype.
This calibrated CPU pose is not a soldier-art or foot-contact claim.

The prototype retains the preceding interval's history shells and shares immutable
clip/frozen-local payloads. A changed active gait rate is anchored at the interval
start using that gait's stride; its completed endpoint supplies subsequent phase
and interruption freezing, without counting distance twice. Unchanged rates retain
their original arithmetic anchor. No per-bone pose is evaluated merely to retain
an ordinary observation; actual interruptions still own frozen-pose evaluation.

The four new supported tests cover midpoint distance, an exact hit endpoint,
an in-flight masked release interrupted by a hit, immutable retained results,
unchanged-rate exact arithmetic, the bounded past window, same-tick append,
replacement/reset and unique frozen-payload accounting. Restoring old-predicted
interruption capture makes the masked test red. Always reanchoring an unchanged
rate also makes its test red: phase changes from 0.08666666666666667 to
0.08666666666666668. These are discriminating tests, not tolerance relaxation.

The initial baseline passes 43 tests. After incorporating protected selection,
its unmodified baseline passes 46 tests. With the prototype, all four new
supported tests pass, while the full focused suites report 40 passes and 11
failures. Typecheck passes. The failures below remain visible; none was repinned.
An initial typecheck failed only because this fresh worktree lacked generated
WASM declarations; copying the existing ignored artifact resolved it.

## Classified behavior ledger

All rows describe this prototype, not accepted behavior. Existing assertions are
unchanged. The foot tests live in `web/tests/actionTimeline.test.ts`; mounted tests
in `web/tests/actionTimelineMounted.test.ts`.

| Test | Previous behavior | Prototype behavior | Why / disposition |
| --- | --- | --- | --- |
| foot: disabling and interrupting gait keeps exact full-body source and event timing | Source component 1.25 from old 1 m/s prediction | 1.125 from completed 0.5 m/s interval | Corrected endpoint owns hit/death/melee source. Expected policy conflict; **your-regression**, unshipped. |
| foot: render sampling advances clip time without advancing observation or consuming injury | Tick 5 throws after observation 6 | Tick 5 samples the retained interval | Past sampling is now bounded by the preceding observation, not latest-only. Expected API-contract conflict; **your-regression**, unshipped. |
| foot: interruptions preserve the exact blended pose, including repeated early and late interruption | First source component 0.2564814814814815 | 0.25277777777777777 | The first hit changes qualified speed from 1 to 0; completed gait stops before composing the same blend. Expected variable-rate source conflict; **your-regression**, unshipped. |
| foot: snapshot storage stays bounded through repeated interruptions and releases after death blend | One 80-byte pose; zero immediately after death blend retirement | Two distinct 80-byte poses can belong to current plus retained history | Honest union includes one preceding interval; final payload retires on the following observation. Expected memory-contract conflict; **your-regression**, unshipped. |
| foot: identical interrupted poses share one immutable numeric snapshot without synchronizing later actions | Total 80 bytes | Total 160 bytes; current identical sources still share one object | Prior interval still owns its distinct source. Sharing passes, old total does not. Expected memory-contract conflict; **your-regression**, unshipped. |
| mounted: speed correction keeps the old composed interruption source while the unmasked gait follows measured distance | Source component 1.0373333333333334 | 1.0466666666666666 | Completed speed rises 0.8 to 1.2; corrected base and masked interruption now share the completed endpoint. Expected source-contract conflict; **your-regression**, unshipped. |
| mounted: final incapacity holds corrected lower gait without freezing a masked release | Source component 1.0373333333333334 | 1.0466666666666666 | Same completed correction precedes the final disabled hold; release remains time-driven. Expected source-contract conflict; **your-regression**, unshipped. |
| mounted: mounted death captures the full composed pose during simultaneous base and rider blends | Source component 1.8533333333333335 | 1.8377777777777777 | Death observation changes speed 2 to 1; corrected gait contributes to the composed freeze. Expected variable-rate source conflict; **your-regression**, unshipped. |
| foot: direction changes transport normalized phase and disabled endpoints retain their compatible gait | Backward-to-left endpoint phase 0.25 using new left stride 2 m | Phase 0.5 using preceding backward interval stride 1 m | Both cannot own the same completed interval. Newly exposed boundary-policy conflict; **your-regression**, unresolved. |
| foot: protected direction changes and time-driven combat preserve exact interruption sources | Freeze prior predicted protected gait | Freeze corrected completed protected gait | Same variable-rate ownership change applies to protected roles. Expected source-contract conflict; **your-regression**, unshipped. |
| new: UNRESOLVED idle-to-move interval has root travel without a gait | No retrospective sampling | Retained midpoint is rest, not walk | Standing owns the interval's start; retroactive gait entry is not selected. Intentionally red, not accepted coverage. |

The new active-gait test moves the two initial red checks to green; the masked
test moves the old-source mutant to exact composed-pose equality. The new
unchanged-rate/boundary test rejects the phase drift from its reanchor mutant and
checks atomic fallback rather than blending incompatible appearances. The new
payload test expects 80→160→160→80→0 bytes across successive interruptions and
death retirement. These four supported additions are **moved** under the bounded
CPU contract; they do not resolve the eleven full-suite failures.

## Review and next decision

Independent CLI review, session `01a07d87-ffeb-7dc2-9e60-985e51dd7097`, terminal 0,
found no additional aliasing, distance-counting, interruption or finite-retention
defect within the specified experiment. It independently reproduced 39 passes and
9 failures before the protected commit arrived. After the cherry-pick, the author
resolved only the adjacent test-insertion conflict, retaining both sets of tests;
the two additional protected-policy failures above were then measured explicitly.
The independent review did not assess those newly merged directional contracts.

Shape review keeps one sampler/history owner and no parallel controller. The
measured prototype costs **49 added / 16 deleted timeline lines**, including one
added explanatory comment, plus **119 added test lines**. It adds one retained
interval field and a bounded retrospective sample range; no public observation,
save format, dependency or live caller is added. Frozen payload retention can
increase, despite cheap shells; this is not a performance-envelope pass.

Before live wiring, decide idle-entry ownership and which stride owns a direction
change interval. Then explicitly revise affected interruption/memory assertions
from that chosen contract, test batched intervals and all presentation boundaries,
and only afterward evaluate a same-time root/pose consumer. The current CPU result
does not authorize a 30 Hz fallback, correction threshold or new smoothing layer.

Raw baseline, red, mutant, green, typecheck and review outputs are in [proof](proof/).
