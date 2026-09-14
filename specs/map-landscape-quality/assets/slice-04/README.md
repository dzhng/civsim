# Mountain form investigation

The target is a connected geographic range with distinct summits, readable saddles and branching valleys, and low foothills merging into surrounding land. Clay views isolate geometry; unchanged natural materials are a diagnostic, not a second tuning variable. This is an independent slice-04 pass; tiled-world integration remains with the parent branch.

## Evidence and current boundary

`before/` is the previous warped relief. `candidate-15/` is the current minimal crest/coast pass. Both use identical viewport (1280×800), DPR1, source regions, fixed reference time, pitch and zoom controls. The camera centers on rendered ground, so its derived target elevation follows the geometry; screenshots are comparable landform views, not identical world-space camera matrices.

Candidate 15 is accepted as a bounded perimeter/serration cleanup. A fresh comparison found fewer artificial coastal border ridges and fewer repetitive crest teeth while connected ranges remain. Fine crest and foothill detail softens slightly; this is a limited tradeoff, not a claim of new valley architecture. The broader reference character remains open: large rounded faces, cramped channels and weak subsidiary foothills still need work. Existing source city aprons remain authoritative; water remains at zero and node positions remain fixed.

The previous normalized rounded cap raised non-peak samples slightly and enlarged Italy's dark flank. The accepted cap only trims the cusp. A labeled dark-pixel proxy in `comparison-15.json` is lower than before; it is not a physical shadow mask. The fresh visual verdict, rather than that number, decides acceptance.

## Rejected directions

A medial-distance height body produced plateaus. Thinning the source mask into a segment graph preserved connectivity numerically but produced walls and posts; a fresh review rejected that path. A first return to multiscale folds was also rejected: large height outside the source range created raised coastlines, while nearly level winding crests enclosed bowl-like valleys. Those graph owners are removed. Further mask-based candidates created repeated towers and circular depressions. Those losing source fields and their geometry cache are also removed. The retained control starts from the previous relief and rounds only the sharp cusp used for crest sampling. A geometry-only coastal transition uses the shared canonical coastline and stays inside its existing halo.

These are geometry findings, not permission to compensate with materials, foliage, or lighting. The reference remains the judge; a pixel distance from the previous image does not establish quality.

## Deferred local foundations

These distances and heights use exaggerated campaign render kilometres, not real elevation. The real largest normal city mesh reaches 6.092 km from its anchor; the ordinary tier footprint reaches 5.109 km. A 9 km core covers those feet and the 2 km mesh triangle support. The closest real pairs (Perge/Attalea and Cyrene/Apollonia) require smaller disjoint cores; their actual tier meshes still fit. Odds weights approach each core height continuously without a neighbor tilting its footprint.

A five-point coast margin missed diagonal wet ground at Scodra. Scanning the bounded whole core on a stable 1 km lattice identifies coastal foundations, which stay at sea level. Inland foundations retain local relief elevation. This decision is computed once per relevant settlement per build and reused for every vertex. It never depends on the current tile's partial land mask.

The all-settlement actual-model probe measured 401 sites. The old generator had nonzero footing residuals at all 401; an intermediate candidate left 18 above 1e-5 km. The foundation spike leaves none above that tolerance. The JSON files preserve per-site heights, land-foot residuals, and wet-foot counts. That result is detailed 2 km terrain evidence. A separate 8 km sweep leaves 373/401 nonflat, with maximum 1.002 km. More importantly, clay captures reveal circular shelves and depressions around the flat cores. The retained candidate 15 still has nonzero detailed-grid footing residuals at all 401 sites (maximum 6.038 km), so no placement fix is claimed. The spike is therefore excluded from the retained geometry; its measured failure cases and dimensions are retained for slice 12 integration. Rejected implementation code is not retained in the repository.

## Allocation and ownership

The retained pass adds no source fields or persistent geometry cache. The discarded foundation experiment needed 401 settlement XY pairs (3,208 bytes per source copy); none remain in the source schema. There is no retained mountain mask, signed-distance cache, graph or segment owner.

The parent branch's canonical coast helper and allocation estimator are reused. The 16 km height transition fits within the existing 18 km coastal support, so this pass does not expand per-tile coast scratch allocation. Noise stays private to the one landscape generator; material and vegetation ownership do not change.

## Verification

The retained pass passes 79 files / 448 CPU tests, typecheck and targeted lint. All seven new clay baselines and three existing natural baselines are updated and repeat with zero changed RGBA pixels. Independent code review found no correctness issue and required updating the existing/new snapshot references; that finding is resolved by the reviewed images included in the pass. The independent visual reviewer accepts only the bounded cleanup described above. This does not complete slice 04 or tiled-world integration.


## Final independent view review

A fresh reviewer compared the three natural baselines with 877c5d77 and inspected the coarse clay diagnostic. It accepted the bounded cleanup with medium-high confidence: ranges remain connected and the coastal lip becomes a continuous descending apron, with no new high-confidence geometry defect. Remaining left-center Alps crest teeth and regular stepping/fanned facets in the coarse view remain visible. The coarse view had no prior comparison in that review. Neither review claims the reference's varied peaks, buttresses, saddles or foothill hierarchy have been achieved.
