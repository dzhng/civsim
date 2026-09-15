# Corrected-source motion replay checkpoint

This source includes the dedicated grass storage-group correction from 43138271
(local integration 3a49599d), which restores current buffers to actual draws.
The actual menu benchmark produced 433 presentations through 163.327 seconds, with
70 selected pan, zoom and horizon frames. Source capture closed before offline
Three replay. Capture copies, compression, readback and replay are not timing data.

All 433history camera/crowd/active-grass-record hash checks pass. All 70 selected
camera, visible/shadow crowd counts and active grass hashes match, as do actual
GPU indirect commands at all six endpoints. Pan endpoints and horizon endpoints
are pixel-exact at 2880×1800. Zoom remains a **strict pixel failure**: three pixels
at 95.296 seconds (maximum seven channel codes), one pixel at 107.662 seconds
(maximum eleven codes). Coordinates and exact RGBA values are recorded separately.
No cause, noise classification or tolerance waiver is claimed; replay-self
repetition remains the next diagnostic. Intermediate image parity is not claimed.

A real ring publication is included inside the pan window: pending starts at
frame 180 (37.165s), then ring revision 3→4 publishes at frame 203 (43.698s), clearing
pending and moving the base exclusion circle. The pan end after publication is
pixel-exact. Later publications are also retained. The first history event report
was empty because the replay queue consumed its caller's array. This did not
change the rendered command data. The queue now copies that array, pinned by a
regression test. `publication-events.json` was independently recovered from every
SHA256-verified immutable packet; the original `history.json` is preserved.

All 433 packets were acknowledged, ending with zero queued packets. Peak retained
capture data was 126,963,224 bytes under 128 MiB. Total charged writes were 858,869,957
bytes under 1 GiB, including report writes; the initial source archive alone was
charged 763,179,580 bytes including conservative static charge. One compression
worker drains its own ordered queue without main-thread round trips, and every
transferred byte remains charged until disk acknowledgment. No history was dropped
or cap enlarged. Browser page errors were empty.

The full spool and full-resolution PNGs remain locally at
`../02a-spool-corrected-tour/`; only compact evidence and hashes are committed.
The persisted archive supports offline replay without repeating source preparation.
This checkpoint proves bounded representative motion and resource fidelity to the
corrected source, while the four zoom pixels keep exact image admission open.
It does not complete all 02a/backend comparison or establish performance eligibility.
