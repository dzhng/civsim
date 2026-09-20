# TypeGPU material image sharing: device proof

The isolated candidate fd41af3c/ad8c218a wires one immutable image owner per
catalog preparation into the actual crowd renderer. Per-appearance tables and
samplers remain independent. Root129 TypeGPU tests and static owner/wiring review
pass; the owner also received an independent read-only review with no findings.
This is not final performance or production-cutover acceptance.

A probe installed before renderer construction observes actual
`queue.copyExternalImageToTexture` destinations, their device-reported dimensions,
mip levels and format, and texture destruction. On the actual TypeGPU Menu route,
map A, 15,560 soldiers at tick30, the fixed pre-sharing baseline has60 live material
textures (2048²,12mips:20sRGB+40linear). Candidate has3 (1sRGB+2linear).
Logical image payload falls from1,342,177,200 to67,108,860 bytes:95% fewer bytes.
Both destroy every observed uploaded image and finish with zero tracked allocated
bytes. No page errors. This is logical payload, not physical VRAM or FPS.

Appearance controls compare fixed builds397173a0 andad8c218a at1440×900/DPR2,
single shadows, identical canonical battle hash15927906182668164452, with the
minimap allowed to settle. All four full2880×1800frames are pixel-identical at
zooms7.75,7.5,7.884923 and1.5. Content/camera/depth checks and candidate resize/
disposal checks pass. A tactical pair and enlarged unit crop are retained here;
all frames, scripts and fixed builds remain at `throwaway/typegpu-image-sharing/`.
The allocation baselinefeabc4d4 differs from the visual control only in intervening
non-material work; visual builds differ in image ownership and shared extraction.

Fresh unprimed critique found visible grounded soldiers and intact bodies/shields/flags,
but also noisy thin weapons, weak warm-material contrast, rectangular distant
terrain/shore edges and flat distant vegetation. Since the compared frames are
pixel-identical, these are inherited visual limitations, not sharing regressions.
The HUD conceals the bottom formation; the close mounted coverage remains owed.

Still open: close mounted/full-catalog fixture coverage,
actual device reload/failure controls, and quiet paired preparation/traversal
measurements. No grass, lighting, shadow quality, camera motion or FPS gain is
inferred from these stills. The candidate is not yet integrated.
