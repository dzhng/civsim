# Native presentation admission diagnostic

The unchanged raw renderer at runtime commit 58b2a9bd was observed through its
loaded prototype in the native Vite game entry. The generated seed-7 battle
remained paused at tick 1. Thirty warm presentations preceded 120 camera-sweep
presentations at 1440×900 CSS and device scale 2. All frames submitted, both
prototype hooks were reached, and the browser reported no page errors.

The scratch observer returns the original present/admitted/submit Promises.
It records synchronous call return, operation settlement and overall admission
settlement without adding a renderer wait. Seven outer admissions and one nested
submit record occur per frame. Nested durations overlap and cannot be added.
These are instrumented wall times on a shared host, not GPU duration, OS CPU time,
quiet FPS rankings, or measured speedup. Development compilation is warmed but
this is not a fixed-production-build acceptance run.

Median crowd invocation is 16.81 ms. Reconcile and readout operations are small,
but their post-operation admission tails reach 17.42 and 14.31 ms at p95.
The next controlled candidate may consolidate routine validation waits while
retaining resource replacement admission, cancellation/ownership and successful
receipts only after validation. Measure the result; fewer calls alone prove no win.

Two earlier attempts are invalid: the scratch observer tried to structured-clone
a camera containing functions, stopping presentation before its counters advanced.
The corrected observer records evaluated camera values. Neither failed attempt
contributes timings. The scratch script and full logs remain under `throwaway/`;
the compressed output retains the successful raw observations.
