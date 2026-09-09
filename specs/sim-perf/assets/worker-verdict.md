# Worker feasibility verdict: do not proceed under the current frame targets

David revised the measurement-load precondition to below 10 on 2026-09-09.
Performance targets were not changed. The subsequent cadence probe started
at load 6.05 and ended at 5.73. Chrome 153, using the unchanged hardware
flags, produced an empty-page median of 16.7 ms across 300 frame intervals.
The worker matrix independently reproduced that cadence. See
[cadence samples](worker-cadence-under10.json) and
[complete matrix data](worker-matrix-under10.json).

The existing final 15.5k requirements demand a 12 ms median and reject
anything above 14 ms. This harness cannot satisfy them even without game
work. The decision is therefore an **early planning no-go**, not a claim
that a worker cutover was implemented and failed. The read seam, command
seam, JSON handoff and cutover will not be built under this acceptance
contract. The only retained production change is the state-hash export.

The six transport runs did complete: three 20-second worker-on samples per
mode, each paired with an unchanged worker-off renderer window. Every
recorded before/after load stayed below 10. Medians across repeats:

| Metric | Transfer | Shared memory |
|---|---:|---:|
| Worker tick p50 | 16.210 ms | 16.130 ms |
| Ticks per second | 29.999 | 30.023 |
| Main rendering interval p50 | 16.660 ms | 16.670 ms |
| Packing + publication + receiver CPU p50 | 0.085 ms | 0.100 ms |

Both fresh 600-tick worker/direct games returned `ca84560505612d9d`.
These are the original-simulation, commanders-off transport fixtures; they
do not establish developed-combat performance or a live cutover result.

Snapshot age is **not validated**. Adding each context's `timeOrigin` to
its clock produced impossible negative ages, including repeat medians near
minus one millisecond. The cause is not established. Raw values are retained;
they were not clamped, corrected by an assumed offset, or treated as proof
of the latency gate. The CPU-cost sum above is not end-to-end delivery time.
Thus this report makes no full worker/00 acceptance claim. Fixing that
temporary metric cannot resolve the independently demonstrated frame-target
incompatibility, so no further transport instrumentation is warranted now.

Reopening the worker track requires an explicit frame-target or harness
decision and a valid snapshot-age measurement. No threshold was silently
relaxed to keep the prototype. Existing renderer verification is reported
separately; this no-go does not declare that gate passed.
