# Persisted tour replay repeat

A second offline replay consumed the same 433 SHA256-verified source packets and
binary grass revisions. Assets were served from the primary public directory;
loaded appearance and ground identities matched. No source simulation was rerun.
The original archive and first replay images remain unchanged. Repeat output
occupies 98,689,565 charged bytes in the separate local `../02a-tour-repeat-1/`.

All 433 camera/crowd/active-grass hash gates pass again. All six endpoint GPU
indirect command comparisons pass; pan and horizon endpoint images remain exact.
The corrected report retains nine publication transitions. Zoom start has one
source-differing pixel, compared with three in the first replay; zoom end retains
one source-differing pixel. The strict image gate remains red.

The two pixels at (270,876) and (270,877) differ between the two replays; the second
matches the recorded source. The pixel at (1500,786) is identical in both replays
but differs from source. The zoom-end pixel at (1529,1105) is also identical across
both replays and differs from source. Exact RGBA values are in the three-way
comparison. This separates observed replay variability from stable source/replay
differences; it does not establish their cause or authorize a tolerance waiver.
Crops place the differences among crowd geometry, requiring further draw/state
localization before deciding whether grass routing contributes.

The replay-only CLI now requires an explicit archive directory different from its
empty output directory. Reads use the archive; PNGs and reports go only to output.
This prevents a diagnostic repeat from silently replacing the first evidence.
