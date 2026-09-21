# Image-only comparison

A is `source`, B is `actual`. Inspected all eight full frames and original-resolution crops. No code, browser, reports, or GPU observations informed this review.

| Pair | Concrete observation | Less wrong |
| --- | --- | --- |
| tactical-initial | B has soft blue-green cast shadows extending toward the foreground beneath formations; A lacks those broad shadows, most obvious under the orange/brown front-left-center formation. Unit shapes, positioning, Holding labels, yellow arc, orange triangle, thin direction lines, ground color and sparse ground specks otherwise appear consistent. | B: the formations are more grounded. The broad shadows are soft and somewhat comb-like, but give depth absent from A. |
| tactical-settled | Both show broad formation shadows and denser small dark ground specks than the initial pair. Original-size shadow and central cue crops show no convincing one-sided content difference. The arc, triangle, crossing lines, label and troop occlusion agree visually. | Tie at inspected resolution. |
| horizon-settled | No convincing one-sided difference in troops, terrain rectangle, bright inner terrain edge, sky gradient, sun, or labels. Both crowd the Holding labels into overlapping rows, obscuring rear formations. | Tie; neither fixes the label collisions. |
| far-lod-settled | No convincing one-sided difference. Both show the same tiny terrain rectangle, block-like formations, partly visible orange cue, and enormous relative-to-unit overlapping Holding labels. Individual units and shadows cannot be resolved reliably. | Tie; both have poor readout legibility at this distance. |

Shared limitations: tactical ground reads as a smooth mottled plane with fine dark specks; these stills do not establish that those specks are convincing grass blades. At horizon/far distance the finite map edges are conspicuous and the label stack dominates the content. These are shared observations, not evidence of a regression in B. No numeric performance/readout overlay is present.

Stills cannot prove frame rate, startup duration, temporal stability, animation correctness, shadow update behavior, grass motion, LOD transitions, culling correctness outside the view, depth correctness under camera movement, or implementation equivalence. Similar settled frames do not prove initial-frame equivalence: the initial shadow difference is plainly visible.

## Crop coordinates

Coordinates are original 2880×1800 pixels, left/top/right/bottom; no resampling.

- tactical-initial and tactical-settled shadow: 650,1180,1140,1450.
- tactical-initial and tactical-settled cue: 1220,780,1700,1070.
- horizon-settled center: 1180,800,1670,1000.
- far-lod-settled center: 1220,810,1640,1010.

Crops are named `<pair>-<region>-source.png` and `<pair>-<region>-actual.png` in this directory. Initial cue crops were produced for review convenience; the conclusion about cues uses full frames and the settled original-size pair.
