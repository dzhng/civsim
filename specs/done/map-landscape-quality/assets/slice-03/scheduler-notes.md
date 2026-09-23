# Terrain scheduler pass

This pass supplies CPU scheduling only. It does not complete slice 03: the production worker, joined geometry, coarse coverage, anchors, GPU allocation accounting, traversal and visual gates belong to the integration pass.

The scheduler admits a completed tile only at an explicit frame tick. The install callback receives the incoming tile and eviction keys together; the world must prepare resources before the transaction and either swap all geometry/query/anchor state synchronously or throw before changing state. A failed admission retains the old surface. The world owns installed GPU disposal; scheduler disposal drops CPU references and ignores late replies.

## Decisions for the integrating choices ledger

- **Sound:** Keep useful builds alive across camera changes. There is one in-flight build and one pending completion, so asynchronous work cannot flood uploads. No background timer or completion callback changes the rendered surface.
- **Sound:** Retain unwanted resident tiles until space is needed, evicting the least recently requested first. This allows traverse/return reuse without a second cache owner. Desired requests beyond the count bound keep coarse coverage.
- **Sound:** Remember failed keys for the scheduler lifetime. Builder, upload and oversized-single-payload failures remain explicit and never restart automatically. Keys identify immutable source/location/resolution; rebuilding after a source change requires a fresh scheduler.
- **Provisional until production allocation measurement:** The CPU typed-array admission budget defaults to 32 MiB within the feature's 128 MiB total allowance. A completed transfer can temporarily coexist with full resident payloads before next-frame eviction, and `pendingPayloadBytes`/`peakPayloadBytes` disclose it. Unique backing buffers are counted once. JavaScript scenery objects, worker scratch and GPU allocations are not included; no claim about total renderer memory follows from this metric. Production preflight must bound worker output and combine measured allocations.
- **Sound:** When requested tiles collectively exceed the payload budget, retain already resident requested tiles and block the additional tile for the current desired membership, leaving its coarse coverage. A different requested membership clears admission blocks so previously blocked tiles can load when space becomes available. Unchanged or merely reordered requests do not retry, preventing permanent load/evict oscillation. Production request sizing must fit the active working set into the chosen budget.

## Verification

Nine behavior tests cover delayed completion during a priority change; frame-only admission; idle stability; departed results; cache return and atomic eviction; rejected and synchronous builders; failed install retaining old surface; resident byte accounting plus transient transfer peak; oversized output and oversized working sets; disposal; and shared backing buffers. `bun run --cwd web test tests/terrainTiles.test.ts`, full web typecheck, and focused oxlint pass. Existing generated WASM was copied from the integration worktree solely to provide the local typecheck dependency.

Independent `codex review --uncommitted` found that permanent failure for temporary working-set pressure would strand a valid tile after leaving the crowded view. The implementation now distinguishes temporary admission blocks from actual failures, with traverse-after-pressure coverage in the working-set test.

The subsequent independent review found no actionable defects. The final telemetry cleanup also counts immediately discarded stale transfers in the CPU peak; the stale-reply test covers that accounting. Shape/code/docs review retains one scheduler owner with injected build and atomic install seams, no second cache or timer.

No existing test behavior or baseline changed. No browser or hardware claims are made by this pure scheduler pass.
