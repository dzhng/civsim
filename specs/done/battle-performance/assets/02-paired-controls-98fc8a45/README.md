# Fixed controls including retained crowd packing

All eight production builds pin clean runtime 98fc8a45, one graphics configuration,
shared hash-pinned assets and identical emitted WASM. They include billboard-camera
caching and retained native crowd packing. The source artifacts, commands and logs
remain under `throwaway/matched-current-98fc8a45`; earlier controls remain unchanged.
These manifests prove provenance, not speed or visual acceptance.

Enabled/disabled modes measure each backend's incremental observer cost. The
native disabled mode removes queries and readbacks; Three's disabled mode removes
its additional range callback, retaining existing timing. Do not rank the disabled
backends as equivalent uninstrumented implementations. A comparison must retain
first-traversal work, matched graphics/content, run order and host observations.

[The first full live round](live-round-0/README.md) passes functional checks in all
four backends. Every quiet-host verdict remains false; no winner is established.
The main drawing pass is the next attribution target.

Before the four-mesh candidate cutover, all soldier files used by these builds
were frozen into a copy-on-write snapshot. [The byte inventory](frozen-soldiers.json)
proves all733 files match the original public tree; served soldier symlinks now
point to that snapshot. Emitted code and WASM are untouched. Other historical
links in this task's throwaway that referenced the same public tree were also
redirected to the identical bytes, as recorded in the inventory. New production
catalogs must not mutate this frozen snapshot.
