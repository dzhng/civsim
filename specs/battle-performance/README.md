# Smooth battle cameras and readable default shadows

## Next Agent Prompt

Work in `/Users/david/dev/game-battle-performance-spec`, branch
`codex/battle-performance-spec`. Updated2026-09-20.
**TypeGPU is selected; production still constructs Three and final acceptance is open.**
Read [the backend decision](backend-decision.md), [cutover graph](migration.md)
and [TypeGPU conversion plan](slices/typegpu-conversion.md).

Current pickup: integrate TypeGPU scene reload and admitted-state diagnostics.
Claude Opus is implementing this CPU pass in
`/Users/david/dev/game-battle-typegpu-scene-state`, basef440191a, scoped to the
TypeGPU scene/terrain and real live facade plus consumer tests. Prompt and runner
outputs live in that worktree's `throwaway/` (handle19901).
An independent Opus CPU pass in `/Users/david/dev/game-battle-typegpu-impostor-state`
(basea90d3f82, handle80073) owns typed compact impostor state and audience camera
refresh, with no scene/facade edits. It must preserve exact tile choices and existing
visual gates; root supplies GPU and timing evidence after review. Both prompts and
outputs live in their worktrees' `throwaway/`. Check handles or actual final reports
before restarting. No timing job is active.

Current evidence:

- [Scene baseline](assets/typegpu-scene-state/README.md): actual TypeGPU Menu
  rejects model reload and exposes no seating/pose/depth diagnostics before the
  active integration;15,560 soldiers render and teardown releases tracked bytes.

- [Typed colours and frame depth](assets/typegpu-first-passes/README.md): typed
  colour bodies, nonfinite-safe numerical comparison, real frame allocation and
  resize/disposal checks pass. Other string shader bodies remain untyped.
- [TypeGPU High shadows](assets/typegpu-high/README.md): Menu single/High/off
  hardware lifecycle and unchanged single-map source comparison pass. Split/overlap,
  matched-state readability and moving-shadow performance remain open.
- [Shared crowd diagnostics](assets/typegpu-crowd-state/README.md): combined
  candidate47/47, raw audience21/21 and relevant typechecks pass; independent review
  has no actionable findings. Scene/facade wiring is the active pass.
- [Snapshot optimization](assets/07-snapshot-copy/README.md) improves raw/shared
  CPU preparation. Latest changed source/raw30k checks both pass19 unchanged gates;
  that33ms floor is not selected-renderer live60FPS acceptance.
- [Component evidence](assets/migration-component-review/README.md) and
  [water diagnostics](assets/m3b-aligned-water/README.md): ocean4x stays red. Do not
  turn diagnostic matrix agreement into a proof that the port is correct.

Priority after the active pass: selected-renderer capability and visual/motion
verification, then demonstrated CPU savings and simulation throughput, then the
full five-minute live/default-shadow acceptance. Preserve original content, HUD,
DPR, assets, behavior and gates. No compatibility, migrations or reduced-quality win.
Do not repeat rejected unchanged ABBA trials merely to seek green; serialize actual
timing against owned builds, CPU agents and GPU work.

Pending candidates remain unadopted: `codex/battle-gpu-impostor` at1c816fc5 (no GPU
compile yet) and `codex/battle-water-comparison` atc702e002 (diagnostics, no fix).
Their worktrees are removed and scratch archived.82 older unoccupied battle branch
refs were deleted after a verified bundle and name/hash manifest at
`throwaway/branch-cleanup-20260920-182212/`; active, pending and unrelated refs
were preserved. Finished TypeGPU High/crowd worktrees and branches were also removed after preserving
scratch and a verified bundle at `throwaway/typegpu-completed-cleanup-2/`.
Preserve historical control worktrees.

[The evidence ledger](evidence.md) retains older measurements and component gates;
[choices](choices.md) records decisions. Keep historical reds distinct from current
results, and keep this handoff short enough to select one next action.

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
