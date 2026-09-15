# Smooth battle cameras and readable default shadows

## Next Agent Prompt

You are implementing this plan in `/Users/david/dev/game-battle-performance-spec`, branch `codex/battle-performance-spec`, based on `c924e5ce9cac0a8abd5cd93de0d17df892facb3f`.
Status: **implementation in progress — full backend comparison**, updated 2026-09-15. The actual menu now launches preparation, a live five-minute camera tour, results/chart and JSON export. The production grass binding fix restores missing published coverage without shader rebuilds; other rendering algorithms and default quality remain unchanged. Telemetry and pure parameter ownership have also been updated.
Current pickup: finish full-scene composition and actual motion replay before selecting a backend. Priority: localize the remaining zoom replay differences; finish TypeGPU/vgpu grass and scenery; complete scenery, vista/water and in-scene UI across backends; then run complete matched live benchmarks. All three mesh/impostor/pose/material-mip and reduced HDR-frame runtimes are implemented. Current directional shadow primitives pass in all three; all shadow receivers are implemented, and native scenery has limited independent visual review at one and four samples. Full-catalog atlases are prepared and loader-verified. Strict edge/cold-frame diagnostics remain explicit, and no backend is eligible for selection yet. A bounded simulation-publication feasibility probe may proceed independently under03a; production integration still follows the selected graph. Preserve gameplay and the hard-cutover/no-compatibility decision.

The corrected-source tour records 433 presentations within the 128 MiB memory and 1 GiB disk caps. Every camera/crowd/active-grass hash gate and all six endpoint indirect-command checks pass. Pan includes a real pending-to-completed grass publication; pan and horizon endpoints are pixel-identical. Zoom endpoints differ at three and one pixels, so exact replay parity remains open. Preserve that archive for offline repeat/localization rather than recapturing its costly source prefix. Capture changes cadence and cannot supply performance numbers. Complete-scene content, lifecycle and live benchmark parity remain required.

The proposed target is steady 60 fps on David's current Mac at normal window size and device scale. This was recommended in the interview, not explicitly confirmed; record any reply and propagate it before freezing the benchmark. Do not interpret absent exact camera/seed metadata as a blocker: reproduce the attached composition with current assets, record the approximation, and also benchmark the actual default generated battle. Exact GPU, physical framebuffer, refresh cadence and total battle population must be acquired in 01. The screenshot shows **7,780 player men**, not a verified total render count.

Follow the slice graph below and the [complete-scene pickup](composition.md). Parallelize backend implementation in separate worktrees; serialize hardware timing on the same host. Do not implement the rest of a renderer migration from an unmeasured guess. Slice 03 selects one backend and must materialize any conditional migration using the [migration contract](migration.md) before dependent work. If live simulation blocks the target, report the boundary and leave the live gate failed; this spec does not authorize sim mechanics changes. Update this section, checklist and evidence links before ending each implementation pass.

- [x] [01 — production motion evidence](slices/01-motion-evidence.md)
- [x] [01a — menu-launched simulated benchmark](slices/01a-benchmark-run.md)
- [x] [01b — action-following camera tour](slices/01b-benchmark-camera.md)
- [x] [01c — FPS results and spike chart](slices/01c-benchmark-results.md)
- [ ] [02 — matched backend comparison](slices/02-backend-comparison.md), including all three alternative backends
- [ ] [03 — choose one backend and resolve the remaining graph](slices/03-backend-decision.md)
- [ ] [03a — simulation publication and camera scheduling](slices/03a-simulation-publication.md)
- [ ] [04 — bounded grass residency](slices/04-grass-residency.md)
- [ ] [05 — grass GPU work and temporal coverage](slices/05-grass-routing.md)
- [ ] [06a — animation-transition preparation](slices/06a-animation-transitions.md)
- [ ] [06b — camera-independent crowd state](slices/06b-crowd-state.md)
- [ ] [07 — visibility and LOD work](slices/07-crowd-visibility.md)
- [ ] [08 — readable tactical shadow coverage](slices/08-shadow-coverage.md)
- [ ] [09 — stable moving shadows](slices/09-shadow-stability.md)
- [ ] [10 — production acceptance and cleanup](slices/10-production-acceptance.md)

## Current evidence

