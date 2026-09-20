# First TypeGPU conversions

Typed colour functions are integrated at7640784b with comparator correction3818e8b4.
The actual soldier, impostor, overlay and standards TypeGPU consumers use typed
bodies for linear conversion/faction accent. Their remaining surface functions
are still WGSL strings. Independent review found no regressions; root separately
found and fixed equal-NaN acceptance and failed-map readback cleanup.

Root hardware Chrome checks on Apple Metal show306 compared words bit-identical,
zero nonfinite values, no browser warnings/errors. Injecting equal NaNs into both
readbacks gives nonfinite2 and passedfalse. The reports and runner are retained.
This is a finite numerical component check, not full-scene visual or performance
acceptance. Full consumer pipelines have not yet been reverified on hardware.

Frame depth integration4feb835c uses the canonical attachment policy and reports
installed typed texture properties. Independent review found no regressions. All
26 tests in the combined candidate suite pass. Frame hardware checks and wiring
its depthStats into scene/facade consumers remain open; the method alone does
not fulfill the live diagnostic contract.

Choices: retain the raw WGSL as an actual reference/other-backend consumer; typed
body equivalence is independently testable. Frame stats read resource-owned
properties and destroyed state, avoiding a parallel lifetime flag. Neither pass
changes production renderer selection, framebuffer, quality or gameplay.

Test behavior: the existing TypeGPU suite gains typed shader argument/return
rejection and body/consumer resolution coverage; frame tests now exercise shared
depth policy at1x/4x and truthful size/disposal reporting. No existing threshold
or golden was relaxed. The hardware comparator now rejects matching nonfinite
output that previously could pass its equality/tolerance logic.
