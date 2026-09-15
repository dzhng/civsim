# One GPU image per immutable surface texture

## Contract and evidence

Can the selected renderer share identical material image storage across appearances, preserving every visible material while reducing retained resources and preparation work? The [catalog and source-stat audit](../assets/03b-image-residency/catalog-and-source-stats.json) finds 60 texture definitions across 20 appearances but only three channel/image/sampler combinations. The retained source frame reports 60 corresponding 2048², 12-mip entries totalling 1,342,177,200 logical bytes. The loader already shares immutable image bytes; native `prepareSurface` caches by surface identity, and source surface preparation separately owns its images. These are measured definitions and reported payloads, not proof of a frame-time saving or physical VRAM usage.

Production integration follows slice 03's backend ownership decision. This is an independent optimization track alongside grass and crowd work, and joins final acceptance in 10. Preserve the fixed comparison baseline. A no-change result needs evidence that existing resources are already shared or that the proposed ownership is unsound; do not add a cache merely to close the slice.

## Ownership seam

One world/catalog preparation owns its immutable GPU material images. Surface bindings and material parameter tables remain appearance-specific. Share an image only when its immutable identity, device, color interpretation, dimensions/format, mip-generation policy and texture sampling requirements agree. Do not deduplicate materials by image identity: normal scale, roughness, faction treatment and other table values can differ.

Use the existing asset loader's immutable-byte contract and the selected renderer's resource lifetime. Avoid an application-global cache, a second asset loader, cross-device resource reuse or a permanent old/new switch. Internal key representation and asynchronous admission structure are delegated; sharing across the entire application or changing authored assets is not. A staged reload owns new resources until admission, and old resources remain valid through in-flight drawing. Dispose each owned texture once, without retaining resources from failed or cancelled preparations.

## Runnable checkpoint and gates

Use the existing complete-scene fixture and actual Menu route, with the same full catalog and physical framebuffer. Report unique allocated material images and bytes separately from the number of references/bindings. Compare preparation and retained resources, then camera travel/return behavior with all appearances visible. Existing native allocation telemetry and source object accounting must retain their explicit, different meanings.

Pin sharing of equal immutable definitions, separation of differing color/mip/sampling requirements, failure cleanup and reload/disposal behavior with focused ownership tests. Verify the actual GPU resource count and binding behavior on hardware; a smaller JavaScript map is not evidence of fewer GPU allocations. Reuse the established source/native scene and lifecycle controls. Keep all performance thresholds, simulation semantics and authored texture bytes unchanged.

The visual variable is texture/material equivalence: close infantry and mounted surfaces plus tactical and horizon full frames across the catalog. No lighting, shadow-fit, grass-density or color-grade changes belong in this pass. Use the shared screenshot-regression path and byte/pixel comparison, run compare-screenshots against the fixed pre-change frame, then run an unprimed screenshot-critique as the final visual acceptance check. Existing baseline pixel instability remains explicit rather than repinned. Camera-motion claims require a sequence and timing, not stills.

Measure the effect with the protocol's quiet paired runs, retaining first-entry and traversal costs. Resource savings alone do not pass the 60 fps or net-shadow contract. Present the resource/visual comparison for a non-blocking user checkpoint: open the shots via preview-shots, allow about five minutes while doing independent work, decide from the evidence if there is no response, record the rationale, and close the shots. Any visible loss or lifecycle failure remains a failed gate regardless of silence.
