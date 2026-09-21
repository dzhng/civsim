# Smooth battle cameras and readable default shadows

## Next Agent Prompt

Final closeout in `/Users/david/dev/game-battle-performance-spec`, branch
`codex/battle-performance-spec`. HEAD8ab2e060; the large TypeGPU cutover is still
uncommitted. Production and battle previews use the promoted TypeGPU scene; old
Three battle world, backend selector and runtime layers are removed. Campaign
and isolated Three authoring remain. No compatibility/migration work requested.

The user's revised closing bar is some measured improvement plus full battle
migration and the requested default shadows/menu benchmark, not an absolute60FPS
claim. CPU replay improvements and95% logical material image savings are integrated.
The 2k mesh experiment is archived as unshipped research; no mesh/LOD policy changed.

Final production five-minute menu run passed every check:24.2869 average FPS,
9.5845 FPS1%low,7287 valid frames,0invalid, tick9000→16426, canonical hash correct,
default single shadows,1440×900 CSS/DPR2. Full compressed report, compiled-file
manifest and summaries are in assets/closeout. Remaining stutters are explicit.
The830-test web suite, TypeScript and production build passed; core static Codex
review found no findings. Ten campaign/battle lifetime cycles were flat and zero
requested buffers/textures after every dispose. Default/selection/wheel/core flows
passed. Freeze barrier fixes publication-vs-presentation ordering; residual3168-byte
pixel difference was HUD SVG recomposition, not GPU. Actual framebuffer export
now proves strictzero at DPR1/2; hardware battle-input passes.

Fresh tactical/forest review passes with documented limitations. Default shadows
are visible at user framing; current source-vs-TypeGPU forest has no one-sided
loss. Historical placeholder baselines caused large expected differences. Root is
refreshing only reviewed camera/minimap/effects snapshots (session41798); logs in
throwaway/typegpu-cutover/core-visual-refresh.log. Renderer preview tests require
Vite dev for /@fs imports and SwiftShader for their snapshot contract.

Model-preview semantic tests all pass after correcting pendingDraw during resize
and stale render.soldiers read. Final workbench log model-workbench-fixed.log;
only old snapshot differences remain. Fresh agent model_visual_acceptance reviews
eight workbench and action-replay pairs. Do not accept those snapshots until its
findings are resolved, then refresh/run retained model scenes with SwiftShader at
dev5186. Preview5174 serves fixed production build; source5175 exists only for
completed forest comparison. No benchmark/GPU job remains except41798 currently.

Draft durable README/choices are throwaway/typegpu-cutover/closed-{readme,choices}.md;
fresh closure_claim_audit found architectural claims supported. Finish acceptance
README/test ledger, snapshot verification and any last fixes, commit cutover, then
move to specs/done/battle-performance and replace build plans with those rationale
records (fix links/preserve imagery). Run final claim audit of completed artifacts.
Do not rerun promote.py/integrate scripts. Cleanup own bake/scene/preview worktrees
only after integrated commit; their dirt is borrowed asset symlinks, no unique
uncommitted source. Preserve unrelated dirty benchmark checkout and others' trees.

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
