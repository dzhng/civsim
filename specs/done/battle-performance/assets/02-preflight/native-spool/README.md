# Shared native recorded replay

The native backends consume one semantic command runner and one bounded packet/resource decoder. Scene creation, command encoder submission and GPU diagnostics remain backend-owned. Actual TypeGPU and vgpu scenes are used; neither delegates drawing to raw WebGPU. Prepared catalog/atlas assets and the existing corrected archive are borrowed without rebaking or recapture.

Each asynchronous upload completes before the next recorded command. Each actual presentation submits independently, including render-only repeats and settlement boundaries. The selected packet's final presentation requests its bitmap synchronously after submission and before awaiting validation, because the canvas may be discarded across an animation-frame boundary. No extra render is inserted. Other presentations do not retain images.

Actual active record prefixes and indirect command buffers are read through public underlying GPU buffer handles. This bounded diagnostic avoids library readback APIs that expand full-capacity buffers into per-record objects; it is outside performance measurement. The ordinary renderer continues to own all resources and draw submissions. Terrain identity serialization is shared across the three owned terrain recipes.

The entry configuration lives at src/replay.vite.config.mts (historical path: `../../../../../../apps/battle-perf-lab/src/replay.vite.config.mts`); the existing CLI selects `raw`, `typegpu` or `vgpu` after the archive path. Initialization and archive limits remain unchanged. Each run requires a fresh output directory. Source Three replay sequencing is unchanged.

CPU checkpoint: 21 focused tests and a narrow all-backend TypeScript check pass. The coordinated build transforms 460 modules; its 16 emitted modules contain one publication provider reachable from spool, control and all three scene entries. The bundle test also executes the shared control/provider boundary. Two additional tests verify asynchronous upload sequencing and final snapshot-before-validation ordering. Existing source tests and image gates are not repinned. The full web TypeScript check also passes after correcting the async crowd-upload test fixture type; seven command-runner tests pass without a type cast.


[The recorded comparison](report.json) contains the unchanged archive identity and separate raw, TypeGPU and vgpu runs. Every backend completed all 433 presentations and 70 selected frames. All history checks and all six endpoint GPU record/indirect-command checks passed per backend, including pending-to-completed grass publication changes. No browser or WebGPU errors were reported.

All eighteen endpoint image gates remain **red**. TypeGPU differs at 20,957–35,825 pixels, vgpu at 21,163–37,539, and the repeated raw control at 21,107–37,551. Mean RGB errors are recorded in 0–255 channel-code units, separately from maximum errors and changed-pixel counts. These results establish input/work agreement, not equal pixels, equivalent appearance or a performance result. Fresh review of the library replay images is pending. The original source archive and PNGs were not rewritten or copied; the report points to the fresh output images and records their hashes.

Independent [recorded-battle image review](visual-review/README.md) reports visual ties for the inspected pan/horizon stills across source and both libraries. Numerical differences remain explicit; motion and live performance are still separate gates.
