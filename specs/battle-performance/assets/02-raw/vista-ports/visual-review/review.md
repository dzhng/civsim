# Fresh visual critique: standards and vista

## Scope and method

Inspected the **12 vista actual/expected pairs (24 source PNGs)** at full frame and in nearest-neighbor **tight3x** crops, using image viewing tools and `web/node_modules/pngjs`. No browser, GPU execution, implementation, tracked edits, or prior review judgments were used. This is an image-only assessment, not a source-code correctness verdict.

Target: terrain should read as connected slopes with distant ridges receding into sky, without cracks, abrupt exposed boundaries, or compositing holes. Neither filename is treated as visual ground truth.

All comparison images put **actual left, expected right**, with an 8-pixel gray divider. Full pairs preserve source resolution; `tight3x` means exact 3× pixel replication, not sharpening/interpolation. Transparency is preserved and appears black in the viewer; this is not black scene geometry. Crop coordinates use original-image pixels, top-left origin. `metrics.json` records source paths, dimensions, RGBA distances, alpha histograms and initial crop bounds; `crop-manifest.json` records extra ridge/far-edge crops. Capture time/camera metadata was not audited; paired compositions align visually and numerically. Motion conclusions are limited to the supplied static poses.

## Vista

Sources in this worktree: `specs/battle-performance/assets/02-{raw,typegpu,vgpu}/vista-ports/samples-{1,4}/{overview,horizon}-plain-{actualRgba,expectedRgba}.png`. All 12 pairs inspected, including both sampling levels of all three ports.

### Actual-versus-expected defects

**None visibly distinguishable; confidence 0.99.** No pair-specific missing ridge, split terrain, far-edge displacement, sky hue shift, or alpha hole is visible, in either full views or crops. Every differing channel is only one code value apart. Horizon frames have more changed pixels than overview frames, but not larger changes. This is not visible evidence that one port's scene is worse.

**Alpha result:** every pixel in every supplied vista source is alpha **255**. Actual/expected alpha mismatches: **zero**. Thus the saved final images have no transparent horizon holes or alpha fringe. This does **not** prove an intermediate terrain layer's alpha is correct, and fully opaque sky could still show through a geometric gap; these flattened images cannot certify internal compositing.

### Shared limitations and observations

| Feature | Concrete observation | Full frame vs tight3x | Confidence |
|---|---|---|---|
| Joined terrain | Overview slopes merge continuously across the central valley and into the brighter right-hand hill; no open black/sky-colored crack or detached patch is apparent there. Horizon foreground/midground also reads as connected terrain. | Full frame and central crop agree. | 0.96 |
| Ridge meeting point | Around original `x≈175–285, y≈174–187`, a thin pale taper projects rightward where distant ridges overlap. At 1× it becomes a stair-stepped line with a few isolated pale pixels at its tip; 4× makes it smoother but does not remove the taper. It reads like a narrow light ribbon at the ridge join. Shared by actual/expected and all ports; not enough evidence to call it a geometry crack or diagnose its cause. | Subtle but locatable full-frame; distinctly visible in tight ridge crop, especially 1×. | 0.97 for visible feature; low confidence it is a defect rather than overlap/haze |
| Far edge | The right-hand far ridge is a narrow pale green band behind the nearer bright hill. It meets the frame continuously; no exposed vertical map wall, empty strip, or actual-only clipping is visible. The ridge/sky silhouette is conspicuously stair-stepped at 1× and smoother at 4×. | Band visible full-frame; edge sampling clearest at 3×. | 0.98 |
| Depth/material limitation | Broad rounded hills, uniformly mottled yellow-green surface and little local detail make the overview read as soft, almost airbrushed terrain. Horizon has real depth separation through paler distant bands, but the unbroken grassy surface offers few scale cues. This is a shared appearance limitation of these plain isolated scenes, not a missing-prop regression claim. | Strongest in full frames; crop resolves grain but adds no larger-scale material structure. | 0.95 |
| Horizon blending | Sky transitions smoothly from pale yellow near the horizon to blue above. Distant terrain desaturates, but remains a fairly crisp silhouette rather than disappearing into haze, especially at 1×. No dark outline or transparent notch distinguishes either side. | Visible full-frame; crop emphasizes stepped outline at 1×. | 0.98 |

Selected evidence: [overview 4× full](vista-raw-4-overview-full.png), [overview crop](vista-raw-4-overview-tight3x.png), [ridge 1×](vista-raw-1-horizon-ridge-join-tight3x.png), [ridge 4×](vista-raw-4-horizon-ridge-join-tight3x.png), [far edge 1×](vista-vgpu-1-horizon-far-right-tight3x.png), [far edge 4×](vista-vgpu-4-horizon-far-right-tight3x.png), [alpha channel](vista-raw-4-horizon-alpha-tight3x.png). The selected durable crops are saved here; the full temporary review set remains at `/tmp/battle-standard-vista-eyes/`.

## Metrics

Raw decoded RGBA comparison, no tolerance or perceptual processing. “Changed” counts pixels with any channel difference; percentages use the complete frame, including transparent background for standards. Maximum absolute channel difference is **1/255 for every pair**; **no pixel exceeds 8/255**. Alpha differences are zero for every pair. Counts are diagnostic, not quality scores.

| Pair | Dimensions | Changed pixels | Changed % | Max RGB delta | Alpha differences |
|---|---:|---:|---:|---:|---:|
| vista-raw-1-overview | 768×512 | 339 | 0.08621 | 1 | 0 |
| vista-raw-1-horizon | 768×512 | 7292 | 1.85445 | 1 | 0 |
| vista-raw-4-overview | 768×512 | 339 | 0.08621 | 1 | 0 |
| vista-raw-4-horizon | 768×512 | 7306 | 1.85801 | 1 | 0 |
| vista-typegpu-1-overview | 768×512 | 95 | 0.02416 | 1 | 0 |
| vista-typegpu-1-horizon | 768×512 | 7368 | 1.87378 | 1 | 0 |
| vista-typegpu-4-overview | 768×512 | 93 | 0.02365 | 1 | 0 |
| vista-typegpu-4-horizon | 768×512 | 7380 | 1.87683 | 1 | 0 |
| vista-vgpu-1-overview | 768×512 | 92 | 0.02340 | 1 | 0 |
| vista-vgpu-1-horizon | 768×512 | 7365 | 1.87302 | 1 | 0 |
| vista-vgpu-4-overview | 768×512 | 89 | 0.02263 | 1 | 0 |
| vista-vgpu-4-horizon | 768×512 | 7377 | 1.87607 | 1 | 0 |

## Conclusion

**Visual tie within every actual/expected pair.** No visible pair regression identified. Vista retains shared ridge-tip aliasing/light-taper and soft, low-detail terrain limitations. The smoother 4× ridge coverage is visible, but neither full-frame similarity nor byte-level alpha agreement proves live motion, in-scene grounding, or intermediate alpha correctness. No code or test verdict is implied.
