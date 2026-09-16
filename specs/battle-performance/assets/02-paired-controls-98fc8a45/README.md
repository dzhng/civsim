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
