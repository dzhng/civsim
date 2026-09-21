# Vista ports

The existing TypeGPU and vgpu terrain owners render the shared opaque vista and translucent far-fog meshes. Geometry, material roughness floors and camera data remain shared. Far fog uses the same view-elevation opacity function, source-alpha blend factors and disabled depth writes. Rings do not receive directional shadows. The dedicated control draws ground, vista and far fog in that order through each library's public resources and frame encoding; there is no native pipeline fallback.

All six 1x/4x backend matrices pass the unchanged `1/255` HDR maximum-channel gate:36 cases, maximum0.0029296875, zero nonfinite outputs, GPU errors, browser warnings or live textures after disposal. Identical horizon display repeats are exact. All display differences from Three and between candidates stay within one color code, with matching alpha. The shared opacity extraction leaves raw images pixel-identical to the previously reviewed native vista control. `pixel-comparisons.json` preserves comparisons against that baseline, the actual Three oracle and repeats.

A TypeGPU4x horizon image was inspected during this pass. Fresh independent visual acceptance remains pending; component numerical success does not establish full-world fidelity, motion behavior or performance. Existing terrain pipeline conventions remain: TypeGPU and vgpu terrain use their previously verified ordinary clip output, while native retains its existing annotation policy.

TypeScript, the dedicated production control build and an independent source review pass. The review found no actionable defects in roughness, opacity/blending, depth, layer ordering, camera handling or borrowed lifetime. No source art, quality policy, geometry density, simulation mechanics or production backend was changed.

Reproduce by serving `vista.vite.config.mts` and running `verify-frame.mjs` with `FRAME_CHECK_URL=http://localhost:5199/vista-check.html?backend=typegpu&samples=4` and a separate `FRAME_EVIDENCE_DIR`. Repeat for raw/TypeGPU/vgpu at1x/4x. The sparse task checkout uses an ignored publicDir override to primary assets; no public asset copies are needed.
