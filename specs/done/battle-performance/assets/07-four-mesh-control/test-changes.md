# Review-fix test changes

No gameplay or unit-stat changes are included. The earlier four-tier implementation
changes are described by its committed test diff; this ledger covers the subsequent
review corrections and carried-in red tests repaired in this pass.

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `lod-tiers`: reaches every mesh tier | Counted impostors among distinct reached levels, allowing a missing mesh interval to go unnoticed | Counts only mesh intervals and requires exact equality with mesh count | Makes coverage prove the stated contract; moved |
| `soldier-placeholders.test.mjs`: decreasing tiers | Allowed intermediate/mid ties for every placeholder | Allows ties only for bare/hooded foot soldiers; all other reductions strict | Those variants lack the helmet/blanket removed at mid; moved |
| `photorealCrowdLod`: audience sequence | Four-tier golden replaced the previous three-tier pin | Keeps four-tier pin and additionally reproduces old hash `b909f671…` using an unreachable added boundary and index mapping | Preserves an executable exactness control; moved |
| `nativeSceneLifecycle`: failed staged terrain replacement retains the previously prepared scene | Threw before reaching lifecycle assertions because mocked audience lacked `reproject` | Same assertions execute and pass with unchanged-view response | Production added camera reprojection earlier in this feature; carried-in |
| `nativeSceneLifecycle`: a dependent failure after terrain commit cannot present mixed generations | Threw before reaching lifecycle assertions because mocked audience lacked `reproject` | Same assertions execute and pass with unchanged-view response | Production added camera reprojection earlier in this feature; carried-in |
| `nativeSceneLifecycle`: disposal during an awaited UI upload prevents late readout allocation | Threw before reaching lifecycle assertions because mocked audience lacked `reproject` | Same assertions execute and pass with unchanged-view response | Production added camera reprojection earlier in this feature; carried-in |
| `photorealWorld`: propagated render timestamp failure stops query allocation and invalidates stale timing | Mock lacked Three's timestamp pool slots; telemetry threw and produced unhandled rejections | Original timing clearing/draining assertions pass with real backend shape | Production telemetry now consumes those always-present slots; carried-in |
| `photorealWorld`: propagated compute timestamp failure stops query allocation and invalidates stale timing | Mock lacked Three's timestamp pool slots; telemetry threw and produced unhandled rejections | Original timing clearing/draining assertions pass with real backend shape | Production telemetry now consumes those always-present slots; carried-in |
| `photorealWorld`: the production frame boundary drains both query pools while publishing render time only | Mock lacked Three's timestamp pool slots; telemetry threw and produced unhandled rejections | Original timing clearing/draining assertions pass with real backend shape | Production telemetry now consumes those always-present slots; carried-in |
| `photorealWorld`: older successful readback | Attempted overlapping polls, although production allows one outstanding poll | Stalls render and rejects compute in the same poll; late render completion cannot restore timing; frames cannot start another poll | Exercises actual single-poll ownership while retaining stale-result protection; carried-in |

Root reproduced seven failures before applying the mock repairs and seven passes
afterwards. Claude's isolated mutation checks additionally broke poll ownership,
clearing, rejection propagation, compute draining and post-await disposal guards;
the corresponding tests turned red each time. Production source was restored.
