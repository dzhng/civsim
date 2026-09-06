# Implementation choices

## Sound — medium confidence

### Isolate soldiers by removing foliage occlusion (slice01)

When reviewing a hand grip or a foot, randomly placed grass and rocks can cover the part being judged. The workbench hides those objects but retains production ground, lighting, shadows and post-processing. A fully dressed battlefield would provide more context but less reliable close inspection; later production formation/battle gates still require that context.

The plan required production parity but did not specify review scenery. This choice constrains the workbench to asset inspection, not environment acceptance. **Sound:** it removes an occluder without changing how soldiers are shaded. Revisit if a future gate depends on soldier–foliage contact.

## Sound — high confidence

### Fixed export fixtures are loaded once per review session (slice02)

When the reviewer switches quickly between the human and mounted diagnostic, the selected object changes immediately. Both original assets are loaded once at startup and remain owned by this small oracle until the page closes. The alternative refetched each selection, allowing overlapping responses to leave two fixtures visible and repeatedly allocate textures.

The plan required an independent export oracle but did not prescribe fixture loading lifetime. **Sound:** a fixed, bounded pair needs selection, not a general asynchronous asset-replacement system. Production authoring reload remains the separate workbench's responsibility. This constrains only the diagnostic route, not the roster loader.

### Compare mapped surface vertices, not only joint locations (slice02)

An exported elbow can have correctly placed bones but incorrectly weighted skin. Blender therefore records evaluated surface positions, and the exporter maps each glTF vertex back to its source vertex even when UV seams split it into multiple copies. The browser compares every mapped surface point. A joint-only check would miss lost weights or incorrect mesh bind transforms.

The plan named geometry landmarks but left their encoding open. **Sound:** the original fixture is the independent answer, not the custom crowd baker being tested. Generated landmark files are deliberately verbose, and remain reproducible test data rather than hand-maintained geometry inventories.

### Diagnostic fixtures use neutral surfaces and one checker patch (slice02)

When examining the elbow bend, all-over high-frequency checks concealed the surface. Plain rough grey now reveals the shape; the shield alone retains the authored checker for UV inspection. This changes neither deformation nor final soldier art. The alternative would preserve texture noise that made the export check harder to judge.

The plan excluded final material styling but left diagnostic presentation open. **Sound:** source surfaces stay inspectable, and material fidelity is still a later gate. Neutral color, roughness, checker resolution and exact fixture joint counts are reversible diagnostic settings, not a lower quality bar for the roster.

### Failed reloads retain the last working scene (slice01)

After a local bake, the author can press reload. If its files are broken or omit the selected appearance/clip, the workbench shows the error and keeps the previous soldier usable. A successfully loaded replacement is installed as a whole. The unbuilt alternative would blank or break the inspection view while the author corrects the export.

The plan requested visible errors but did not specify replacement failure behavior. Future import work must retain this explicit last-good behavior, including disposing partially allocated GPU resources. **Sound:** an error stays visible without destroying the review session; this is not a hidden placeholder fallback.

### Restore dependencies already recorded in the lockfile (slice01)

A clean install failed because the package manifest omitted the Node and PNG type packages already present in its lockfile. The manifest now requests those same versions. No package upgrade or new dependency choice was made. Leaving the mismatch would make the new worktree impossible to verify with a frozen install.

The plan did not address an inconsistent starting manifest. Future builds can use the existing frozen lockfile. **Sound:** source and lockfile now describe the same installation rather than requiring an undocumented local workaround.

### Render probes honor the renderer's browser-frame boundary (slice01)

When a test submits a second pose in the same browser frame, three.js's post-processing scene can still contain the first pose: that scene is updated once per frame. The parity test waits until the workbench has no pending draw, then submits each compared pose in a new browser frame. It still requires identical pixels; it does not retry until a lucky image matches.

The plan required deterministic parity but left its scheduling unspecified. Other manual render probes must respect the same frame boundary. **Sound:** synchronization follows the renderer's actual update contract rather than increasing a screenshot tolerance or arbitrary delay.
