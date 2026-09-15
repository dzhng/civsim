# Backend maintenance comparison

Code inspection complements the measured comparison; it cannot select a renderer or establish performance. A Claude Opus read-only audit examined the complete candidates, and the parent checked the concrete findings below against the integrated source. The audit's missing asset links came from its sparse checkout; the primary worktree retains the evidence. This is not a missing feature or a parity failure.

| Candidate | Maintained obligations visible in current code |
| --- | --- |
| Three | TSL scene/material ownership plus private storage retirement and renderer/backend access. `packages/photoreal-renderer/src/posePalette.ts` handles pinned internal allocation behavior; the lab's source timestamp tap separately pins an exact bundled dependency hash. |
| Raw WebGPU | Explicit resources, pipeline layouts and command encoding. Reuses existing renderer-core runtime utilities, including the pose palette, without adding a shader-authoring dependency. This reduces external API exposure but does not prove better GPU work or maintenance overall. |
| TypeGPU | Typed resource/layout ownership plus shared WGSL bodies and TGSL kernels. `candidates/typegpu/frame.ts` uses `root["~unstable"].createCommandEncoder()`, so the frame path depends on an explicitly unstable library surface. The build also requires the TypeGPU transform. |
| vgpu | Reflected resource bindings and library draw/compute orchestration. `src/vgpu/targetLifetime.ts` and `storageLifetime.ts` validate runtime destruction methods absent from the published types. Native-device access remains explicit for uploads, capability checks and resource interoperability; it is not by itself evidence of a hidden rendering fallback. |

Paths under `src/` and `candidates/` above are within `apps/battle-perf-lab`. Shared shader math and camera/terrain/environment policies are separate from each backend's resource and submission ownership. After selection, remove unused candidate module/body export variants and experiment-only composers; do not preserve three implementations as a production compatibility system.

## Migration obligations to carry into slice 03

The shared native benchmark facade explicitly rejects CSM, block-debug rendering and soldier asset reload. A replacement must implement the required production behavior or retire a behavior through an explicit, evidenced policy decision. Its API is currently derived from the source renderer and must become independently owned at cutover. Resource accounting must remain honest: logical allocation counters and Three object counts are different measurements, not interchangeable values for a retained API.

The raw scene has inline lifecycle state while TypeGPU/vgpu use the shared asynchronous lifecycle owner. Review this against their synchronous/asynchronous contracts during migration; different spelling alone does not prove a correctness defect or justify a wrapper. Existing lifecycle tests remain required.

The stale vgpu preflight identity has been corrected: package identity contains version information only, and each control states the limited work it actually checks. Neither an old missing-pass list nor a passing component control is current full-scene eligibility.

## Findings not adopted

- **Reduced vgpu DPR:** not substantiated. The live facade multiplies CSS dimensions by device pixel ratio before passing physical dimensions to a surface configured with `dpr: 1`; multiplying again would over-size the canvas.
- **Missing default MSAA parity:** not substantiated. Production `battleWorld.ts` explicitly creates its world with `antialias: false`, matching the native live scene's single sample. A four-sample mode is not a new requirement of this task.
- **Dependency promotion alone proves readiness:** not adopted. A browser bundle can include build-time dependencies regardless of package section; inspect the actual deployment/build contract and emitted dependency surface when selecting a backend.
- **Private API count or line count chooses raw:** not adopted. These are maintenance costs alongside fidelity, actual cadence, simulation progress, resource behavior and measured shadow cost. No winner follows from this audit.
