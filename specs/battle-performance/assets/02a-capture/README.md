# Provisional replay evidence

This window comes from the actual menu benchmark in its running phase, using
`generated-seven-heavy-combat` v1 / `contact-9000-v2`, CSS 1440×900 at DPR 2
(2880×1800 framebuffer). It records one complete presented submission at tick
9010: 15,560 soldiers, 40 standards and 5,235 attack-triangle vertices. Static
inputs, typed frame bytes, shared immutable frozen-pose definitions and the source
PNG occupy 16,796,629 bytes. Loaded appearance identity covers actual encoded
content (333,170,827 bytes), processed one appearance at a time; the largest is
17,249,538 bytes. Capture copies/readback/hashing make this unsuitable for timing.

The source checkout was `37fc0a536f78f2ec0ca78fcb92a0c51448566ed7` plus this
capture implementation. Archive hashes cover the static inputs, settings, frame,
pose dictionary, loaded appearance content and boundary PNG. The compressed
archive and the source PNG are separate artifacts. Browser errors were empty.

The capture initially made only 18 then 42 of 367 pose hashes in two ten-second
samples while the benchmark continued. Calling the public benchmark cancel API
then allowed hashes, storage and replay to finish. The lab adapter now ends its
explicitly partial benchmark immediately after requesting the boundary PNG.

This is not a parity pass. Source/replay crowd LOD histograms differ because the
production crowd retains prior levels and applies hysteresis; a cold world has no
such history. The shadow histogram agrees. Grass record hashes/counts and the
active ring center agree, while the reported tier triangles differ. Those numbers
are a sampled CPU mirror refreshed on record/transition changes, not current
indirect GPU counts, so they cannot establish exact submitted-work parity. The
images also differ visibly in grass flecks and dirt coverage. The next parity
step must preserve relevant pre-window presentation history and verify the
remaining image difference; no backend may be ranked against this fixture yet.

The isolated canvas probe validates source-image snapshot semantics on this Chrome
WebGPU implementation: a PNG requested immediately after submitting green remains
green even after red is submitted. A later PNG reads red. There is no GPU-completion
wait before requesting the first PNG. This establishes capture timing only, not
battle image parity.
