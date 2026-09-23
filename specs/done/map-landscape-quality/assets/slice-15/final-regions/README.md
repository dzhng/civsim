# Remaining regional acceptance

The finite campaign coverage pass uses production source city anchors for the
Aegean, dry southern coast and wet north. It fixes visual time, disables political
and fog overlays, and waits for the presented terrain revision before capture.

The first Aegean view exposed a real tile failure (`4:-1:2`, null triangle sample).
No regional image was accepted from that run. The failure was caused by clipping interpolation rounding a boundary vertex
just outside the tile. Clip intersections now use the exact clipping-plane
coordinate, retaining strict surface bounds. The real-coastline regression
reproduced the failure before the fix;21 focused shoreline/worker/landscape
checks and typecheck pass. All three production regions now settle and capture
without page errors in `fixed-run.json`.

Fresh review found no terrain holes, coastal gaps, floating settlements or
broken roads in these views. Faint vertical dotted artifacts offshore, most
visible in the dry-south image, remain under a bounded diagnostic check. Smooth
interiors are a retained aesthetic limitation. These first captures establish
regional coverage; exact repeated images remain due.

Change ledger: `builds the Aegean coastal detail tile without sampling outside
its base domain` is a new regression. The former implementation threw while
building the actual coastal footprint. The corrected implementation keeps all
emitted positions in the tile and resolves the failing boundary sample. The
independent focused shoreline run passes all ten tests (`shoreline-test.log`).

The native magenta-background isolation identifies two subpixel raster pinholes,
each within0.60pixels of a projected coarse/detail edge. They are independent of
the fixed tile-loading exception. A rejected boundary-collapse control was fully
reverted because it violated surface queries. The small raster artifact is
retained as a known limitation under the user's direction to stop isolated polish;
fixing it requires matching boundary tessellation, not a color or depth tweak.
The [probe](coverage-probe/metrics.json) records its extent; no claim of a perfect
crack-free image is made.
