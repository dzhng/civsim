# Smooth battle cameras and readable default shadows

## Next Agent Prompt

Work in `/Users/david/dev/game-battle-performance-spec`, branch
`codex/battle-performance-spec`, based on c924e5ce. Updated2026-09-20.
**TypeGPU is selected following user feedback on type safety; implementation and final acceptance remain active.**
Read [the decision](backend-decision.md) and [the concrete cutover graph](migration.md).

Current pickup: map the latest promoted renderer capabilities into one TypeGPU
implementation before the next production edit. Read [the revised decision](backend-decision.md).
The existing raw work is reusable evidence and algorithms; the older TypeGPU
candidate lacks subsequent fixes and must not replace it wholesale. Claude's
read-only conversion scoping is in `throwaway/typegpu-reselection/`.
An independent first typed-shader pass is active in
`/Users/david/dev/game-battle-typegpu-colors` (base f1912eb1): convert the actual
TypeGPU soldier/impostor colour helpers from WGSL strings into typed function
bodies, preserving canonical palette and formulas. Claude owns GPU correctness
for this pass; no timing overlaps. Root prompt: `throwaway/typegpu-colors/prompt.txt`.
Compile-time rejection checks and old-WGSL versus typed GPU numerical comparison
are required before adoption. This does not claim the whole renderer is typed.

GPU impostor candidate1c816fc5 is committed in
`/Users/david/dev/game-battle-gpu-impostor` but unadopted; its WGSL has not yet
passed hardware checks. Transfer the state/view optimization only after verifying
it in the selected architecture. Water worker atc702e002 returned diagnostics, no
fix. Its claims of proven equality/no port defect overreach finite diagnostic
measurements; ocean4x remains red. Earlier cutover consultation also cites an
obsolete74-sample failure: latest changed source/raw gates both passed19 checks.
Preserve historical reds without presenting them as current observations.

All three earlier Claude handles are terminal/missing with final reports saved.
No timing job is active. Keep owned CPU/GPU work out of future timing windows.

[Validation-wait diagnostics](assets/07-validation-waits/README.md) show sub-ms
typical waits, so preserve error handling and prioritize CPU preparation. The [impostor packing candidate](assets/07-impostor-packing/README.md)
failed its declared ABBA ordering screen and is not adopted. Both images and state
match; large timing variation prevents a reliable gain claim. Do not rerun
unchanged code merely to seek a pass. Re-scope the next CPU step from the retained
post-snapshot profile rather than treating this candidate as shipped.
[Snapshot evidence](assets/07-snapshot-copy/README.md): CPU medians down24% wide/16%
moving and improved rendered cadence; wide still misses60FPS. Both changed
source/raw builds pass all19 unchanged30k checks (raw mid75 samples, little
headroom). The completed seating/snapshot worktrees were removed.
[M9c seating inspection](assets/m9c-seating/README.md) passes real-game checks;
its browser consumers and drawn-feet proof remain open. The30k worker was cleaned
up. [Diagnostics](assets/m9b-diagnostics/README.md)
and [M9a timing](assets/m9a-frame-timing/README.md) are verified. [Component evidence](assets/migration-component-review/README.md)
confirms post/sky/PMREM/lake numerical checks; ocean remains strictly red.
[The readiness audit disposition](assets/m9-readiness/README.md) distinguishes real
cutover blockers from inherited quality work. Do not copy Three-shaped counters
or relabel pass sums as a complete frame. Production still constructs Three until
M9; raw is exercised through the real Menu lab seam.

[Current-camera sizing](assets/m7-current-camera/README.md) is integrated atb1818420:
all six DPR1/2 zoom probes eliminate the first-frame banner correction. The
[golden light balance](assets/08-light-balance/README.md) and
[narrower default filter](assets/08-shadow-filter/README.md) improve grounding;
High/off are preserved. The latest source30k and per-preset shadow run passes34
checks without changing33ms/content thresholds. Full selected-renderer/live60fps, receiver and
moving-shadow/net-cost acceptance remain open. No timing job is running.

