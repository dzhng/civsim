# Composed HDR control

This control joins the existing sky, terrain, twelve posed soldiers and five-level post chain. It exercises camera publication, reversed depth, sample resolution and bloom through each candidate's own resource and command APIs. The Three source fixture and raw baseline come from primary `87c09b9b`; this pass changes no authored shader algorithm or simulation behavior.

All six serialized runs completed with zero validation errors, console warnings, nonfinite outputs and live candidate textures after disposal. The strict exploratory `1/255` maximum-channel diagnostic remains red for every run; this is not full-scene acceptance. Images and unmodified reports remain beside this document for independent review.

| Backend | Samples | Largest display HDR difference from Three | First identical-scene HDR difference |
| --- | ---: | ---: | ---: |
| raw | 1 | 0.227661133 | 0.135009766 |
| raw | 4 | 0.0805664062 | 0 |
| typegpu | 1 | 0.227661133 | 0.135009766 |
| typegpu | 4 | 0.0192871094 | 0.000244140625 |
| vgpu | 1 | 0.227661133 | 0.135009766 |
| vgpu | 4 | 0.0805664062 | 0.000244140625 |

The first identical-scene comparison changes only bloom in the final post stage, so its pre-post HDR should remain unchanged. Every later same-camera HDR repeat is exactly zero. The horizon transition intentionally moves the camera and is not a stability comparison. The initial change is preserved, not hidden by extra frames; its cause remains unresolved. The TypeGPU four-sample result differs from raw/vgpu and is not evidence of greater fidelity without localization and visual review.

TypeGPU owns one public command encoder for pose, sky, world and post, retaining the raw split sky/world pass structure. Its command encoder API is publicly exposed but marked unstable by the pinned library. vgpu's public Frame API rejects preserving multisample contents across passes, so its sky and geometry draw in one depth-cleared world pass, with sky depth writes disabled. Its public pose compute dispatches precede that frame and retain their separate submissions. These are explicit candidate orchestration costs; neither path falls back to native pipeline construction. Devices and environments are borrowed by frame owners; the lab driver disposes its components before their borrowed dependencies.

Focused camera tests (16), the raw control TypeScript project, production control build and independent source review passed. One horizon pair was inspected during this pass; fresh independent visual acceptance remains pending. Grass, scenery, impostors, directional shadows, overlays, full live-world replay and performance remain outside this control.

Reproduce from repository root with the frame Vite config on port 5199, then for each backend `raw`, `typegpu`, `vgpu` and sample count `1`, `4`:

```sh
FRAME_CHECK_URL='http://localhost:5199/frame-check.html?backend=typegpu&samples=4' FRAME_EVIDENCE_DIR='../../../../specs/battle-performance/assets/02-typegpu/frame-ports/samples-4/' node apps/battle-perf-lab/src/raw/verify-frame.mjs
```

The verifier intentionally exits nonzero for the retained numerical diagnostic. Inspect `errors`, `pageErrors`, finite-output fields and disposal counts separately; a red image diagnostic must not hide a runtime failure. Build configuration inherits `copyPublicDir: false`.
