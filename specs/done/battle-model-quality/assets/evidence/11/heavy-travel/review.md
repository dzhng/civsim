# Prescribed world-travel review

This fixture reviews the existing combined heavy candidate moving over the
production ground. It does not change meshes, clips, gameplay speed, presentation
metadata or production admission. The source is the root assembly at `ab60e67b`;
future garment/hand integration must recapture against the new assembly.

The existing heavy-kit scene owns the added evidence and keeps its original
sheets. Its final scene hook directly submits manual candidate instances through
the production world. The action replay remains unavailable for manual-only
assets. Absolute time independently determines clip phase and forward position,
so revisiting a time is exact and crossing a clip boundary cannot reset travel.

The fixture prescribes 1.7 m/s walking and 3.23 m/s running, following the
[pace rationale](../heavy-run/review.md#pace-rationale). It is not an observation
of simulation travel under terrain, stamina or formation constraints. Side and
oblique cameras stay fixed while the soldier completes two cycles. Captures
sample every 50 ms; GIF frame delays preserve that timing. The GIF's final jump
back to the starting position is a review-loop reset, not a locomotion event.

Run on this worktree's verified Vite server:

```sh
SNAP=travel- VERIFY_GPU=1 VERIFY_URL=http://127.0.0.1:5186 node web/scene.mjs heavy-kit
```

The harness without a filter includes all original sheets and travel frames. An unrelated
snapshot selection never sets up travel. Every selected frame passes through
the existing snapshot primitive and has a freshly rendered exact-repeat check;
review GIFs and submitted-state telemetry are emitted under
`throwaway/heavy-travel/`. No existing baseline is rewritten or blessed.

## Verification record

## Rejected production-direction smoke

The bounded capture rendered twelve selected first/middle/last frames, covering
both clips and bearings. Numerical prescribed-distance, actual clip submission,
same-time rendering and seek-away/return checks passed with no page errors.
Those passing checks do not accept the motion: direct inspection of all twelve
frames shows the soldier travelling backward relative to his visible face and
toes. For example, compare [walk start](rejected-forward/travel-walk-side-00.png)
with [walk end](rejected-forward/travel-walk-side-35.png). The full smoke log,
submitted states and all rejected PNGs remain in [rejected-forward](rejected-forward/).
Some intermediate captions also have missing text, so those frames do not
establish final presentation quality.

The fixture moves along the instance's existing facing, as production does.
The authoring source instead faces negative Y: toe selection takes minimum Y,
forward arm poses point negative Y and support travel increases Y relative to
the root in `blender-heavy-motion.py`. The common glTF-to-engine basis preserves
this Blender direction. Production rotates native geometry by facing minus
π/2; the default π/2 instance therefore leaves this candidate facing opposite
its prescribed world travel.

Root owns the next correction after current source integration: align the
whole exported candidate with production forward, transforming geometry, rig,
binds and clips together. Do not reverse fixture travel or add a renderer
special case to conceal the mismatch. Repeat the smoke, then capture complete
timed sequences and perform fresh visual review. The full 136-frame capture
and GIF generation were deliberately not run after this finding. No new
regression baseline is committed or accepted; the smoke PNGs are archived red
evidence. No locomotion or model-quality claim is verified by this pass.

The frozen heavy-kit `.blend` SHA256 is
`30938a0b9e5f55e790c6a57bd92c651f5ca6add250126f67767cb6b34a8157ec`;
served tier-zero GLB SHA256 is
`17410d045549c86fec783a3065b22367c5f6d1ef16e37104d064d130fabccdc9`.

The absolute-time wrap/reseek test passes, including unchanged source instances.
The original twelve snapshot names are preserved verbatim. Typecheck passes.
The independent CLI review was attempted; the installed CLI rejects its
configured model as requiring a newer version. No upgrade or model override
was performed. Root's source review caught a callback-arity issue in selection
and requested a bounded browser wait; both are corrected. The direction check
uses vector distance and projection rather than hardcoding one world axis.
The added static-selection test proves unrelated requests never access the
travel page. Existing test behavior and thresholds are unchanged. Shape/diff/docs
review retains one final same-page scene hook and no production runtime change.
Fresh independent visual review remains root-owned before any acceptance.

The [whole-export probe](forward-export-probe.md) establishes a sampled
shape-preserving coordinate correction. Canonical asset rebuild and production
recapture remain outstanding; the probe does not resolve this rejected smoke.
