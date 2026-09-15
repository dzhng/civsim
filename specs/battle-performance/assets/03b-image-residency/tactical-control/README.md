# Source material-image sharing control

Actual map-A, frozen tick30, 1440×900 CSS at DPR2, default single shadows and unchanged catalog/quality. Baseline sourcea72bb343 uses60 live material GPU textures; candidate72e63ce4 uses3. Both counts come from actual WebGPU creation identities. The corresponding logical payload falls from1,342,177,200 to67,108,860 bytes, a1,275,068,340-byte reduction (95%). This is not physical VRAM measurement or a frame-time result.

[A](A.png) is the baseline and [B](B.png) the candidate. Their poses match; both repeat exactly within their own run and have no page errors. Cross-launch diagnostics differ by76 pixels (max29 channel levels). A second unchanged-baseline launch differs by68 pixels from the first (max16); it differs by74 pixels from the candidate (max29). Existing cross-launch variation is present, but these controls do not prove every candidate delta is noise. Strict cross-launch equality stays red.

[Fresh visual review](independent-review.md) sees a visual tie, with weak contact shadows and repetitive distant ranks shared by both. Its statement that it could not find a pixel difference is a perceptual observation, not a pixel-equality result; the numerical diagnostics above are authoritative. Root agrees there is no obvious one-sided material loss at this framing. Full catalog close/mounted/horizon motion and performance acceptance remain open; this is one tactical still control.

The material scene's near checker snapshot matches exactly, then both the unchanged build and candidate hit the same stale AO-oracle bucket-access exception. The two reports preserve that failed gate. A focused scene correction is in progress; no threshold or baseline is repinned. Browser checks for all material modes and reload remain incomplete until the corrected scene runs to completion.

The candidate remains isolated while renderer comparison proceeds. Image sharing does not fix the existing shadow/grass defects or establish the final net-shadow performance contract.
