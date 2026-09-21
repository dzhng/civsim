# Sample terrain once while building the crowd

Normal instance building already assigns each soldier's elevation from the
immutable terrain field. It now also accumulates the height range in that pass,
so the world can report the same seating facts without sampling the field again.
Explicit instance submissions still validate their elevations eagerly. Both paths
use the same private GPU submission method; rendering inputs are unchanged.

The [regression](seating-built-red.log) failed on the old double sampling. The
[focused tests](seating-built-green.log) pass for normal builds, explicit borrowed
mutation, both observation orders around static reset, empty instances and missing
terrain. TypeScript checking and independent review pass. The earlier deferred
prototype was rejected because it could inspect values mutated after submission;
no deferred scan or retained diagnostic input was added.

| Actual hardware production camera control | Before | After |
| --- | ---: | ---: |
| Samples per soldier per submitted frame | 2 | 1 |
| Soldiers | 15,560 | 15,560 |
| Framebuffer | 2880×1800 | 2880×1800 |
| Seating matches | true | true |
| Height span | 3.902 | 3.902 |

[Before](seating-baseline-hardware.json) and [after](seating-built-hardware.json)
wrap the real sampler in the actual battle route during camera motion on Chrome
hardware WebGPU. All samples equal the declared frame count times the soldier
count times the stated ratio; neither run has page errors. The different number
of submitted frames is not a cadence comparison. These are numerical work-count
controls, not visual or FPS acceptance, and no screenshot baseline was changed.
