# Directional procedural face probes

Both probes keep source geometry, planting, palette, water and environment fixed.
The current material is retained: neither probe makes a material regional gain.

Long vertical anisotropy created curtain-like streaks and near-view woven scratches;
fresh reviewer rock_direction_eyes preferred before. The transverse probe shortened
marks and preserved broad normal response while fine detail faded. Fresh reviewer
rock_transverse_eyes found it slightly less wrong close up, but mostly smoother at
regional distance and not a material improvement in geological readability. Far
views lost identifiable detail. No static aliasing was demonstrated.

Both implementation changes are removed. Before/candidate screenshots and failed
strict reports remain as exploration evidence; no baselines were updated. Equivalent
campaign/battle inputs continued to match exactly, semantic authored tint behavior
and source geometry stayed unchanged, GPU validation stayed clean, and terrain-water
remained exact with matching[76,134,151]color. Typecheck passed.

The next material solution must preserve readable, broken intermediate-scale rock
structure at regional framing. More anisotropy or darker broad noise alone repeats
these failures. Whole landscape still needs distinct material colors and richer
vegetation as well as the separate geometry work.
