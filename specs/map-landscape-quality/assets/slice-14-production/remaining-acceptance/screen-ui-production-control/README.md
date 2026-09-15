# Matched production screen-output comparison

Read-only evidence for the corrected screen UI composition candidate. Control
is a clean worktree at b4576dd07ed5e313989861fca6c00b552e6c3be5 on port 5211;
candidate port 5210 has the same base plus the output-phase change. Each uses
an isolated Vite cache, identical root dependencies/public assets and copied
matching WASM. Source hashes, every original check result, image metrics and compact renderer
state summaries are preserved in report.json. Relevant actual label/card
geometry and full-state equality digests are in geometry-and-world-audit.json. No canonical baseline, assertion,
threshold, palette, typography, layout, physics, seed, or save changed here.

The original campaign-lod function runs unchanged through regional-natural,
including its preceding three whole-map states and all checks at those stops.
Then the same paused day-1 world moves to natural/no-fog/no-selection Alps,
cam(-450,990,2.5). All views use 1280×800, DPR 1, renderer tick 0. Overview is
cam(-100,250,.16), regional is cam(-430,445,3). No new campaign is inserted
between regional and Alps. Three full runs produce control/candidate/repeat.

## Results and remaining gate

| Pose | Changed pixels | Candidate repeat differences |
| --- | ---: | ---: |
| Whole-map political | 54,162 | 0 |
| Regional natural | 7,648 | 0 |
| Alps natural | 15,754 | 0 |

No page or HTTP errors. Published label/card/body geometry and marker counts
are identical across all runs. Overview has 10 army markers; regional and
Alps have none. Every changed regional/Alpine pixel lies within reported
label boxes padded by 2 px; all pixels outside those areas are identical.
The overview additionally changes the intended army-marker surface.

The unchanged regional label floor **still fails**: 134/977920 (.000137)
becomes 1023/977920 (.001046), below .002. All other components of that
structured-map check pass. The existing named-crop green check also remains
red; brighter labels change some excluded pixels and darker halos change
some crop counts, so its detailed values move slightly despite unchanged
terrain pixels. Full old/new values remain in the report; neither gate was
waived or rewritten.

## Brightness attribution

regional-brightness-audit.json measures pixel centres inside the published
ink rectangles using the exact old RGB predicate. Peak RGB is the brightest
observed pixel in the rectangle, not an inferred shader input. Union counts
avoid double attribution.

The 1023 bright pixels comprise **889 in labels, 131 in DOM card boxes and
3 in the top HUD band**, with none elsewhere. The implemented .002 comparison rounds the ratio to four decimals first, so it
needs1907 pixels, leaving a shortfall of884. A strict unrounded floor would need
1956; that was the earlier incorrectly reported requirement. Every reported label has opacity 1;
this is not an opacity fade. Seven labels contribute bright pixels:

| Label | Visible ink-box area | White pixels | Peak RGB |
| --- | ---: | ---: | --- |
| AESERNIA | 1360 | 134 | 244,240,233 |
| ATERNUM | 1380 | 127 | 244,240,233 |
| BENEVENTUM | 1940 | 212 | 244,240,232 |
| CORFINIUM | 1660 | 87 | 243,239,232 |
| LARINUM | 1320 | 108 | 243,239,232 |
| PUTEOLI | 900 | 114 | 242,239,232 |
| SPOLETIUM | 1600 | 107 | 244,240,233 |

Pompeii, Sipontum, Venusia and Aleria have offscreen ink boxes. Populonium's
box starts at y44.402 behind the top HUD and contributes zero bright pixels.
The output correction restores bright glyph interiors; sparse/occluded
visible glyph coverage still falls short of the existing full-frame oracle.
No typography or threshold change follows from this evidence alone.

## Alps label spacing

IULIA CONCORDIA and AQUILEIA retain exactly the same geometry. Their ink
rectangles have only **2.275 px** horizontal clearance at nearly identical
y positions. Their padded atlas boxes overlap **9.725 px**. Both world node
anchors and rendered city-body bounds are retained in
geometry-and-world-audit.json. The current ink-overlap oracle does not report
a collision, but full-image and 3× crop inspection show the names reading as
one phrase. This is a pre-existing spacing/painted-halo issue, not a new
terrain/source-band regression, and the output change does not resolve it.

## Fresh visual review

An unprimed reviewer inspected all six full images and six crops. Direct
inspection agrees: candidate city names are substantially easier to read
against grass, mountains, roads and water; small standards are easier to
find, though their internal symbols remain too small to identify reliably.
No new placement, overlap, clipping, or card regression was found. Existing
edge clipping and the Alps joined-name problem remain. Stronger faction
headings improve scanning but have heavier dark borders and make terrain
relatively less prominent; this is a recorded hierarchy tradeoff, not a
claim of final reference quality.

## Evidence storage

The original unabridged files are preserved locally under
`/Users/david/dev/game-campaign-remaining-acceptance/throwaway/screen-ui-production-control-full/`.
Each compact file records its original absolute path, byte count, line count
and raw-file SHA-256. Array summaries retain counts and canonical SHA-256;
the canonical encoding is specified in both files. Every check name and
boolean is unchanged. Ordinary check details are retained verbatim; large
renderer-dump details retain scalar/count summaries and their original exact
string digest, with the complete text available in the archived original.
All 39 check results, all error lists, image metrics, comparisons and source
hashes were checked for preservation during compaction.

Full before/candidate/repeat geometry was compared before compaction. The
per-field equality proof includes all label/card/body rectangles, tick and
marker count, with each run's full-array digest. Regional label/card geometry
and Alpine pair text, opacity, boxes, world anchors and rendered bodies remain
directly readable. Unrelated repeated scenery and army arrays are represented
by counts and digests. The independently measured brightness audit and every
PNG remain unchanged.

Storage reduction (these two JSON files only):

| File | Original lines / bytes | Compact lines / bytes |
| --- | ---: | ---: |
| report.json | 188,339 / 8,783,027 | 7,663 / 294,435 |
| geometry-and-world-audit.json | 16,982 / 471,599 | 911 / 21,462 |

Combined: 205,321 → 8,574 lines and 9,254,626 → 315,897 bytes
(96.59% fewer bytes). No assertion result or image evidence was discarded.
