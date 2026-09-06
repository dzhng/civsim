# Battle observation and submission cutover

Numerical implementation evidence, 2026-09-06. This is the actual-battle adapter
part of 05c, not completion of the workbench replay, GPU blending, or visual gate.

## Ownership and limits

The [battle adapter](../../../../../web/src/battle/battleActionAdapter.ts) is the
single WASM-to-action observation owner for production and the photoreal battle
lab. Action priority and timing remain in the controller. Integer tick/count
changes refresh observations; repeated paused draws sample retained histories.
Reinforcements retain older position/action history. Rewind clears history;
replacement Game instances get a new owner.

Weapon appearance follows canonical equipped-weapon state before action choice.
Switch cooldown no longer forces the old frame 5 idle override. There is no
authored switching clip or attachment handoff in this pass; slice 14 owns that
continuity. Fighting means engagement, not a hit. The reach overlay now remains
visible for living engaged soldiers rather than blinking on fabricated frame 3
beats; its existing culling/budget is unchanged. Injury requires actual health
or mount-health decline, and alive remains authoritative.

The simulation's existing emission-countdown duration is exposed read-only.
The adapter sends both remaining TTL and elapsed release age, so a late observed
projectile need not replay from its emission instant. No simulation constant
value, combat mechanic, health copy, event counter, or golden expectation moved.

Submission carries the full controller payload unchanged, including frozen
local-pose sources and rider overlays. Only the base destination renders until 06.
Gameplay admission rejects missing/mismatched required rig/VAT clip metadata;
manual-only workbench assets remain legal outside gameplay. Successful catalog
replacement resets visual history to avoid blending different rigs.

The frozen-frame cache now keys observation tick and the last-presented catalog
identity in addition to its existing view/effects key. A failed reload retains
the old identity. The debug reload operation forwards to the existing loader;
it is not a second reload manager.

## Verification

Follow-up: the [deterministic gait harness repair](gait-harness.md) records the
merged sampling failure, its stronger per-tick gate, browser pass and retained
pixel-articulation limitation.

| Gate | Result |
| --- | --- |
| Own WASM rebuild | Pass; includes `Game.loosing_duration()` |
| `npm run typecheck` in web | Pass |
| `npm test` in web | 48 files, 226 tests pass |
| `cargo test -p game-wasm` | Four tests pass |
| `cargo test -p sim --test golden` | Pass; unchanged expectation |
| Changed browser-scene syntax and `git diff --check` | Pass |

Real-WASM tests exercise boundary values, memory growth, append, rewind and
explicit reset. The actual BattleCrowd composition test observes renderer
submission through a test sink: smoothing remains 0.75 then 0.82 after a one-meter
step; append preserves the old interpolated position and starts the new soldier
at its actual position; catalog replacement restarts visual phase. This is not
a GPU or pixel assertion.

Independent review first found three stale frame-based calls in the workbench
scene. They were migrated to explicit playback while retaining the exact prior
parity pose phase. A fresh follow-up returned no actionable correctness findings.
Final observe-once gating was then checked locally with typecheck and the full
web suite. No GPU run or baseline blessing occurred in this lane.

Merged follow-through: rebuild main WASM, then run the production
`battle-renderer-default` frozen cache checks, `battle-anim-gait` cadence/motion,
`battle-model-workbench` strict submission parity, and the affected renderer
lab/standing performance gates. The first three have migrated assertions but
remain unexecuted here. No visual-quality acceptance follows from these CPU tests.

## CHANGE LEDGER

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| animationState: soldier gait cadence | Global march 2Hz/run 2.6Hz constants | Removed; controller owns authored duration, browser cadence reads actual clip duration | No global clock reconversion. **moved** |
| animationState: coherent gait phase | Seed-derived phases within 0.05 | Removed from legacy helper; explicit payload submission preserves authored phase, including terminal 1 | Entry history replaces seeded phase policy. **moved** |
| animationState: fighting cadence | Fabricated frame beats changed at 12-tick boundaries | Removed; actual fighting/injury/release observations feed controller | Engagement cannot fabricate injury. **moved** |
| animationState: hysteresis | Enter above 0.4m/s, exit below 0.15m/s | Same assertions | Retained policy, no repin. **moved** |
| animationState: explicit submission | No direct opaque-payload test | Destination death phase 1, same full payload reference, class/faction/mount/elevation preserved; count mismatch rejects | Pins renderer cutover. **moved** |
| animationState: gameplay admission | Blanket legacy clip list | Manual-only rejects; gameplay does not require unrelated clips | Catalog applicability owns coverage. **moved** |
| animationState: local clip agreement | No gameplay CPU/VAT agreement check | All 20 shipped appearances pass; missing/duration/loop/marker mismatch rejects | Interrupted blending samples local rig clips. **moved** |
| battleActionAdapter: real signals | No adapter consumer test | Actual health/mount/fighting/alive/weapon/TTL/elapsed-age values preserved | Read-only observation boundary. **moved** |
| battleActionAdapter: lifecycle | No adapter lifecycle test | Same-tick caching, append, WASM growth, rewind and explicit reset | Preserve identity/history across allocation changes. **moved** |
| battleActionAdapter: alive authority | No adapter authority test | Zero health alone does not mark dead; fighting/switch cooldown does not reduce observed health | No invented combat events. **moved** |
| battleActionAdapter: production submission | No composed smoothing test | Actual BattleCrowd preserves smoothing across append and resets on catalog/rewind | Pins caller lifecycle, not a mocked controller. **moved** |
| game-wasm: countdown duration | No duration accessor test | Export equals emission constant and leaves countdown unchanged | Release age uses the real simulation owner. **moved** |
| battle-anim-gait browser flow | Period 15±4.5 ticks and forced A/B phase groups | Authored duration±4.5ticks; no forced A/B assertion; stability/phase/motion checks retained | Forced variation removed, no visual threshold widened. **moved** |
| battle-renderer-default browser flow | No frozen tick/reload cache checks | Same request retains submitted payload; advanced tick changes phase; same-tick reload replaces/reset payload | Repairs stale frozen poses. **moved** |
| battle-model-workbench browser scene | Three removed frame API calls | Explicit playback at exact prior phase 0.9991202346041055 | Independent review caught caller regression; parity/pixel thresholds unchanged. **your-regression** |
| skinnedPipeline: class clip lookup | Fixture requested frame 0 | Fixture requests idle directly; assertions unchanged | Mechanical caller migration. **moved** |

`battleViews.test.ts` only changes its shared ClassSpec type import. Lab fixtures
now state clip/phase directly; the animation-state route shows explicit poses
instead of a removed numeric-frame table. No snapshots were changed. All unit
prices/stats and simulation tunables are unchanged; LOOSING_TTL visibility alone
changed, not its value.
