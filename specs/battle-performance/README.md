# Smooth battle cameras and readable default shadows

## Next Agent Prompt

You are implementing this plan in `/Users/david/dev/game-battle-performance-spec`, branch `codex/battle-performance-spec`, based on `c924e5ce9cac0a8abd5cd93de0d17df892facb3f`.
Status: **implementation in progress; no backend selected**, updated 2026-09-17.
Current pickup: run matched controls from the refreshed enabled/disabled builds,
then continue measured crowd preparation and obtain quiet live evidence before
ranking. No backend is selected. All GPU jobs and servers from this pass are
terminal; the tracked runtime includes the validated candidate.
[Eight fixed builds](assets/02-paired-controls-9374dbc9/README.md) now pin runtime
9374dbc9 under `throwaway/matched-current-9374dbc9/{enabled,disabled}`. Each mode has
its own manifest and the root has the common render configuration. All eight
emitted WASM files match the archived release digest. Builds have not yet supplied
new runtime rankings; disabled controls measure different incremental observers
for Three versus native and must be compared within each backend.

[Native admission batching](assets/02-native-admission-batch/README.md) overlaps
routine validation and eliminates empty reconciliation checks while preserving
resource admission, failed-frame identity and cleanup ownership. In raw-renderer
baseline/candidate/candidate/baseline controls at paused tick 30, identical camera
packets and matching crowd fingerprints produced median renderer wall times of
14.6–15.8 ms versus 10.4–11.2 ms; p95 was 20.5–22.0 versus 14.1–15.2 ms. This is a
short shared-host component comparison, not live FPS or backend selection evidence.
All 21 live tests, both live type configurations, native camera probes and the
unchanged 18-check standing hardware gate pass. Independent review is clean.

[Four enabled live controls](assets/02-current-live/README.md) at runtime 58b2a9bd
completed all functional checks with common WASM and graphics settings. Background
load makes all four unrankable. Those immutable builds under
`throwaway/matched-current-58b2a9bd/enabled/{three,raw,typegpu,vgpu}` predate the
admission change; do not present them as current timing. Use the refreshed paired controls above before attributing a possible backend win. No user
applications were stopped. `renderAwaitMs` includes Promise-continuation work and
cannot be added to `renderCpuMs` as if they were disjoint costs.

The [camera-only publication checkpoint](assets/06b-camera-reprojection/README.md)
is verified across all four renderers. The [standing grass/camera gate](assets/04-grass-camera-gate/README.md)
now passes all 18 checks on hardware with its 33 ms threshold and content floors
intact. Base/focus accepted records are explicit; padding cannot count as content.
The gate verifies distinct 20 m/10 m submitted views, a real 200 m pan, and a complete
near-and-return sweep. Previous grass-accounting failures and unreachable zoom
requests are explained by evidence, not waived. This paused-simulation floor is
not live performance acceptance. 27 focused grass tests and web types pass.

The current runtime includes worker/campaign handoff, immutable image sharing,
exact animation endpoints, progressive grass residency, shared view-fitted
shadows and the shadow depth guard. Their component proofs are linked in
[evidence.md](evidence.md). The [real GPU upload regression](assets/04-grass-upload-bound/README.md)
proves bounded grass edits; the [exact-WASM cutoff comparison](assets/03a-friend-cutoff/README.md)
preserves recorded battle hashes. Neither establishes live acceptance. Remaining
costs include simulation targeting/projection/repulsion, crowd preparation and
native frame orchestration. Native simulation profiling diverges from WASM and
cannot substitute for exact-target evidence.

Claude Opus stopped at its spend limit; root continues locally. Serialize GPU
jobs. Reuse the [bounded source archive](assets/02-preflight/native-spool/README.md)
for correctness, not current timing. GPU interval sums are diagnostics, not
elapsed-time rankings. Continuous camera/grass/shadow stability, sustained live
throughput and the final net-shadow savings remain unproven. Preserve gameplay,
quality, default gates and the hard-cutover/no-compatibility decision. Historical
runs and component checkpoints belong in the evidence ledger rather than here.

The proposed target is steady 60 fps on David's current Mac at normal window size and device scale. This was recommended in the interview, not explicitly confirmed; record any reply and propagate it before freezing the benchmark. Do not interpret absent exact camera/seed metadata as a blocker: reproduce the attached composition with current assets, record the approximation, and also benchmark the actual default generated battle. Exact GPU, physical framebuffer, refresh cadence and total battle population must be acquired in 01. The screenshot shows **7,780 player men**, not a verified total render count.

Follow the slice graph below and the [complete-scene pickup](composition.md). Parallelize backend implementation in separate worktrees; serialize hardware timing on the same host. Do not implement the rest of a renderer migration from an unmeasured guess. Slice 03 selects one backend and must materialize any conditional migration using the [migration contract](migration.md) before dependent work. If live simulation blocks the target, report the boundary and leave the live gate failed; this spec does not authorize sim mechanics changes. Update this section, checklist and evidence links before ending each implementation pass.

- [x] [01 — production motion evidence](slices/01-motion-evidence.md)
- [x] [01a — menu-launched simulated benchmark](slices/01a-benchmark-run.md)
- [x] [01b — action-following camera tour](slices/01b-benchmark-camera.md)
- [x] [01c — FPS results and spike chart](slices/01c-benchmark-results.md)
- [ ] [02 — matched backend comparison](slices/02-backend-comparison.md), including all three alternative backends
- [ ] [03 — choose one backend and resolve the remaining graph](slices/03-backend-decision.md)
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
- All three native complete-scene controls now match source audiences and clean up tracked resources. Fresh library image reviews find settled visual ties; strict pixel differences remain documented. The first TypeGPU timeout overlapped a configuration edit and is an invalidated control. Shared recorded replay and functional Menu runs are complete; corrected fixed-build paired timing remains next.
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
