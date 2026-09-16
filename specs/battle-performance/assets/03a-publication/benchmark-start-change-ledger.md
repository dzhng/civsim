# Canonical benchmark start regression

The full worker run exposed a gap between preparation completing and the contact
frame becoming ready: live ticking resumed during that gap. The saved rejected
run recorded a start tick of 9011 while its identity hash described tick 9000.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `benchmarkRun.test.ts`: rejects preparation past canonical start (new regression) | Tick 7 started a scenario declaring tick 6 | The same input fails with no timed start and no elapsed recording | The start state must match the declared workload; the new regression failed before the fix. **your-regression** |
| `battle-benchmark-complete.mjs`: timing starts at canonical tick (new check) | Canonical hash was checked, but tick drift between identity capture and recording was untested | Actual timed start must equal the scenario’s start tick | A matching stored hash alone cannot prove that timing began at that state. **your-regression** |

The production fix keeps the existing authority hold through preparation and
contact-frame settling, then releases it when recording starts. It adds no
second simulation clock, replay path or compatibility mode. The previous full
run remains rejected; passing lifecycle tests does not convert it into valid
performance evidence.
