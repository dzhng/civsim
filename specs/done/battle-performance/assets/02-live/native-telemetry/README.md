# Native timestamp correlation control

A real Chrome hardware WebGPU probe on Apple metal-3 encoded a compute pass and
render pass in separate submissions. The event identifies final scene submission2;
the measurement copy advances the queue count separately. Both stage timestamps
are nonzero. A deliberately invalid subsequent command yields an incomplete event
with null aggregate time, despite readable retained query values. No uncaptured
GPU errors occurred. This is a correlation control, not a renderer speed result.

The initial browser attempt lost its execution context during Vite navigation;
its browser closed, and a fixed retry completed. No timing result from that first
attempt is retained as evidence. Eight CPU tests cover correlation, asynchronous
readback saturation, cancelled/unsubmitted work, external timestamp ownership,
unsupported timers, outside-encoded commands and originating validation failure.
Full web typechecking additionally exercises the observer through all scene scopes.

Complete Menu instrumentation and measured instrumentation overhead are still
required before comparing renderer performance.
