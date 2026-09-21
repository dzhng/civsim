# Validation waits — not the leading typical cost

A reporting-only build timestamps the nonempty GPU admission batch barrier and
the submission validation await. It changes no validation ordering, shader,
resource or gameplay behavior. This is one diagnostic run, not acceptance or a
causal speed comparison. The owned shader review was suspended without children
and resumed in finally; no owned build/test job overlapped measurement.

The same pinned30k static and camera-motion route retains tick30, state hash
14739215347954801209 and30,560 soldiers. No browser errors or trace overflow.
The trace is bounded at30,000 events; overflow is explicit. Only waits wholly
inside each segment are summarized, so boundary counts can differ from frame count.

| Segment | CPU preparation median | Batch wait median / p95 | Submit wait median / p95 |
| --- | ---: | ---: | ---: |
| Wide | 24.04ms | 0.42 /1.41ms | 0.60 /1.24ms |
| Moving | 15.14ms | 0.26 /0.99ms | 0.52 /0.91ms |

Occasional maximum waits reach6.20/9.00ms wide and3.30/4.66ms moving. Wall waits
include scheduling and are not pure GPU execution time. Do not add these medians
to overlapping renderAwait/CPU metrics. In particular, renderAwait medians22.63ms
and14.44ms include asynchronous CPU preparation; they are not22/14ms of GPU idle
waiting. [Summary](summary.json) and compressed full report retain the observations.

## Performance audit disposition

Trigger: each live presentation validates upload work before submitting and
validates submission before recording success. Owners are gpuAdmission and the
native facade. Their recovery/failed-publication contract must remain intact.
The captured route performs approximately one nonempty batch barrier and one
submission validation per frame; this is bounded work, not a growing queue or
retry loop. Typical waits are small relative to observed preparation CPU.

Demote validation removal as the next optimization. Tails remain measurable, but
these data do not justify weakening error handling. Prefer removing redundant
crowd construction/copying, where the retained profile identifies substantial CPU
work. Any future validation change needs its own failure/recovery proof and real
camera cadence measurement, not an inference from renderAwait alone.

The in-game benchmark recorder was also traced: it is called from completeFrame
after presentation resolves, not every browser rAF callback. Its per-frame
intervals therefore do not turn the observed30 rendered FPS into60 samples merely
because the browser can issue60 callbacks. This source review adds no code change
or new benchmark acceptance claim.