- Baseline source: `c924e5ce`; plan checkpoint `76b45cca`; telemetry `5518110f`; pure metrics `8978a174`.
- 43 focused tests, TypeScript checking and the production build pass. Actual-menu cancellation/input/export flow passes after fixing preparation to retain its ready frame instead of redrawing skipped history. Independent review found a missing deployment rewrite for `/benchmark`; it is corrected.
- Named host: Apple M5 Pro, 20 GPU cores, 48GB. Chrome fixture confirms `apple / metal-3`, 1440×900 CSS at DPR2 → 2880×1800 framebuffer and 15,560 total soldiers.
- [Paused camera evidence](assets/01-baseline/README.md): roughly 25–31 FPS, with a 233 ms worst pan interval. These are measured failures, not accepted performance.
- [Live diagnostic](assets/01-benchmark/README.md): actual menu completed 300.1 wall seconds, correct tick 9000 start hash, no browser errors. It advanced 156.3 simulation seconds and averaged 3.9 FPS. Mean CPU work was 204 ms simulation plus 49 ms rendering per frame. Shared-host diagnostic, not final quiet repeated timing.
- Exact same-seed scout stays contested from tick 9000 through 18000. Fresh visual review accepts the revised results UI and horizon/return action framing as useful evidence. The full-menu gate validates every phase, near/wide/horizon ranges and a new primary submission for every recorded callback; backend eligibility remains undecided.
- [Controlled full-menu report](assets/01-benchmark/complete/report.json): 300.138 wall seconds, 118.6 simulated seconds, 2.962 average FPS; 886 complete GPU records, four explicitly pending, no lost events. Other agent builds/GPU work were held. One run, not repeated acceptance evidence.
- Correlated GPU smoke: 59 complete / 5 pending submissions, no dropped records or browser errors. Diagnostic averages: main 21.68 ms, post 21.58 ms, shadow 2.75 ms, grass compute 0.72 ms, pose compute 0.66 ms. This is pass work, not presentation latency.
- [Corrected-source tour](assets/02a-corrected-tour-checkpoint/README.md): 433 actual presentations, 70 selected frames, all history hashes and six actual GPU-command gates pass. Pan/horizon endpoints match exactly; zoom has three/one changed pixels. Memory peaked at126,963,224 bytes and charged disk at858,869,957 bytes. Pending grass completes at43.698s without replay settlement or dropped history.
- [Reduced native frame](assets/02-raw/frame/README.md): sky, terrain, twelve authored soldiers and real post share one frame. Fresh review finds equivalent static composition; first native one-sample beauty differs on its next identical presentation despite identical pose buffers. This remains a temporal diagnostic, not a proven driver explanation.
- [Composed native shadows](assets/02-raw/composed-shadow/README.md) change visible ground/foot coverage while shadow-off remains byte-identical. Warm pairs correspond, but the first Three shadow frame points in a different direction than its repeat; the existing native cold shading difference also remains. Strict cold/complete-frame parity is open.
- [Grass publication correction](assets/02-raw/grass-residency/README.md): issued draws had retained old storage buffers after growth. A dedicated public storage group refreshes their identity without rebuilding pipelines. Source field and standalone output now match exactly; fresh review confirms restored coverage. Fifteen focused grass tests pass. The native dense-field gate still has 13 coverage differences and remains open. Old performance and source replay captures require refresh because the fix restores real rendering work.
- Shared terrain preparation now lives in `game-renderer`: the existing source and native composition consume one CPU recipe. Exact comparison against the previous recipe passes for all three catalog maps (ground, horizon, height field and scenery); vista math moved unchanged with direct consumers.
- Component controls: all three sky runtimes pass; [full post](../../apps/battle-perf-lab/candidates/raw-post/README.md) agrees exactly across 72 cases; [PMREM](../../apps/battle-perf-lab/src/raw/pmrem-check.md) agrees within bounded half-float precision in all three runtimes. Shared haze agrees exactly in 52 cases and opaque PBR agrees within half-float precision in 288 cases. [Native grass](assets/02-raw/grass/README.md) proves exact routing/membership and bounded image parity; its invariant depth prepass avoids the source's documented holes. These preserve component fidelity and resource ownership; none establishes complete scene parity or a speedup.
- [Native impostors](assets/02-raw/impostor/README.md): all 24 one/four-sample cases pass with exact attributes/alpha and maximum HDR color difference 0.000244; fresh review found no visible pair differences and records the source's broken thin-weapon/floor-detail limits. [Terrain evidence](../../apps/battle-perf-lab/candidates/terrain/README.md) localizes nearly coplanar caps and interpolation-sensitive pebble/SDF boundaries; strict numerical reports remain explicit. These are component results, not a complete renderer or performance verdict.
- [Full-catalog atlas preparation](assets/02-full-atlas/README.md): all20 assets are authored and pure-loader verified, about8MB compressed/180MiB decoded mip payload. Three-class GPU consumer controls remain separate; full-world GPU residency is not yet measured. All three pose and material-mip owners pass their controls.
- All 72 raw/TypeGPU/vgpu impostor cases pass with exact alpha/packing and maximum HDR difference 0.000244; owned-texture tracking reaches zero after disposal while borrowed devices remain alive. vgpu target attachments require explicit destruction through a checked public runtime method omitted from its published type. Terrain ports retain exact coverage but known strict horizon/MSAA failures. Mesh-crowd diagnostic coverage matches; some derivatives differ even at matching unique triangle IDs, so its beauty gate remains open.
- [CPU build pairs](assets/03a-build-feasibility/summary.json) reproduce a lower window cost with an existing no-opt profiling artifact, but do not isolate compiler causality or prove steady simulation throughput. Production build settings are unchanged.
- [CPU profiles](assets/01-benchmark/cpu-profile/summary.json) show substantial ActionTimeline transition work before renderer submission. A separate named-WASM profile identifies combat and separation as dominant simulation phases; its modified profiling artifact cannot establish a production speedup.
- Normal-entry regression sweep passes benchmark flow and most input/render checks, but has three failures reproduced on the untouched baseline: frozen pixel identity, expected impostor tier, and the smoke test's screen-to-ground assumption. No threshold has been changed.
- [Choices ledger](choices.md) records decisions beyond the plan. Scratch remains in ignored `throwaway/`; accepted baseline evidence lives in `assets/01-baseline/`.

