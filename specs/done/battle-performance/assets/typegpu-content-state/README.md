# TypeGPU installed content diagnostics

Worker280f5669 integrated asead86de9. Independent review found no actionable
regression. Main combined candidate80/80, facade57/57 and live-test typecheck pass.
The fixed Menu build reports its own TypeGPU/camera3d identity, installed scenery,
terrain/grass and cue state, submitted camera and real depth allocation at three
camera zooms. Resize reports the new physical framebuffer allocation; disposal
clears installed-world reports and releases tracked resources. Existing unavailable
seating/drawCalls measurements remain unavailable rather than fabricated.

Control and candidate screenshots at all three zooms decode identically:
0 changed pixels out of2880×1800. This is a diagnostics-only change; it does not
claim a visual improvement or performance gain.

A separate actual GPU scene replacement raises the input height grid, commits
terrain generation1→2, changes the sampled world height2.9422→4.5422, then reseats,
uploads and draws all15560 soldiers. Inspection identifies terrain generation2,
checks all15560 with zero nonfinite/worst difference, and teardown has0 tracked
textures/buffers. This fixture contains5 scenery instances and no water/vista;
CPU owner tests cover the nonempty water and transparent/opaque vista count cases.
No GPU water-rendering parity claim follows from this fixture.

The facade no longer gates content/identity on a raw-only debug method. World
identity is a declaration beside measurements, not a substitute for them. Shared
terrain/cue types pin the two scene reports at their actual consumer; data comes
from committed owners without rescanning the world.

## Test behavior reconciliation

The converted-world facade test formerly expected null identity/environment/terrain/
cues and corresponding obligations. It now expects TypeGPU identity and the real
owned reports; unowned measurements retain their obligations. This reflects the
implemented capability, not relaxed coverage (**moved**). Raw and disposed/retired
backend expectations remain; failed replacement retains the installed generation.
New owner tests cover no water, nonempty water, both vista lists, and disposal.
No simulation stat, frame-time threshold, image threshold or default renderer changed.
