# Source default and frozen control

The unchanged `battle-renderer-default` scenario passes full crowd, terrain,
visible content, frozen payload reuse, same-camera tick advancement, same-tick
asset reload and absence of page errors after presentation integration. The
combined default-world assertion remains red: the recorded default view has zero
impostor instances. This previously recorded expectation is not repinned or
waived. The full report retains all diagnostic fields and the failing check.

Run against the fixed primary checkout f4287b80 through the ordinary source Vite
entry on Chrome hardware GPU. This is functional evidence, not timing or visual
acceptance. No files in the served checkout changed while its browser ran.
