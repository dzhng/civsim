# Fixed held-state builds

Sixteen builds on8643cf05 cover Three/raw/TypeGPU/vgpu, held ticks9000/12000,
and instrumentation enabled/disabled. Every build shares the same production
WASM e9f4f080… and shared-asset digest. Source disabled builds explicitly install
the same held-authority plugin as source enabled builds; native modes do likewise.
The summary records these identities. This is build provenance, not performance.

Immutable build directories and full manifests live at
`throwaway/held-{9000,12000}-8643cf05/{enabled,disabled}`. The driver and logs live
in `throwaway/held-fixed`. Do not overwrite these controls when later simulation
optimizations land. Browser correctness must precede timed conditional ranking.
