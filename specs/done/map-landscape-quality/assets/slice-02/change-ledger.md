# Slice 02 behavior ledger

| Test / scene | Previous behavior | New behavior | Why |
|---|---|---|---|
| photorealWorld disposal test (new) | Query buffers could be destroyed while readback was pending | Canvas releases immediately; renderer destruction waits for pending reads, including after another pool fails | Real browser disposal AbortError |
| photorealWorld older-success/failure | Older success must not revive failed timing | Same contract, unchanged test sequence | Preserve failure semantics while fixing teardown |
| campaign-composition (new) | No physical campaign composition checkpoint | One world proves draped road, city/army, shared flag, fog, selection, labels and actual clicks at DPR1/2 | Campaign renderer migration seam |
| campaign-composition flat control (new) | No independent occlusion oracle | Rear road/body are visible without the ridge and absent with it | Prove depth rather than submission order |
| renderer-lifecycle | Ten battle dispose/recreate cycles with bounded counters | Same gate, final hardware run passes all ten | Shared world teardown changed |
| battle-3d-standards | Existing battle tier and frame checks | Same default tier/geometry; matched tactical/approach hardware captures identical | Shared standard layer now also supports campaign tier |

All existing battle baselines are unchanged. Hardware eye variation is recorded in the owning slice and metrics, not silently blessed as a new reference.
