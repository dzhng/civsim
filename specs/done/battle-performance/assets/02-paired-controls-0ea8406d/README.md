# Four-mesh production controls and first live round

All eight enabled/disabled builds pin runtime0ea8406d and identical emitted WASM.
Compressed manifests retain artifact/shared-asset hashes; runnable builds and
original trial exports remain under `throwaway/matched-current-0ea8406d`.
This round uses enabled instrumentation, in reverse order to the preceding
runtime's exploratory round. It is one round, not a counterbalanced ranking.

Each backend completed the actual five-minute Menu tour at1440×900CSS/DPR2,
starting at the canonical contact state, with live simulation, normal graphics,
HUD and audio. All functional checks pass; all quiet-host verdicts are false.
No builds/tests or other task-owned GPU jobs overlapped these trials. Read-only
Claude analysis and preparation of an unexecuted scratch probe occurred alongside
the round; retained host observations include all other processes.

| Backend / run order | Average FPS | 1% low FPS | Simulated seconds in300 real seconds |
| --- | ---: | ---: | ---: |
| vgpu /0 |11.65|4.98|172.73|
| TypeGPU /1 |17.24|5.10|210.03|
| Raw /2 |17.90|4.72|224.47|
| Three /3 |22.75|7.05|139.77|

No run meets final cadence or simulation-throughput acceptance. Different
simulation progress also means different later rendered states, so these numbers
cannot rank renderers or establish causal improvement over an older runtime.
The full exports, checks, provenance and host observations are compressed in each
backend directory. `summary.json` preserves the benchmark's own FPS formulas and
nearest-rank p95 component summaries; GPU stages overlap and must not be summed.

A useful unresolved attribution boundary is native asynchronous presentation:
median `renderAwaitMs` is70.35/40.59/34.81ms (vgpu/TypeGPU/raw), versus0 for Three.
This is elapsed time outside the caller's synchronous instrumentation, **not a
pure idle-wait measurement**: CPU work after an async callee yields may also be
included. Native presentation awaits an upload/preparation validation batch before
submission and submission validation afterward. Measure those boundaries and
actual main-thread CPU activity before changing the error contract or assigning
this cost to a library. The earlier admission batching preserved those barriers;
it did not prove they are free under dense live work.
