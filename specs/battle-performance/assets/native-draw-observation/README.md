# Submitted draw observation

Worker02a3dc31 is integratedbbb9fde4. The existing telemetry owner counts commands
in buffers actually offered to queue.submit, including each bundle execution.
Unsubmitted encoders are a separate account; incomplete observation reports null
with a reason. Timing-disabled and unsupported devices retain draw observation
without query/readback work. This is not proof of successful GPU execution.

Root's integrated37 telemetry tests and independent review pass. CPU doubles
cover direct/indirect draws, bundles, failed/repeated submissions, window boundaries
and bounded retention. Browser validation is still required. The next pass joins
this observation to the exact validated presented frame; drawCalls remains null
until that consumer is wired. No hardware or overhead claim is made here.

After both integrations, root118 TypeGPU tests,57 facade tests and the complete web
TypeScript check pass. Presented-frame hardware wiring remains the next pass.
