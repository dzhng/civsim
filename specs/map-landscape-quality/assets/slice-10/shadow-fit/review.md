# Shadow-fit review

Independent review caught a P2 in the first candidate: clipping the view rectangle
to the world domain changed shadow texel size during fixed-zoom boundary pans.
The final helper fits the complete canonical view footprint, then snaps the sun
and its target together in light space. A boundary-crossing CPU regression checks
constant scale and integer-texel movement of a fixed world point. The original
constant-rectangle test remains. All 12 shadow/camera tests, the complete 516-test web suite and typecheck pass.
A second independent review reports no actionable regressions in view coverage,
panning or preservation of battle fitting. It performed no GPU verification.

Earlier fresh still critique accepts improved city contact at Perge/Attalea,
Cyrene/Apollonia and Scodra, with the small fixture unchanged. Roof bands remain
visible on close inspection but do not obscure faces or reading. Five interior-pan
samples keep shadows attached; start and exact-return frames differ by zero pixels.
The 180-frame hardware run reports 16.67ms p95/max on Apple Metal3, with no errors.
Discrete images do not establish absence of between-frame shimmer. Final boundary-pan and matched capture results are recorded below.


Final matched control uses the merged entity-frame implementation on both sides.
Its small changes from the old snapshots reproduce without the shadow candidate;
they are banner/entity integration, not shadow improvement. The comparison JSON
separately measures the fitting change. All city picking, removal/reinsertion and
GPU checks pass. Fresh final review accepts improved attached city shadows and
sampled edge-pan continuity. Regular roof bands remain visible and are a retained
quality limitation, not an artifact-free roof claim. No blocker was found for
this bounded fitting change. The actual edge pan at x=2260/y=1000/zoom=3 returns
exactly (0 changed pixels), with 16.67ms p95/max and no errors on Apple Metal3.
The complete landscape/environment slice remains open.

All four accepted city snapshots repeat with zero differing pixels after the final fit.
