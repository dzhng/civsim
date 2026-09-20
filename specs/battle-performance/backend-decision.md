# Select TypeGPU for the battle cutover

TypeGPU is the selected direction following the user's preference for type safety
under the measured raw/TypeGPU tie. The earlier choice of raw overweighted the
absence of a dependency. Typed data layouts, bindings and shader interfaces are
maintained contracts too: catching mismatches before runtime is a meaningful
advantage when no reliable speed advantage justifies giving it up.

This revises the architecture decision, not the measurements. Production still
uses Three. The promoted raw implementation and its verified capability changes
are reuse inputs; the older TypeGPU candidate does not yet include all of them.
No final performance, visual or cutover acceptance is claimed.

The compared versions were Three0.185.1, TypeGPU0.12.5 and vgpu0.5.0. Preserve the
same workload, framebuffer, assets and quality when verifying the selected path.

## Evidence and its limits

[Three declared orders and the bounded confirmations](assets/02-held-rounds/README.md)
are complete. Across the three orders, raw's average and1%low ranges exceed
Three's at both held states; vgpu has lower cadence. Raw versus TypeGPU reverses
ordering in the later query-disabled confirmation, so the declared rule yields
a tie. Every quiet-host verdict failed. These are conditional engineering inputs,
not release timing, statistical confidence intervals or live battle acceptance.

[Eight coherent checkpoint runs](assets/02-held-authority/checkpoints/README.md)
also complete. Raw and TypeGPU match all observed counts/histograms at all twelve
checkpoints. All backends retain equal soldier and main/shadow visibility counts.
The source/vgpu comparisons retain an88-caster shadow-tier difference at early
checkpoints, and vgpu has a two-body visible-tier difference at one later-state
checkpoint. Thus not every historical candidate did exactly equal geometric work.
Approximate camera matching and these explicit differences must survive the report.
The shared LOD policy defects have since been corrected; those changes do not
retroactively make old timing runs equivalent.

Prior complete-scene, pose and material controls established no obvious one-sided
scene loss in independent still review. Strict pixel differences and shared noisy
contact overlays remain documented. Held authority, sampled images and component
floors cannot establish continuous motion or the final live workload.

## Type safety must be real

Use TypeGPU schemas and typed bindings as the single data contract, and typed
shader authoring where it checks shader bodies. A WGSL string embedded in a typed
function shell checks its interface, not every expression in its body. Retained
WGSL requires an explicit reason and its existing compiler/numerical coverage;
wrapping raw code and calling the result fully type-safe does not fulfill this
selection. Type safety does not prove GPU resource lifetime, rendering quality or
performance; those keep their independent checks.

The installed candidate uses unstable command-encoding APIs. Audit those concrete
uses against the installed library before committing to the final frame owner.
Prefer supported interoperation when it preserves the intended type guarantees;
keep any necessary unstable dependency narrow and explicit. Do not upgrade the
library incidentally or change GPU work to make a benchmark easier.

## Ownership and implementation

One selected battle renderer belongs in `packages/battle-renderer`; shared camera,
terrain, environment, asset and animation policies keep their domain owners.
Convert in verified passes using the existing TypeGPU implementation and the
latest promoted capability fixes. Do not revert to an older candidate wholesale
and silently lose High shadows, reload, diagnostics or camera corrections.
The [migration graph](migration.md) owns the conversion and exit requirements.

Keep the real Menu benchmark playable through the lab until cutover. Then remove
the old battle owner and temporary backend selection. No production compatibility
renderer, saved-data migration or campaign engine migration is authorized. Campaign
and offline tooling may retain their actual Three dependencies.

The conditional tie is sufficient to prefer TypeGPU, but not to declare the game
fast. Live camera responsiveness, simulation throughput, readable default and
moving shadows, the unchanged30k floor and net-shadow savings remain required.
