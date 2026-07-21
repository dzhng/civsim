# Post-main fresh-eyes visual review — REJECT

Date: 2026-07-21. The reviewer was unprimed and received only the committed
`full-close`, `full-rts`, `full-topdown`, `road-edge`, and `dirt-edge` images.

## Verdict

**REJECT.** The ground does not yet read cohesively across battle-camera scales.

## Findings, highest priority first

1. Nearby blades read as oversized folded strips rather than grass. Their repeated
   bends, blunt ends, and sparse clumps make their scale conspicuous.
2. The close and RTS frames expose distance/LOD bands: dense blades change abruptly
   into stipple and then into a nearly featureless plane.
3. The top-down frame still reads as airbrushed green/brown camouflage with some
   polygonal or halo-like patch boundaries.
4. Road and dirt transitions look painted onto the terrain. The road is a uniform
   gray slab; the dirt edge carries a broad green fringe and visible dirt banding.
5. Repeated dark curved marks dominate the RTS turf carpet and risk shimmer or
   moire in motion.
6. Blades have weak ground contact, with dark blunt tips and little root/shadow/soil
   integration near material boundaries.
7. Foreground contrast is harsh while middle/far ground becomes washed out, so the
   distance owners do not read as one continuous surface.

## Consequence

Deterministic snapshots and scalar edge-width checks remain green, but they do not
establish the binding aesthetic claim. This review supersedes the archived visual
acceptance verdict until the listed defects are corrected and a new unprimed review
accepts the result.
