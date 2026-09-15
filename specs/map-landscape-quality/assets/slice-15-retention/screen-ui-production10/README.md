# Production retirement with screen UI

The ten-cycle production campaign/battle retirement scene retains all62 original
checks and adds20 checks for the new screen phase. All82 pass with no page errors.
The nine built artifacts remain byte-identical across the run, and React Refresh
is absent. The compact report preserves check results, source/build hashes and
memory series; the instrumented scene is retained as review evidence.

After explicit collection, all20 retired worlds and all20 screen phases are gone.
Every one of the ten campaign display targets, textures, copy materials and copy
objects is collected; target/material disposal fires exactly once. Battle has no
screen members or display allocation. Older renderers collect under the original
latest-battle-renderer exception documented in the parent retirement evidence.
The observer retains only scalars and weak references and detaches its temporary
disposal listeners; no new retention exception was required.

Measured user-agent memory spans295,909,883–305,033,236 bytes and ends303,182,994.
Renderer geometry/textures stay33/181; program counts are unavailable (`null`),
not measured zero. This is observed bounded memory across these cycles, not a
new absolute budget or total GPU allocation measurement.

Hardware Chrome was requested, but this run did not sample adapter vendor/model.
That limitation is explicit in the report; another run's Apple Metal observation
cannot substitute for it. This verifies retirement for the tested production UI
build. Future texture adoption and whole-game timing still require their own
checks; none of these results closes the visual-quality gates.
