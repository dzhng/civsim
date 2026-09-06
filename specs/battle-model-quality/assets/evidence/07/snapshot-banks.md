# Exact frozen storage across binding limits

The existing output capacity is sufficient to bound each of two frozen-pose
banks. Each admitted body references at most two frozen sources. The packer
retains live slots and assigns new identities to the lowest free slots, so its
slot span never exceeds twice the largest submitted body count, including holes
left by a shrinking crowd. Parity striping divides that span between two banks.
Each bank's pose capacity is therefore at most the retained output capacity.
Its local transforms use fewer bytes per joint than the output matrices.

Both renderer owners consume the same storage/address contract and WGSL kernel.
The controller, immutable identity map, authored values, draw path and skinning
remain unchanged. Equal lazy bank capacities preserve stable addresses through
growth. A replacement receives every live source once; repeated frames and
visibility shrink preserve resident values without additional snapshot uploads.
The direct device binding-count check runs before allocation. Total memory and
asynchronous GPU admission failures remain real limits.

The production owner queues candidate compute before publishing its output to
materials. Failed candidate submission or material construction retires the
candidate and keeps old resource ownership intact. The caller's existing frame
failure behavior remains; this is not a promise to draw old pixels after failure.
The allocation observer counts both banks and simultaneous old/new generations.

## Verification

CPU regression: three bodies with two joints need384 output bytes and576 frozen
bytes. The original owner rejects the576-byte binding against a384-byte device
limit; the new owner admits two288-byte banks. Exact repeated uploads, retained
slots4/5 after shrink, low-hole reuse, cross-layer identity sharing, replacement
failure, material failure, retry and disposal pass. The raw test also admits384
total snapshot bytes against a320-byte binding limit and recovers both banks
after the second bank's queue write throws.

Focused command from `web`: `node_modules/.bin/vitest run
tests/posePalette.test.ts tests/rawPosePalette.test.ts tests/playbackPacking.test.ts
tests/rigPaletteData.test.ts tests/allocationBudgetProbe.test.ts` —28 tests pass.
`node_modules/.bin/tsc --noEmit` passes. No Rust or simulation behavior changed.

[GPU report](snapshot-banks-parity.json): `VERIFY_GPU=1
VERIFY_URL=http://127.0.0.1:5176 node web/scene.mjs pose-palette raw-pose-palette`
passes on SwiftShader. Both parity branches appear in base/upper composition at
three weights for hostile and mounted rigs. Raw and Three outputs have identical
bytes; CPU matrix/weighted-geometry tolerances remain unchanged. The raw render
probe's numeric geometry/depth, source retirement and disposal gates pass. This
is transport/numerical evidence, not an aesthetic verdict or hardware timing.

The [merged hardware run](snapshot-banks-merged-67-30k.json) preserves all30,000
submitted bodies throughout the staggered history, including60,000 frozen
sources at67 joints. Each bank holds96,480,000 bytes, below the134,217,728-byte
binding limit; combined snapshot upload is192,960,000 bytes. Sources retire
normally. There are no renderer warnings or page errors. Root also repeats
the28 focused CPU tests and typecheck successfully on the merged tree.

This is storage-admission evidence, **not performance acceptance**: both
interruption cadence checks fail at33.335ms p95 against the unchanged33ms gate.
The run uses180 frames,30k mounted bodies, detail subdivisions[3,1,0], eight
joint copies, four influences, two key subdivisions,1024px maps and the close
camera at1280×800 on hardware Chrome. Production temporal regression, standing
hardware gates and the broader budget envelope remain open. Retain this failed
timing result when investigating the next change; do not replace it with the
earlier synchronized pass.

Review of the timing rows confirms that they still use synchronized histories
(two snapshot slots); the60k-source allocation phase runs afterward. Most CPU
stages are slower than the prior report, including steady frames with no frozen
sources. Upload/preparation shows the largest median increase, but this does
not isolate a code cause. An exclusive-GPU old/new/old comparison is the next
diagnostic before optimizing. No threshold or acceptance requirement changes.

The [merged temporal/palette repeat](snapshot-banks-temporal.json) passes675
checks on the canonical SwiftShader route. All39 temporal images and the
controller image have zero pixel differences; no image was re-blessed. Exact
raw/Three palette comparisons, weighted geometry and resource lifecycle checks
also pass. This establishes preserved playback transport, not final model
quality or hardware timing. The standing hardware repeat remains required.

The subsequent [hardware A/B/A repeat](snapshot-banks-aba.md) admits the exact
60,000-source workload with banking, while both pre-change and post-change runs
fail the unchanged interruption cadence gate. It does not establish a causal
timing regression or close performance acceptance.

Shape/diff/docs review keeps bank addressing, growth and binding schema in one
shared owner. No compatibility path, extra dispatch or dependency was added.
The CLI second-opinion attempt failed before review because its configured
`gpt-6-astra` requires a newer installed CLI. The integrating agent's independent
review and merged workload checks remain acceptance requirements.

## Changed-test ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| `admission failure retires all owned storage once, including after partial submission` in `posePalette.test.ts` | Six attributes retired once. | Seven attributes retired once. | One snapshot attribute becomes two; ownership/disposal stays complete. **moved** |
| `raw palette snapshot growth reuploads retained sources and retires resources once` in `rawPosePalette.test.ts` | Sources3/5/7 occupy offsets0/48/96 in one buffer; a failed first snapshot write is retried. | Sources3/5/7 occupy bank0:0, bank1:0, bank0:48; failure in bank1 requires both overwritten sources to be uploaded again. A fitting output admits total snapshots larger than one binding. | Physical storage is striped while source values and logical slots remain exact. **moved** |

Three new CPU tests pin fitting-output admission with shrink/reuse, actual
binding-count rejection, and candidate replacement failure recovery. The
numerical GPU scene adds twelve both-frozen parity/weight checks; its previous
checks and tolerances remain in force. No unit stats, saved data or image
baselines changed.
