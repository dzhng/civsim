# Fresh water visual review

## Scope and verdict
Reviewed all 16 full PNGs for overview-t0 and horizon-t3.25 in lake-1, lake-4, ocean-1 and ocean-4, then inspected matching 3× nearest-neighbor crops (water / shoreline / horizon). Also viewed each actual horizon-t0 and horizon-repeat-t3.25. Decoded-pixel comparisons cover all supplied pairs and all same-time horizon repeats. No implementation, asset README, summary, or prior judgments read; no browser/GPU work; no tracked files changed.

Target: water should read as a continuous reflective surface, with a coherent shore intersection, sensible near-to-far wave detail and lighting, and no holes or incorrect occlusion. Matching expected is not itself proof of visual quality.

**No concrete actual-only visual regression found. Confidence: 0.97 within these captures.** Actual and expected are visually indistinguishable at full size and in inspected 3× crops. Neither is visibly better. Both retain the following conspicuous shared limitations; these are not findings introduced by the candidate.

| Observation | Evidence / visibility | Confidence |
|---|---|---|
| Lake perimeter reads as a cut-out polygon sheet rather than a continuous natural shoreline: broad gray-beige rippled ring ends in large stair steps, with an outer dark-cyan band before grass. | Both lake variants, both members of each pair. Obvious at full size, especially overview foreground and horizon side edges; shore crops confirm large geometric steps rather than merely single-pixel aliasing. | 0.99 visible shape; 0.90 undesirable shore readability |
| Lake surface has rectangular shading/color patches, most apparent through the cyan middle-to-near water. This weakens the continuous-water impression. | Shared in lake overview pairs; visible full-frame with attention, clearer in water/shore crops. Remains recognizable in horizon shots, although foreshortening and waves obscure it. | 0.94 |
| Ocean presents an exposed finite sheet: straight diagonal left boundary, a far corner/flat cutoff, and a thin irregular tan opening at the bottom of horizon shots. | Shared in both ocean variants and both pair members. Full-frame visible; horizon/shore crops clarify the far/left termination. This could be deliberate fixture framing; images alone do not establish a production geometry bug. | 0.99 visible boundary; 0.60 defect outside fixture context |
| Far ocean highlights become dense pixel-like speckle rather than resolved ripples. | Shared, visible as grain at full size; explicit in 3× horizon/distant-water crops. No evidence from stills that it flickers. | 0.96 texture observation; 0.75 undesirable aliasing |

## Depth, readability, lighting, repetition
- Ocean water reads clearly: dark-blue depth, turquoise near-shore transition, warm glints compatible with the warm sky. No actual-only lighting jump, missing surface, black patch, or disconnected triangle found.
- Lake center reads as water; the broad gray perimeter and stepped termination are its strongest readability problems. The sheet-like appearance is not proof of a depth-buffer/order error. There are no units or crossing props here to validate their occlusion.
- All 16 same-time repeat comparisons (4 directories × 2 times × 2 pair members) are exactly identical in decoded RGBA. Viewed t0/t3.25 actual frames show changed ripple patterns with the same broad scene structure. This validates repeatability, not motion smoothness or absence of inter-frame flicker.
- For the requested full-image pairs, lake-1/lake-4/ocean-1 differ by at most 1 channel level. ocean-4 peaks at 6 (overview-t0) and 12 (horizon-t3.25). Inspected additional 3× crops around the maxima, at source (669,16) and (670,160), respectively: no discernible geometry/lighting defect. These are diagnostic pixel differences, not visible regressions.

## Artifacts
- `*-pairs-3x.png`: eight inspected comparison sheets; actual left, expected right; rows water, shoreline, horizon. Each source crop is 160×64, enlarged to 480×192 without interpolation. Ocean overview has no sky horizon; its third row is distant water.
- Individual `*-{actual,expected}-{water,shoreline,horizon}-3x.png`: 48 crop files.
- `ocean-4-*-max-delta-3x.png`: two additional inspected 128×48 source crops, 3×, actual left / expected right.
- `manifest.json`: crop coordinates and layout. `metrics.json`: pair/repeat pixel diagnostics. `crop.cjs`, `edge.cjs`: reproducible pngjs tooling using the user-specified node_modules.

Visual-only conclusion; implementation correctness and fixture intent were deliberately not assessed.
