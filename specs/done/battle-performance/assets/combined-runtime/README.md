# Combined runtime checkpoint

The full hardware Menu benchmark at `e30d074c` includes the worker, shared images,
exact animation endpoint optimization, progressive grass, version-gated grass
uploads, view-fitted shadows and the shadow depth guard. [Summary](summary.json)
and [raw recording](full-run.json.gz) preserve the result. All eleven functional
checks pass, including the canonical contact state and all camera phases.

This is not performance acceptance: average cadence is 19.10 FPS, the 1% low is
6.57 FPS, and 150.83 simulated seconds elapse during 300.10 real seconds. Neither
smooth rendering nor real-time simulation is established. Do not attribute the
failure to one component or compare it causally with earlier runs.

The [host observation](host-observation.json) was taken by a separate process.
It incorrectly classifies the benchmark process and its descendants as competing
work. Its maximum other-process percentage cannot establish external contention;
the shared WindowServer remains unattributed, and there are no repeated matched
pairs. Future observations must exclude the actual trial process tree.

The old immutable comparison builds remain research controls. The new production
shadow fit and scheduling differ from those controls: refresh common workload
policies before selecting a backend. Integration enables combined investigation;
it does not select Three or waive remaining migration/performance gates.
