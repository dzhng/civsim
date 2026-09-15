# Battle forest density

A fixed cap of 240 trees made large connected forests much thinner than small ones. The existing cap is now 4096, enough to retain every eligible candidate in the six curated/authored fixtures while preserving a finite component bound. At the unchanged 9.6 m spacing, 4096 lattice sites correspond to roughly 0.38 km². This is a bounded normal-map density correction, not a promise of constant density in arbitrarily large forests.

Only that cap changes. Source membership, roads/clearings, slope rejection, candidate identities, models, sizes, tint, atmosphere, physical terrain and recipes remain unchanged. A regression grows a connected forest around an existing region and requires every existing tree pose/style to remain. It failed with the old cap and passes now. All 520 CPU tests and TypeScript pass; independent scoped code review found no actionable defect.

## Measured placement

| Fixture | Trees before | Trees after | Coarse canopy coverage before → after |
| --- | ---: | ---: | ---: |
| Generated 1 | 559 | 559 | 27.77% → 27.77% |
| Generated 7 | 524 | 549 | 26.33% → 27.62% |
| Generated 8 | 818 | 3451 | 6.58% → 28.10% |
| Authored A | 480 | 1214 | 11.15% → 28.26% |
| Authored B | 960 | 3081 | 8.95% → 28.29% |
| Authored C | 0 | 0 | No forest |

The large western seed 8 component rises from 2.35% to 28.16% canopy footprint. No slope removals occur in these fixtures; their eligibility and generated terrain hashes are unchanged. Coverage measures actual coarse opaque-model triangles projected onto exact source forest cells, not alpha-tested leaves or perspective pixels.

## Visual acceptance and its boundary

Fresh unprimed critique accepts the denser woodland as a clear improvement in presence and canopy grouping. Foreground openings remain. The angular ground fringe, repeated conifer silhouettes, uniform forest floor and missing understory remain visible; density does not fix them. The same view has no troops within the forest, so troop readability under canopy remains unverified.

The complete 1280×800 frame still has hardware-only repeat differences in the bronze cardbar: 12,513 pixels inside x374–976/y581–784, mostly one or two RGB levels. Waiting for fonts and decoded portraits did not remove them. No runtime CSS or comparison tolerance changed. The 1280×560 world region above the HUD repeats with zero differing pixels through snapCheck; the full failed report is retained. Hardware gradient rasterization is a hypothesis, not an established cause. Canonical whole-frame software delivery remains separate from this density acceptance.

## Hardware cost

On headless Chrome with Apple Metal, a named seed 8 forest-view pan keeps 15,560 soldiers and grows total scenery from 862 to 3495. Both cap controls have rAF p95 and maximum 16.67 ms. Draw calls remain 58; reported triangles rise from 114.60 million to 119.19 million. GPU medians were 13.79 ms before and 10.93 ms after; this single pair supports staying within budget, not a speedup claim.

The unchanged battle-perf-30k gate passes at 30,560 soldiers: GPU medians 11.69 ms mid and 17.23 ms vista, with wheel rAF p95 19.9 ms. Its requested close zooms 24 and 28 actually settle at 8, so those checks do not establish performance at 24/28. Correcting that fixture scope remains a slice 13/15 follow-up. No CPU checks overlapped these timing runs.

A separate next material hypothesis is that interpolated categorical tint IDs invent intermediate rock IDs between grass and forest. Investigate classification before interpolation in the material owner without moving trees or changing physical tint semantics; it is not part of this cap change.
