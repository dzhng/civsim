# Submitted draw observation

Worker02a3dc31 is integratedbbb9fde4. The existing telemetry owner counts commands
in buffers actually offered to queue.submit, including each bundle execution.
Unsubmitted encoders are a separate account; incomplete observation reports null
with a reason. Timing-disabled and unsupported devices retain draw observation
without query/readback work. This is not proof of successful GPU execution.

Root's integrated37 telemetry tests and independent review pass. CPU doubles
cover direct/indirect draws, bundles, failed/repeated submissions, window boundaries
and bounded retention. [The presented-frame pass](presented-frame/README.md) now
wires the actual observation to the successfully presented frame and supplies
independent TypeGPU hardware tallies in both timestamp modes. No overhead/FPS
claim is made; final performance still measures instrumentation cost.
