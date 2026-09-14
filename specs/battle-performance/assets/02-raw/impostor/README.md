# Raw soldier impostor control

This component draws the actual authored far-pose property atlases. It preserves tile selection, model-space anchor rotation, elevation, the screen-size floor, faction masks, corpse contact blending, coverage unassociation, lit normal/ORM response, and cutout depth writes. It neither casts nor receives directional shadows, matching the source layer's flags. Visibility and LOD audience selection remain with the caller. Far soldiers may still contribute mesh-tier casters through the separate crowd shadow audience; this component does not remove those casters.

The native path owns its uploaded textures and buffers. It borrows the device, camera, environment and render attachments. Input atlas data contains every mip of the three production-baked property textures; albedo retains its sRGB format and the other channels retain linear UNORM format. Three is used only by this control to produce the oracle and captured input. A native bake or equivalently verified offline asset path is still required before full backend eligibility. No production simulation, renderer or atlas policy changes are included.

The control uses real heavy-sword, phalanx and cavalry appearances, with twelve facings/factions/living states per view. Oblique, overhead, hostile-order overlapping billboards, and the distant size floor exercise positioning, orientation, cutout visibility and depth. Separate one-sample and four-sample reports preserve the production multisample contract. Native attributes are compared exactly with the actual source layer's populated attributes. The pixel gate requires exact resolved alpha, finite output and HDR RGB differences at most 1/255 on every pixel with coverage in either image. No aggregate error metric can waive those checks.

Lifecycle checks cover empty uploads, rejected incomplete mip chains followed by healthy initialization, repeated disposal, use-after-disposal rejection and continued access to borrowed render/environment textures. Resource admission closes and awaits GPU error scopes before returning a usable component.

The final one-sample and four-sample controls both pass all twelve cases on the Apple Metal 3 adapter: exact packed attributes and alpha, no RGB exceptions, maximum HDR RGB error 0.000244140625, all lifecycle/shadow-flag checks green, and zero GPU/browser warnings or errors. Typecheck, build and the exact-byte transport test passed. Independent final code review found no actionable defects; its earlier resource-admission and failure-cleanup findings were fixed before the final runs.

Fresh visual critique is explicitly pending with the parent task. Direct inspection of the control images has not replaced that gate, and no user-reported visual issue or complete battle-frame parity is declared fixed.

## Clip precision contract

The source impostor has a single cutout beauty pass and no equal-depth prepass. Adding a native `@invariant` annotation produced two adjacent phalanx pixels outside the color gate. The property diagnostic localized them to filtered normal output (encoded-normal error 0.00732421875), while packing and alpha remained exact. Matching fragment UV staging and testing canonical projection, ORM/discard ordering and constant atlas dimensions did not eliminate those remaining pixels. Removing only the unnecessary annotation did: the focused case and subsequent full one/four-sample controls meet the original bounds without exceptions. This proves the annotation caused this discrepancy on the tested compiler; its precise FMA/gradient instruction changes were not captured.

Each final case records `clipInvariant: false`. This does not change grass's invariant requirement for its equal-depth prepass, and it does not establish a universal rule for other mesh passes. Earlier invariant-enabled property and projection diagnostics remain under `diagnostics/`; their red measurements are superseded by the final full-material reports, not silently reclassified as passes.

The optional canonical-projection report is a diagnostic: it overrides only Three's final clip multiplication using the same camera matrix, preserving its authored position node. It does not replace the default production reference report. `diagnostics/diagnostic-vertex-uv.json` records the initial control before matching source fragment-stage atlas UV arithmetic.

Reproduce from the repository root with installed pinned web dependencies:

```sh
web/node_modules/.bin/tsc -p apps/battle-perf-lab/src/raw/tsconfig.json --noEmit
web/node_modules/.bin/vite build --config apps/battle-perf-lab/src/raw/impostor.vite.config.mts
web/node_modules/.bin/vite --config apps/battle-perf-lab/src/raw/impostor.vite.config.mts --port 5198 --strictPort
# In a second terminal after the development server is ready:
node apps/battle-perf-lab/src/raw/verify-impostor.mjs
IMPOSTOR_CHECK_URL='http://localhost:5198/impostor-check.html?samples=4' node apps/battle-perf-lab/src/raw/verify-impostor.mjs
```

The build deliberately avoids copying the large public asset tree; the control server serves the pinned assets from `web/public`. The verifier uses the project's hardware Chrome flags. Its compact base64 transport preserves every RGBA8 byte and closes the browser before writing PNGs. This replaces an oversized per-channel Playwright array transfer that exhausted Node's heap; no memory limit was increased.

Base source: `a8fadca361fc3fdee887984470feb6c4f32312e8`. Shared transport: `77ec6853`. The enclosing component commit identifies the native code and harness. Copied root-owned lighting dependencies are excluded from the commit: `raw/environment.ts` SHA-256 `99db4932950212ca99f4f811b4297a52b9c5c3503255262c4c5434ab59859366`; `shaders/soldier.ts` SHA-256 `46cc8a80f2bce73ab6f1c585713d6a78d5cd26a62dcaff6db94da02596b93fe3`. Paths are relative to `apps/battle-perf-lab/src`. Only the shared faction WGSL export is consumed from the soldier shader module.

No performance benchmark or complete battle-frame parity claim is made here.
