# Shared campaign verification inputs

The controlled stage and real-map coverage checks now consume one natural-ground
color classifier. Its independent reference RGB samples admit yellow and olive
grass; negative controls reject blue water, neutral gray and red-brown soil.
This is a color-coverage check, not vegetation segmentation or material acceptance.

The production migration also moved cart presence to seated scenery anchors.
The road check now reads that existing owner and fails explicitly if it is absent;
there is no compatibility counter in the runtime.

CPU replay of the retained first-pass PNGs preserves every denominator and all
numeric floors. The original first-pass captures and measurements are retained in
[the map audit](map-first/README.md). Independent read-only review found no
source defects. Root's merged focused run passes ten tests and typecheck. The
updated browser scenes still need to run with the actual UI fixes; no canonical
image is repinned by this pass.

## CHANGE LEDGER

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| campaign-lod named northern Apennines crop | Green-leading coverage 0.0871 of 83211 pixels, below 0.55. | Shared yellow-olive coverage 0.7409, same pixels and 0.55 floor. Mountain 0.7423 and dark-feature 0.1734 checks unchanged. | The old color rule rejected sunlit yellow grass in the supplied target. **moved** |
| campaign-lod named central Apennines crop | Green-leading coverage 0.0599 of 104235 pixels, below 0.55. | Shared coverage 0.6620, same pixels and 0.55 floor. Mountain 0.6787 and dark-feature 0.1727 unchanged. | Same reference-grounded classifier replaces the duplicate rule. **moved** |
| campaign-lod named southern Apennines crop | Green-leading coverage 0.0712 of 55062 pixels, below 0.55. | Shared coverage 0.6067, same pixels and 0.55 floor. Mountain 0.6603 and dark-feature 0.1693 unchanged. | Same reference-grounded classifier replaces the duplicate rule. **moved** |
| campaign-lod-rome-close ground coverage | Green-leading coverage 0.0986 of 507538 pixels, below 0.42. | Yellow-olive coverage 0.7979, same pixels and 0.42 floor. | A single shared oracle now measures the chosen yellow-to-olive character. **moved** |
| campaign-lod-selected-army-city ground coverage | Green-leading coverage 0.1004 of 507576 pixels, below 0.42. | Yellow-olive coverage 0.7960, same pixels and 0.42 floor. | Same classifier transfer with identical exclusions. **moved** |
| campaign-polish-roads cart presence | Reads retired sceneryStats.carts, reports an empty object and fails at least-one-cart check. | Reads physicalWorld.sceneryAnchors filtered to cart, retains at-least-one floor and explicit missing-owner failure. Browser rerun pending. | Cart instances already belong to the physical world's seating owner. **moved** |

The controlled marker scene's predicate and assertions are unchanged by extraction.
Four new classifier tests cover actual reference colors, yellow-leading grass,
red-brown soil, and colorless pixels. The new cases do not replace visual checks.
Political and fog frame coverage remains 0.0167–0.0474, below the retained 0.42
floor. Labels retain their original 0.002 threshold; roads, water, density,
selection, same-frame collision and snapshot checks are unchanged.
