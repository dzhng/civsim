# Shared native recorded replay

The native backends consume one semantic command runner and one bounded packet/resource decoder. Scene creation, command encoder submission and GPU diagnostics remain backend-owned. Actual TypeGPU and vgpu scenes are used; neither delegates drawing to raw WebGPU. Prepared catalog/atlas assets and the existing corrected archive are borrowed without rebaking or recapture.

Each asynchronous upload completes before the next recorded command. Each actual presentation submits independently, including render-only repeats and settlement boundaries. The selected packet's final presentation requests its bitmap synchronously after submission and before awaiting validation, because the canvas may be discarded across an animation-frame boundary. No extra render is inserted. Other presentations do not retain images.

Actual active record prefixes and indirect command buffers are read through public underlying GPU buffer handles. This bounded diagnostic avoids library readback APIs that expand full-capacity buffers into per-record objects; it is outside performance measurement. The ordinary renderer continues to own all resources and draw submissions. Terrain identity serialization is shared across the three owned terrain recipes.

The entry configuration lives at [src/replay.vite.config.mts](../../../../../apps/battle-perf-lab/src/replay.vite.config.mts); the existing CLI selects `raw`, `typegpu` or `vgpu` after the archive path. Initialization and archive limits remain unchanged. Each run requires a fresh output directory. Source Three replay sequencing is unchanged.

CPU checkpoint: 21 focused tests and a narrow all-backend TypeScript check pass. The coordinated build transforms 460 modules; its 16 emitted modules contain one publication provider reachable from spool, control and all three scene entries. The bundle test also executes the shared control/provider boundary. Two additional tests verify asynchronous upload sequencing and final snapshot-before-validation ordering. Existing source tests and image gates are not repinned. Actual cross-backend archive hardware replay is pending; the earlier raw report remains strict diagnostic red.
