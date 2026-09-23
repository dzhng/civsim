# Ungraded UI first output proof — rejected

The prototype moved screen labels and markers to a second scene, disabled tone
mapping/output color conversion for that draw, and loaded the canvas without
clearing. CPU state tests passed, but the actual default-MSAA pixel control
rejects the composition.

Opaque swatches reach their exact authored bytes, including campaign ink
248/244/237 (graded control 202/200/198). Both paths report 9 draws and the
candidate repeats exactly. Nevertheless, all 681116 compared non-UI pixels
change (maximum channel delta87): the world is replaced by the UI attachment.

Independent source review explains the failure. Three's implicit world output
uses a single-sample canvas. Turning off both output transformations changes
`currentSamples` to4, so the UI loads a different multisample buffer and resolves
it over the world. `autoClear=false` does not make those two attachments the
same. The correction must retain world MSAA through a public composition seam;
no private sample field, global MSAA disable or inverse tone-map compensation.

An initial plain Camera also failed because Three needs updateProjectionMatrix;
the proof now uses OrthographicCamera. The two modes run sequentially because
concurrent software-rendered pages starved the second readiness check. These are
proof/runtime corrections, not waived acceptance thresholds. No production code
or canonical baseline from this candidate is adopted. The next control also
needs translucent UI over the captured graded background, not just opaque ink.
