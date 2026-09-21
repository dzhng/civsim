# Grass reception candidate: not adopted

Candidate043792dc changes only raw grass direct sunlight to receive the existing
sun map; off mode and all grass geometry, wind, density, indirect and emissive
light remain unchanged. Control7594fc2c and candidate both rendered single,
off and High at tick30/hash15927906182668164452, CSS1440×900 at DPR2, without
page errors. Captures use shared snapCheck in a new diagnostic directory.

In the battlefield crop, mean absolute RGB differences are0.0256 code values
for single and0.0292 for High. Off is pixel-exact. These averages describe the
crop; they are not a per-shadow contrast metric. The included foreground crops
were independently inspected without identifying the candidate: the reviewer
found both pairs effectively tied, no confident improvement in foot contact or
cast-shadow readability, and no obvious new clipping or detached shadows.

The candidate is **not adopted**: it did not visibly solve the reported problem.
GPU cost was not measured after the visual gate failed; this is neither a cost
regression claim nor evidence that sampling is free. The branch and comparison
artifacts preserve the experiment. Default directional grounding remains open.
