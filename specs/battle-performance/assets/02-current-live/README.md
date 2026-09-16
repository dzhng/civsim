# Current fixed-build live controls

All four enabled builds use commit 58b2a9bd, the same release WASM and the same
render settings. Emitted WASM files were checked against the archived release
binary. The compressed manifest pins each emitted build, configuration, shared
asset and dependency lock digest. Built directories remain under the ignored
`throwaway/matched-current-58b2a9bd` root; older controls were not changed.

Three trial 0 completes all functional checks. It records 12.16 FPS average,
3.42 FPS 1% low and 93.47 simulated seconds during 300.02 real seconds. **This is not
ranking or regression evidence:** every host observation was non-quiet, with
Diablo IV using 97–119% CPU in early samples and high shared WindowServer activity.
The unmodified trial, host, scene, report and Menu export are retained as gzip
files; decompressing reproduces their original recorded bytes.

Native functional trials follow serially. No backend has been selected. Quiet
repeated runs, matched recorded inputs, visual parity and incremental
instrumentation controls remain necessary before attributing a renderer win.