Both narrow candidates remain outside production:
[grass reception](assets/08-grass-receiver/README.md) had no discernible grounding
gain; [outside-volume sampling](assets/08-shadow-sampling/README.md) preserved
images but failed its predeclared ABBA screen at both camera poses. No repeat of
these experiments is planned. No timing job remains active.

Completed component evidence, not final acceptance:

- [M4 public atlases and reload](assets/m4-publication/README.md): staged GPU
  admission, failure retention and disposal verified. Broader pose/LOD/mounted/dead
  gates remain; accepted reload restarts the existing frontend animation timeline.
- [High shadows](assets/m6-high-implementation/hardware/README.md): single/High/off
  hardware lifecycle works. Inherited strict frame/terrain failures reproduce
  pre/post; readable grounding and moving-camera cascade stability remain open.
- [M7 block debugging](assets/m7-block-debug/README.md): shared geometry, optional
  allocation and actual selection checks pass. Other effects/cues remain open.
- [Source30k floor](assets/m1b-promotion/source-floor/README.md): all18 checks pass,
  preserving33ms and content assertions. This is historical source evidence; current raw/source30k checks now both pass
  after timing and diagnostics consumer migration.
- [Native CPU pair](assets/03a-native-target-preparation/timing/README.md): serial
  regresses and four-thread improves on an early-contact fixture. Not adopted;
  it is not the canonical intense browser workload. Production WASM stays b42782f4….
- [Held backend comparison](backend-decision.md): raw and TypeGPU conditionally
  tied; TypeGPU now selected for type safety. All32 tours are functional but fail quiet-host criteria;
  no broad repeat is planned and these are not live performance acceptance.

Keep shared camera/terrain/environment/pose owners and campaign's separate frame.
Finish M2–M8 gates before the M9 hard production cutover, then judge the live
net-shadow savings. Later simulation still misses30Hz; worker publication alone
is not a throughput fix. No batching/thread-pool/mechanics candidate is adopted.
The proposed60fps target was not explicitly confirmed; do not lower it or the
standing30k/33ms floor. Preserve gameplay, assets, framebuffer scale, content,
audio and default quality. No legacy compatibility or save migration.

Finished M4, High, native CPU and block-debug worktrees were removed with branch
refs/evidence retained. Clean up only this task's finished worktrees; preserve
historical controls and unrelated projects. [The evidence ledger](evidence.md)
and [choices](choices.md) retain earlier component decisions and unresolved gates.

- [x] [01 — production motion evidence](slices/01-motion-evidence.md)
- [x] [01a — menu-launched simulated benchmark](slices/01a-benchmark-run.md)
- [x] [01b — action-following camera tour](slices/01b-benchmark-camera.md)
- [x] [01c — FPS results and spike chart](slices/01c-benchmark-results.md)
- [x] [02 — matched backend comparison](slices/02-backend-comparison.md), including all three alternative backends
- [x] [03 — choose one backend and resolve the remaining graph](slices/03-backend-decision.md)
- [ ] [03a — simulation publication and camera scheduling](slices/03a-simulation-publication.md)
- [ ] [03b — shared immutable surface images](slices/03b-shared-surface-images.md)
- [ ] [04 — bounded grass residency](slices/04-grass-residency.md)
- [ ] [05 — grass GPU work and temporal coverage](slices/05-grass-routing.md)
- [ ] [06a — animation-transition preparation](slices/06a-animation-transitions.md)
- [ ] [06b — camera-independent crowd state](slices/06b-crowd-state.md)
- [ ] [07 — visibility and LOD work](slices/07-crowd-visibility.md)
- [ ] [08 — readable tactical shadow coverage](slices/08-shadow-coverage.md)
- [ ] [09 — stable moving shadows](slices/09-shadow-stability.md)
- [ ] [10 — production acceptance and cleanup](slices/10-production-acceptance.md)

