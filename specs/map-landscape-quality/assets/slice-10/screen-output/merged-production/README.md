# UI composed with the accepted landscape inputs

These three production views add the screen output phase over the already
integrated source mountain band, removed rock props and card packing. Controls
are the slice05 integrated-ground captures. All cameras, ticks, source/scenery
records, label/body geometry, terrain geometry and water data remain equal.
Terrain admission CPU duration is naturally different and is recorded separately
from geometry equality. There are no army markers at these three poses.

Changed pixels: Alps15,755; Italy13,750; close Alps10,101. Every changed pixel is
inside a reported label box padded2px; all968,003 /979,235 /986,374 outside pixels
respectively remain identical. The full raw state stays in the worktree's
`throwaway/production-ui-integrated`; the compact comparison records the tested
contracts without duplicating geometry dumps.

Fresh unprimed review and direct inspection prefer the brighter names in all
three views. No new layout, clipping, scenery or overlap regression is visible.
Existing Alpine joined names, viewport-edge clipping, muted settlement models
and conspicuously pale angular roads remain. This accepts the bounded output
correction, not those unrelated defects or overall landscape quality.

All three frames repeat with zero differing pixels and no page errors when
source is held fixed. One earlier repeat was invalidated by a formatter-triggered
dev reload that reset the camera; it was discarded. The capture now checks the
requested camera, paused tick and fog state before accepting a frame.
