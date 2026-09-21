# Crowd publication and replacement

Worker abf5f002 is integrated as ddba56f0. Root corrected three lifecycle cases:
GPU rejection after carried-pose upload, admitted empty crowds, and disposal while
staging awaits. Independent worker review found the first two; root found the third.
Independent fix review found no further actionable regression. Root29 focused web
and28 live tests pass, along with full web TypeScript. The review independently
ran39 scene/live tests. No existing threshold or golden was reblessed.

The raw Menu build uses the published public atlas without a catalog override.
All41 files preserve the verified offline bytes. Hardware Chrome at1440×900 CSS,
DPR2 loads15560 soldiers; reload succeeds at the same tick, a missing atlas and
an actual GPU validation error after pose encoding retain the installed crowd,
and disposal during that admission rejects pending/future reloads. Final tracked
buffers/textures and logical bytes are zero. No browser errors. These are
correctness controls, not performance measurements.

Initial probes are retained: the first injected error was a synchronous RangeError,
not GPU validation; its early disposal sample still showed pending cleanup. The
corrected injected GPU error uses invalid usage and destroys the probe's own buffer.
An intermediate run injected at image admission; the final run waits until the
carried-pose encoder exists. An early screenshot preceded full startup. The final
run waits for game readiness and frozen reuse before capturing.

The final before/after reload frames differ (885375pixels, max222/255); this is
not an image-equivalence pass. The frontend's existing catalog replacement resets
ActionTimeline, and the admitted phase changes from0.0055555556 to0 at the same tick.
The existing default-renderer scene explicitly requires this reset. Staging carries
the old pose until commit; the next frontend submission starts the new catalog's
timeline. Pixel differences are not all causally classified. No shadow, motion,
mounted/dead or final crowd beauty acceptance is claimed here.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| nativeSceneLifecycle: disposal while admission waits | Waited in caller callback before upload; staged upload count0 | Waits on GPU error-scope completion after upload; staged upload count1, disposal once, replacement rejects | The commit point now validates actual GPU staging before swap; disposal contract retained. moved |

Three new regressions were added (GPU rejection, empty crowd, facade disposal).
They failed before the root fixes and pass after them; no prior assertions were
relaxed. Other touched fake methods model GPU admission and uploaded readiness.
No unit stats, simulation mechanics or test goldens changed.
