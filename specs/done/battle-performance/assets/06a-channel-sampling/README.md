# Direct authored-channel sampling

Channel sampling now writes into the final Float64 pose rather than slicing two
keyframes and allocating an interpolation result for every animated component.
Orphaned standalone wrappers are removed; quaternion arithmetic has the same
owner as blending. Tests exercise the production packed-pose sampler, including
nonzero rotation/scale offsets and untouched neighboring components. Authored key selection, STEP boundaries, bind
components, empty channels and endpoint values are unchanged.

All23,798 exact-key and between-key samples across20 shipped appearances match
the previous sampler exactly, including result-mutation checks. Rig hashes and
case counts are in authored.json. The focused suites pass84 tests and web
TypeScript passes. Existing assertions and gameplay values were unchanged; three
new channel/layout/ownership tests were added. Independent review found dead
wrappers and an offset coverage gap; both were resolved before committing.

The Node24/V8 controlled probe samples the same237,980 authored poses per arm
with IO/comparison/parsing excluded. Before/after/after/before took
754/316/326/763ms, about2.3× primitive throughput. These are isolated CPU values,
not live FPS or a complete observation-history comparison. Retained identical
live observations are the next preparation gate; the five-minute benchmark and
visual/motion acceptance remain open.