## Current evidence

[The evidence ledger](evidence.md) links the measured failures, component controls and complete-scene checks. Current decision boundaries:

- The actual Menu benchmark completes its five-minute action-following tour and exports a timing chart. Quiet baseline evidence shows severe live CPU and camera stalls; no final speedup is claimed.
- Production grass-buffer binding and readout-atlas corrections restore missing work. Final timing must refresh the source baseline after those fixes.
- Native full-scene controls render all20 appearances and actual L3 soldiers. The recorded replay matches all433 input/publication histories and six sampled GPU command/record gates. Independent still-image review finds no obvious one-sided scene loss; strict pixel diagnostics remain red.
- All three native complete-scene controls now match source audiences and clean up tracked resources. Fresh library image reviews find settled visual ties; strict pixel differences remain documented. The first TypeGPU timeout overlapped a configuration edit and is an invalidated control. Shared recorded replay and functional Menu runs are complete; live timing is recorded but remains unrankable across differing simulation states.
- Simulation publication has bounded transport and actual action-adapter consumer proofs only. Sustained browser throughput and the final net-shadow performance equation remain open.
- No existing default threshold or baseline failure has been repinned. [Choices](choices.md) records decisions beyond the plan.

## Outcome

Camera pan, zoom, reversals and horizon-facing views remain responsive with large visible armies. At the [user's tactical framing](assets/user-tactical-reference.png), soldiers have readable, terrain-grounded directional shadows **by default**. The combined result must be faster than today's default: optimizations must pay for the incremental shadow cost and leave measurable savings.

Engine replacement is explicitly permitted. Three.js is a candidate, not a constraint; raw WebGPU, TypeGPU (interpreting “typewebgpu”) and Vercel's `vercel-labs/vgpu` get real comparison spikes. Effort or existing sunk cost alone cannot reject a better architecture. Conversely, a different shader-authoring library alone is not evidence of less GPU work. No automatic winner is prescribed.

The user additionally requested an in-game menu benchmark: a real battle, using its intense five-minute contact window, with human-like camera pans/zooms and a chart of performance spikes. This is now a required deliverable in 01a–01c and the shared benchmark for all backend candidates. It is not replaced by a developer-only replay page.

## Scope and invariants

- Battle rendering, camera-to-render scheduling, grass, crowd preparation/visibility and shadows. Shared render utilities may change only with their other consumers verified. Campaign migration, gameplay/balance changes, map redesign, new art and unrelated HUD restyling are out of scope. The benchmark menu/progress/results UI is explicitly in scope.
- Preserve the current physical framebuffer, normal graphics quality, army/scenery content, camera range, input responsiveness, recognizable units and animation. No reduced DPR, narrower horizon, disappearing armies, hidden HUD, paused simulation or disabled grass/shadows in the final acceptance workload.
- Render optimization may alter representation if image/temporal evidence proves equivalent readability and coverage. Record triangle counts, coverage and LOD histograms; fewer triangles are allowed, missing content is not.
- One canonical camera/projection/depth contract (`renderer-core`), one terrain height source, one environment/light owner, one battle frame coordinator, one grass residency owner, one crowd state owner, one immutable material-image owner per world/catalog preparation, and one audience policy owner. Keep view and shadow audiences distinct consumers of that policy.
- Keep production WebGPU-only behavior, readiness/error handling, resize, asset replacement and disposal. No permanent backend switch, legacy renderer option or compatibility adapter. Existing experiment worktrees are read-only research inputs, not active instructions to push or merge their PRs.

## Slice graph and review map

```text
01 → 01a → 01b → 01c → 02a fixture/control
                       ├→ 02b raw / 02c TypeGPU / 02d vgpu
                       └→ 02e matched report → 03 backend decision
                            ├→ 03a simulation publication ──────────┐
                            ├→ 04 grass residency → 05 routing ┐   │
                            └→ 06a animation → 06b state → 07 ─┴→ 08 shadows
                                                               → 09 stability
                                                               → 10 acceptance
03b verified incumbent image ownership → 03 selected ownership → 10
03 materializes any replacement migration graph before dependent GPU work.
10 joins simulation publication, shared-image residency, presentation, GPU work and migration.
```

03a joins final live acceptance; it cannot claim that moving slow ticks to a worker restores simulation throughput. 06a owns measured transition preparation above every backend; shared-layer changes require refreshed controls. 08 follows both 05 and 07. 09 follows 08. Grass and crowd tracks may run in parallel after 03 fixes shared ownership. Early shadow probes belong in 02 so backend selection includes their cost. A slice whose hypothesis is disproved closes with evidence and no production edit; update downstream dependencies rather than adding machinery for completeness.

| Checkpoint | Human review surface | Question answered |
| --- | --- | --- |
| 01 | Production replay with exported timing strip and saved camera trace | What stalls, and under which input? |
| 01a–01c | Menu → five-minute live battle with human-like camera → FPS/lows/highs and spike chart | Can anyone run and inspect the same benchmark inside the game? |
| 02–03 | Same workload in four backend routes; parity checklist and scorecard | Does changing orchestration actually buy performance? |
| 04 | Continuous pan across grass cells with pending/active generations visible in diagnostics | Does new coverage arrive without a blocking commit or starvation? |
| 05 | Ground-only crops and matched pan sequence | Is grass work bounded without coverage bands or shimmer? |
| 06–07 | Crowd camera replay, audience counts and transition crops | Does camera demand avoid needless state work without losing soldiers/casters? |
| 08 | Tactical shadow on/off pairs at the supplied framing | Can you clearly see directional grounding? |
| 09 | Shadow edge/contact sequence under moving camera | Do shadows stay attached and stable? |
| 10 | Normal playable battle plus baseline/final motion reports | Is the game smoother with the new default shadows? |

## Acceptance contract

[Measurement protocol](measurement.md) owns timing definitions, workload identity, repeated runs and the net-shadow equation. Keep the standing `battle-perf-30k` 33 ms gate unchanged as an additional floor; it is not the new live 60 fps verdict. Exact screenshot metadata is unknown, so do not claim to replay the original save.

Every visual slice uses the shared `snapCheck` path following [screenshot-regression](../../.agents/skills/screenshot-regression/SKILL.md), stores feature evidence here, and inspects actual candidates. Run [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md) against the matched baseline/reference for telemetry and a less-wrong verdict. **Run an unprimed [screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md) last before accepting any visual shot.** Moving-camera claims additionally require sequences/video and timing; still images cannot prove absence of stutter or popping. Apply [aesthetics](../../.agents/skills/aesthetics/SKILL.md): warm, readable grounding without turning the battlefield dark.

Review checkpoints are non-blocking: open shots with [preview-shots](../../.agents/skills/preview-shots/SKILL.md), allow about five minutes while doing independent work, then decide from the evidence if no reply arrives, record the rationale and close the opened shots. Silence cannot waive a failing performance or visual requirement.

## Decisions and fog audit

Three independent drafts used fewest-slices, risk-first and seam-quality lenses; a separate Claude consultation adds a vendor-independent pass. [Synthesis](decisions.md) records the adopted boundaries and alternatives. This plan deliberately splits sampling/commit, grass rendering, crowd state, visibility, shadow coverage and shadow stability: each can fail independently. Numerical resource capacities, hardware upload budgets and backend-specific implementation choices are delegated to measured experiments in their owning slices. Target frame rate, content floors, shadow readability and no-compatibility policy are not delegated.

The final shape should read as designed today. Candidate backends and comparison interfaces live only in the lab. If a replacement wins, reusable assets/camera/environment contracts survive while the old battle implementation is deleted at cutover. Campaign consumers may retain shared Three dependencies; “battle moved off Three” does not authorize deleting dependencies they still use. No temporary seam survives slice 10 without an explicit unmet migration item, in which case the feature is not complete.
