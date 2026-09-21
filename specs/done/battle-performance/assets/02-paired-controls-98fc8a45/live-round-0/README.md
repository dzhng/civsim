# First live round at runtime 98fc8a45

All four fixed enabled builds complete the actual five-minute Menu benchmark,
including the canonical starting state, every camera phase, real submissions and
full export. Each starts with 15,560 soldiers at 1440×900 CSS / DPR 2, with default
single shadows, grass, far grass, bloom and audio. This is one sequential round,
not a repeated or counterbalanced ranking. All quiet-host verdicts remain false:
shared system load is unattributable and other processes were active. No builds
or tests from this task ran during the round.

| Backend | Average FPS | 1% low FPS | Simulated seconds in 300 real seconds |
| --- | ---: | ---: | ---: |
| Three | 18.73 | 6.24 | 131.37 |
| Raw | 17.17 | 7.55 | 170.30 |
| TypeGPU | 14.33 | 6.38 | 162.87 |
| vgpu | 10.15 | 4.89 | 182.00 |

The different simulation progress means later rendered battle states also differ;
per-phase GPU differences cannot be attributed solely to rendering architecture.
These measurements neither establish a winner nor meet final live acceptance.
Do not compare them causally to older runtime/host samples.

The Three run records CPU render p95 of 34.95 ms and observed GPU interval-union
median/p95 of 48.56/63.82 ms. Its main drawing pass dominates the GPU observation
(44.08/58.51 ms), with shadow drawing at 3.08/3.76 ms. Stages overlap: do not add
those durations. This identifies a useful diagnostic target, not a causal cost
allocation or a physical GPU busy-time claim. Next isolate grass beauty work with
matched feature controls, and inspect the soldier detail policy before spending
more time on small CPU changes. Disabled features cannot pass product acceptance.

Raw exports, host observations, provenance and functional checks are retained for
every backend. `summary.json` uses the exported benchmark statistics plus per-run
nearest-rank p95 and median component observations. The statistical unit for a
future ranking is an independent run, not each correlated frame.
