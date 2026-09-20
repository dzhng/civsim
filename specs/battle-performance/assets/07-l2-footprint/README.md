# L2 at the L1 footprint: performance evidence, not accepted quality

The scratch main-audience remap replaces only L1 with existing L2. Full shading,
L0, impostors, poses, visibility, and shadow tiers remain unchanged. No production
LOD policy has changed. The fixed build and runner remain in
`throwaway/l1-to-l2-probe/`; compressed source patch and build identity are here.

Control / L2 / L2 / control each use a fresh browser, three verified physical
cameras, and two blocks of 50 complete submission-matched GPU samples per camera.
All 24 blocks completed without warnings, errors, or missing selected queries.
The frozen workload is tick 30, hash 15927906182668164452, 15,560 soldiers,
2880×1800 physical pixels, samples=1, single shadows. Preparation and screenshots
are outside timing. This is a marginal GPU experiment, not live FPS acceptance.

| Camera | Median block main GPU, control → L2 | Main triangles, control → L2 |
| --- | ---: | ---: |
| 200m tactical | 13.58 → 9.15ms | 15,845,822 → 4,391,110 |
| 200m low angle | 13.83 → 9.13ms | 15,945,302 → 4,535,618 |
| 600m wider | 9.17 → 9.20ms | 6,738,100 unchanged |

[Summary](summary.json) reports medians of per-block medians. GPU stage intervals
overlap and cannot be added. The wider view already uses coarser tiers and is a
negative control. Main/shadow draw counts and shadow geometry are identical in
each pair. After disposal, tracked allocations return to zero.

Screenshots revisit cameras after timing, without recording their LOD histories
alongside each capture. Exact correspondence with the timed tier counts is
therefore unproven; the follow-up records counts at each screenshot.

Repeated control captures are pixel-identical, as are repeated candidate
captures. The wider control/candidate pair is also pixel-identical. The tactical
and horizon pairs differ in 6.65% and 4.90% of pixels respectively; difference
metrics locate changes and do not establish acceptable quality.

Independent anonymous review of four full frames and twelve enlarged crops
preferred control L1 for more solid infantry bodies and continuous equipment
edges, with medium confidence. L2 looked more perforated/stippled, particularly
pale infantry and rear troops. The reviewer could not establish an actually
severed weapon or structural failure. L1 also made fan-shaped diagonal equipment
more conspicuous; this was not proven malformed. Flags, formations, grounding,
mounted crop and UI were effectively tied. A=L2 and B=control; mapping and timing
were withheld from the reviewer. Static images cannot prove motion stability.

Decision: do not adopt the remap as-is. Retained material IDs do not prove retained
silhouettes. The baker changes triangle budget, detached-component omission and
island floors between these tiers, and may alter normals/tangents during collapse.
First compare both tiers with identical constant-color opaque rendering to separate coverage
loss from shading differences. If coverage is responsible, test an intermediate
reduction that retains L1's component-preservation settings before expanding to
all appearances. Any candidate still owes full material, pose and moving-camera
quality gates and the live net-shadow performance equation.
