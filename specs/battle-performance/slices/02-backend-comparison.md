# Matched renderer comparison spikes

## Contract and question

Does replacing battle orchestration materially improve the representative workload at equal fidelity, including visible shadows? First complete 01a–01c, including the actual menu-launched five-minute benchmark. Complete raw WebGPU, TypeGPU and vgpu candidates alongside a Three control; the experiment is not another skinning-helper-only port.

## API seam and frozen inputs

An isolated proposed `apps/battle-perf-lab` imports existing asset, terrain, environment and camera contracts. Its lab-only `BattleReplayFixture` holds terrain/height, appearance bundles, recorded crowd/playback snapshots and camera samples. A small lab driver calls each native backend's `prepare`, `render` and `dispose`; this is not a production universal renderer API. All candidates consume identical fixture bytes and produce the same semantic pass coverage: posed crowd including mesh/impostor tiers, terrain receiver, routed/drawn grass, directional shadows, representative scenery, depth-tested cues, environment and post output. Shadow fit/resolution and draw workloads are fixed for parity rounds.

Split execution into independently reviewable substeps:

1. **02a fixture/control:** capture replay inputs and Three reference in the lab; prove it matches production camera/content and emitted work. Keep current backend version pinned. Commit the common harness before other agents fork.
2. **02b raw:** one worktree/subagent implements explicit WebGPU orchestration using existing renderer-core contracts where correct. Do not treat campaign's blob shadow pass as equivalent to directional battle shadows.
3. **02c TypeGPU:** separate worktree/subagent implements resource/pipeline/compute/render orchestration, not just generated WGSL consumed by Three. Use current official docs; pin version/lockfile. Reproduce an official render/compute example before porting the fixture and test external resource ownership.
4. **02d vgpu:** separate worktree/subagent implements the same contract using `vercel-labs/vgpu`. Reproduce the historical compute→draw shared-uniform issue on the selected pinned version before adoption. A minimal healthy control distinguishes a library failure from app misuse. No silent raw fallback for an operation advertised as vgpu.
5. **02e matched report:** integrate candidate results only after independent code review. Serialize hardware measurement. Compare parity configurations first; optimized configurations separately declare changes in work and use the same optimization on the Three control where feasible.

For live comparisons, each candidate worktree also builds a **benchmark-only game entry** reusing 01a's actual Menu, benchmarkRun, real simulation/HUD and 01b/01c camera/metrics UI. Its benchmark callback is wired at build time to that candidate's fixture-compatible world; ordinary production entry remains unchanged. This temporary entry is an experiment, not a shipped backend choice. The bounded adapter stays inside the lab and is removed at cutover. Exercise the same menu button and five-minute scenario on each candidate. Keep recorded-observation replay for exact attribution and live runs for end-to-end comparison; label these separately. Missing passes cannot be delegated back to a hidden Three renderer in an allegedly raw candidate. General production scene/environment/lifecycle coverage is completed by migration slices if that candidate wins.

Each candidate has one seam (fixture→frame), one route and one parity verdict. Do not let an unavailable feature become an omitted pass in a winning result: mark incomplete/unrankable and finish the missing parity pass before choosing it. Candidate internals, build tooling and resource packing are delegated; camera/geometry/environment/time/shadow coverage/physical framebuffer are frozen. Check resource limits, attachment compatibility, indirect draw behavior, compute→draw ordering, changing instance counts, resize, asset reload and disposal.

## Human artifact and exit

Four named lab routes, each measured against the canonical benchmark workload; retain the in-game run as the production acceptance oracle. Produce a report showing CPU p95/p99, render/compute/shadow work, presentation gaps, resource growth, peak/retained memory, input response, parity gaps and complexity. Complexity includes new owners, dependency/API instability, private Three access, generated/handwritten shader volume, build cost and missing production responsibilities; LOC alone cannot decide. Record maintained logic separately from tests/docs/generated code. Preserve pinned source commits.

Visual variable: equivalence of complete frames, with separate ground, formation, shadow and horizon masks. Compare reference and candidate per mask; unrelated improvements are deferred. 02 does not choose a production migration until 03 verifies this report. Human concern about readability or maintainability can change eligibility; library preference is not performance evidence.

## Inherited verification and review

Keep existing camera, crowd LOD, animation/pose, grass sampling, depth, default-renderer and lifecycle checks green; run the narrow affected checks plus the standing hardware `battle-perf-30k` gate for renderer changes. Preserve its thresholds. Record pre-existing reds separately; do not re-bless unrelated failures. Simulation semantics and campaign consumers must remain unchanged.

For every visual artifact, inspect the actual candidate; use [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the matched baseline/reference, then run an unprimed [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last visual acceptance check**. Use screenshot-regression/snapCheck for captures. Motion claims need a frame sequence/video as well as stills. Store evidence under this spec. Open review shots via preview-shots, allow about five minutes while doing other work, then record an evidence-based decision if no reply arrives and close the shots. Human feedback is non-blocking; failed acceptance is not.
