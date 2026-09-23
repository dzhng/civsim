# Renderer retirement evidence

The dependency fix removes renderer-owned listeners from shared resources without
disposing another live renderer's resource or changing backend teardown order.
Its owner-level CPU regressions preserve the other live owner's callbacks and
normal resource disposal. The source and both non-minified WebGPU bundles are
covered by the [Bun patch](../../../../../web/patches/README.md).

[Heap paths](retainer-paths.json) identify two accumulating renderer roots before
the patch: the shared DFG texture's texture-manager listeners and shared quad
geometry's render-object listeners. After the patch, earlier renderer generations
collect. The most recent retired battle renderer remains through BloomNode's
module-level quad material and its `renderPipeline` context, until the next battle
replaces that material. The lifecycle guard permits only that latest renderer;
every earlier renderer and every retired world must collect after GC.

The development run still grows because React Refresh's `helpersByRoot` map holds
old battle HUD fibers, callback closures, and asset catalogs. This was diagnosed
from the heap and not patched in application code. Production conclusions use the
built preview with React Refresh absent, not the development server.

The [ten-cycle production report](production10-report.json) passes terrain disposal,
worker termination, stable renderer counters, and collectability on every cycle.
User-agent memory spans 295,919,267–303,401,277 bytes and ends at 298,124,689 bytes;
it does not repeat the development run's roughly 90 MB increase per cycle.
The [memory series](memory-series.json) includes the three-cycle control and
both development runs. This is a bounded ten-cycle result, not a claim about
unlimited sessions. The raw diagnostic heaps remain in the isolated worktree's
throwaway directory; their hashes are recorded with the retained paths.

The existing `renderer-lifecycle` scene now guards collection directly. Run it
against a production preview for production memory evidence; its report also
records whether React Refresh is present. The independent reviews found no
introduced ownership or oracle-retention defects. No simulation tests changed.

The [screen UI production replay](screen-ui-production10/README.md) extends the
retirement proof to the added display texture and copy resources.
