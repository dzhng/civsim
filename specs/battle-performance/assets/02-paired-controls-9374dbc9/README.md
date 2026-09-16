# Refreshed fixed controls after native admission scheduling

All eight builds pin runtime commit 9374dbc9, a clean tracked tree, common graphics
settings and the same release WASM. Every emitted WASM file matches the archived
release digest. Shared assets are linked and hash-pinned, not copied. Builds live
under `throwaway/matched-current-9374dbc9/{enabled,disabled}/{three,raw,typegpu,vgpu}`;
commands, logs, manifests and the producer are retained there. Earlier builds and
measurements remain untouched. This checkpoint proves builds and binary identity,
not runtime acceptance or a backend ranking.

Enabled builds provide the normal instrumented comparison. Disabled builds are
paired incremental instrumentation controls: Three removes only the raw timestamp
range callback while retaining its existing query/readback work; native backends
remove their timing observer's query/resolve/readback work while retaining device
features, admission, drawing and submission observation. The disabled group is
therefore not a cross-backend uninstrumented ranking. Compare each backend to its
own enabled counterpart before attributing overhead or choosing a winner.

Use the mode's original manifest and the root render configuration for each trial.
Each new run needs a fresh output directory. Quiet host observations, equal scene
work and repeated controls remain required for final performance attribution.
