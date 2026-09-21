# Coordinated native replay build

The previous scalar entry built only the adapter: 12 transformed modules and one 5.99 KB output. Its publication queue was not linked to a bundled native scene. The corrected config builds scene, control and publications together, allowing the bundler to retain one provider module.

The actual corrected build transforms 135 modules and emits five ES modules. All three public entries import the same provider chunk. The emitted native grass constructor resolves to the same exported provider constructor as the publications entry. A CPU execution of the emitted control queues a real captured publication; the emitted provider consumes it at the mocked scene's presentation boundary. This verifies queue identity without creating a GPU device.

Run the Vite build using `apps/battle-perf-lab/src/raw/replay.vite.config.mts`, then `node apps/battle-perf-lab/scripts/checkReplayBundle.mjs`. The checker intentionally examines the emitted graph and executes emitted modules. The old scalar build fails it; the corrected build passes. [The report](report.json) records the exact emitted bytes and hashes.

The build used current primary scene dependencies, including the uncommitted coordinator copied into the fixture worktree only for validation. Those root files are not part of this correction. This is a packaging/CPU boundary check, not GPU replay or source image parity acceptance.
