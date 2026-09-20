# Smooth battle cameras and readable default shadows

## Next Agent Prompt

Work in `/Users/david/dev/game-battle-performance-spec`, branch
`codex/battle-performance-spec`. Updated2026-09-20.
**TypeGPU is selected; production still constructs Three and final acceptance is open.**
Read [the backend decision](backend-decision.md), [cutover graph](migration.md)
and [TypeGPU conversion plan](slices/typegpu-conversion.md).

Current pickup: verify the camera-work and grass-transition candidates, then
complete selected-renderer browser contract/cutover checks.
[Presented-frame draw counts](assets/native-draw-observation/presented-frame/README.md)
are integratedb31b730b. Root61 facade tests/web TypeScript and independent review
pass. Actual TypeGPU command tallies match all18 single/High/off × zoom × query-mode
checks; no query slots are allocated in disabled mode. The worker and review are
terminal; its worktree and both branches were removed after preserving scratch and
a verified bundle at `throwaway/presented-draw-completed-cleanup/`.

Camera-state candidate: `game-battle-camera-pose-reuse` holds c4e555c1 plus
recovery25034412; Opus handle7582 is terminal. The actual producer/facade now
reuse unchanged state, and failures invalidate reuse until admission validates.
Root63 facade tests pass, but independent review found post-await pose submission
escapes the outer synchronous admission scopes. Opus is correcting that actual
TypeGPU scene path; prompt/results are `throwaway/pose-admission-{prompt,result}.txt`.
The existing mock facade regression is insufficient to cover it. No GPU or timing
acceptance yet. Ordinary advancing live
poses still rebuild; paused/repeated states benefit, so do not claim live gains.

Grass candidate8ac39665 in `game-battle-grass-zoom-transition` is unadopted.
[Actual Menu boundary controls](assets/grass-zoom-transition/README.md) prove
continuous parameters and rendering changes at two pitches. Temporal image
metrics are mixed and not a clean pop metric. Continuous ground-sequence review
and timing remain owed; the worker is terminal.

TypeGPU shared imagesfd41af3c/ad8c218a are wired in the isolated
`game-battle-typegpu-shared-images` candidate; Opus16260 is terminal. Root129 tests
pass. [Actual device proof](assets/typegpu-shared-images/README.md) confirms60→3
material images and95% lower logical texture payload, disposal tozero, and four
pixel-identical Menu frames. Fresh critique records inherited contrast/aliasing/distant-terrain limitations;
device reload/failure/disposal also pass. Close mounted/catalog coverage and
quiet timing remain; not yet integrated. Borrow immutable asset dirs
when creating worktrees instead of copying them.

Claude recovery run61331 stopped with an expired OAuth session that could not be
refreshed; user was informed. Do not retry credentials automatically. The pending
pose-admission prompt is preserved; other verification can continue independently.

Current evidence:

- [Impostor GPU derivation](assets/typegpu-impostor-state/README.md), integrated
  ce4429d0/62ec8728: actual GPU records and12 physical image cases pass at1x/4x;
  exact bisector differences remain explicit. Fixed actual-game images at three
  tactical zooms are pixel-identical once the200ms minimap HUD update settles.
  Whole moving-camera preparation still scales with population. Performance and
  motion acceptance remain open. Fixed A/B builds are under
  `throwaway/typegpu-impostor-evaluation/{control,candidate}/menu`.
- [TypeGPU block-debug](assets/typegpu-block-debug/README.md), integrated4ec4b3e6:
  root83 candidate/57 facade tests, independent review, and actual-game click/drag
  selection at DPR1/2 pass. Opaque depth-off rectangles retain the original debug
  policy; ordinary mode allocates no extra layer.
- [Draw observation](assets/native-draw-observation/README.md), integratedbbb9fde4:
  root37 tests and independent review pass. Observation counts offered commands,
  not successful frames; the integrated consumer now retains that distinction.
- [Content](assets/typegpu-content-state/README.md),
  [scene reload](assets/typegpu-scene-state/README.md),
  [typed colours/frame depth](assets/typegpu-first-passes/README.md),
  [High shadows](assets/typegpu-high/README.md), and
  [receiver overlap/fade](assets/typegpu-shadow-overlap/README.md) retain their
  bounded GPU correctness proofs. They do not close final moving-shadow quality.
- [Snapshot optimization](assets/07-snapshot-copy/README.md) improves shared CPU
  preparation; its33ms floor is not selected-renderer live60FPS acceptance.
  [Ocean4x](assets/m3b-aligned-water/README.md) remains red.

Priority: selected-renderer capability and visual/motion verification, demonstrated
CPU savings and simulation throughput, then the full five-minute live/default-shadow
acceptance. Preserve content, HUD, DPR, assets, behavior and gates. No compatibility,
migrations or reduced-quality win. Do not repeat unchanged rejected ABBA trials
merely to seek green. Serialize timing against owned builds, CPU agents and GPU work.
No timing job is active.

The finished impostor worktree and8 older renderer branches were removed after
preserving scratch and a verified bundle in
`throwaway/older-branch-cleanup-20260920-194943/`. Earlier cleanup archives remain.
The completed block-debug worktree/branch were also removed after a verified
bundle and scratch archive at `throwaway/typegpu-block-debug-completed-cleanup/`.
The draw worker is cleaned up; the candidate worktrees above remain pending verification. Historical control checkouts `game-battle-claude-builds` and `game-battle-perf-fixture`
were removed at the user's request after confirming no active process/dependent
link or tracked code change. `throwaway/unused-controls-cleanup/` preserves their
heads, verified bundle, scratch, and1111 SHA-verified unique captures. Restore
those exact heads if an old control rerun is needed. Current fixed-build inputs
remain under this main worktree. Keep the dirty benchmark worktree and unrelated
worktrees intact.
Pending raw GPU-impostor1c816fc5 and water-comparisonc702e002 branches remain
unadopted references. [The evidence ledger](evidence.md) retains older results;
[choices](choices.md) records decisions.

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