## Outcome

Camera pan, zoom, reversals and horizon-facing views remain responsive with large visible armies. At the [user's tactical framing](assets/user-tactical-reference.png), soldiers have readable, terrain-grounded directional shadows **by default**. The combined result must be faster than today's default: optimizations must pay for the incremental shadow cost and leave measurable savings.

Engine replacement is explicitly permitted. Three.js is a candidate, not a constraint; raw WebGPU, TypeGPU (interpreting “typewebgpu”) and Vercel's `vercel-labs/vgpu` get real comparison spikes. Effort or existing sunk cost alone cannot reject a better architecture. Conversely, a different shader-authoring library alone is not evidence of less GPU work. No automatic winner is prescribed.

The user additionally requested an in-game menu benchmark: a real battle, using its intense five-minute contact window, with human-like camera pans/zooms and a chart of performance spikes. This is now a required deliverable in 01a–01c and the shared benchmark for all backend candidates. It is not replaced by a developer-only replay page.

## Scope and invariants

- Battle rendering, camera-to-render scheduling, grass, crowd preparation/visibility and shadows. Shared render utilities may change only with their other consumers verified. Campaign migration, gameplay/balance changes, map redesign, new art and unrelated HUD restyling are out of scope. The benchmark menu/progress/results UI is explicitly in scope.
- Preserve the current physical framebuffer, normal graphics quality, army/scenery content, camera range, input responsiveness, recognizable units and animation. No reduced DPR, narrower horizon, disappearing armies, hidden HUD, paused simulation or disabled grass/shadows in the final acceptance workload.
- Render optimization may alter representation if image/temporal evidence proves equivalent readability and coverage. Record triangle counts, coverage and LOD histograms; fewer triangles are allowed, missing content is not.
- One canonical camera/projection/depth contract (`renderer-core`), one terrain height source, one environment/light owner, one battle frame coordinator, one grass residency owner, one crowd state owner and one audience policy owner. Keep view and shadow audiences distinct consumers of that policy.
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
03 materializes any replacement migration graph before dependent GPU work.
10 joins simulation publication, presentation, GPU work and migration.
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
