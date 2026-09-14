# Terrain source and worker pass

The worker consumes a classified source snapshot once, then receives only tile requests. Source sampling and palette classification remain single-owner logic in `campaignSource.ts`; the application performs image decoding and constructs the original mask. Snapshotting copies owned typed arrays, and the worker client transfers those copies without detaching the application's terrain. No DOM image or canvas crosses the boundary.

The worker build uses the existing landscape generator. This pass does not alter geometry, placement, shoreline semantics or artistic relief. In particular, the existing strategic treatment of river pixels is preserved; separating rendered water from strategic land remains the planned water-boundary work.

The client rejects a second concurrent build, reports per-build errors without retry, and treats worker transport errors as terminal. Disposal terminates the worker and rejects pending work. The scheduler remains the owner of prioritization, cache admission and frame swaps. There is no second queue in the client.

## Choices for integration

- **Sound:** Move the existing palette and mask implementation to a neutral CPU source module, and import it directly from both application and worker. No duplicate classifier, re-export compatibility layer, or sampled reconstruction is introduced.
- **Sound:** Serialize the full classified mask instead of resampling coast coverage to the coarse height raster. This retains existing coordinate epsilon, margin and edge semantics exactly.
- **Sound:** Narrow the landscape generator's input type to the fields it uses. A serialized worker source does not need fake physical-height or strategic-land methods.
- **Sound:** Transfer one source copy at initialization, then transfer each tile's typed output buffers back. The application retains its source; the worker owns its snapshot. Shared geographic source memory must be reported separately from the scheduler's tile payload budget.
- **Sound:** The dedicated worker entry is a thin caller of the same tested handler. Native Worker creation remains in the client; an injected Worker port supports deterministic transport failure tests without another production backend.

## Evidence and limits

The focused set passes 18 tests: existing mask and landscape contracts, scheduler behavior, and five new worker tests. Worker tests compare every generated mesh buffer byte against a direct build, full-resolution mask samples and margins over a grid extending beyond raster bounds, source-copy ownership, repeated request transport, errors, concurrency and disposal. The old mask test changed import location only; no old assertion or expected behavior moved.

Full web typecheck and focused oxlint pass. A Vite production bundle emitted the worker entry successfully. A native Chromium module-worker smoke run built a 128-triangle fixture, returned 3,240 vertex bytes, preserved the application's 64-byte height array, and returned both land/water shore signs (-6 to +6). The scratch server's unrelated full-repository dependency scan could not resolve a historical document's Three.js import; the exercised source modules and real worker completed successfully.

Independent `codex review --uncommitted` found no actionable regressions and independently confirmed the focused tests, typecheck and worker bundle. Shape/code/docs review retained the existing classifier and sampling semantics with no second queue or generator.

These are CPU/transport proofs, not GPU memory, tile-join, frame-time or visual acceptance evidence. Root integration still owns those slice-03 gates.
