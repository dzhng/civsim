| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `publishes ordered diagnostic pass details only when requested, without changing aggregate stages` in `apps/battle-perf-lab/tests/nativeGpuTelemetry.test.ts` | Opt-in pass entries contained kind, label and2ms duration; default omitted details. | The same entries additionally preserve exact ranges0–2000000ns and2000000–4000000ns as decimal strings; durations/default payload unchanged. | Raw timestamp ranges are needed to prove overlap without losing bigint precision. **moved** |

No simulation stats, numerical image thresholds or performance thresholds were repinned.
