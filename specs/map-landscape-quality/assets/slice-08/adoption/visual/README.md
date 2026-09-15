# Integrated flat shoreline controls

Captured the merged production builder plus packed campaign geometry on the
canonical SwiftShader harness at 1280×800 DPR 1 and frozen time. All four frames
repeat with zero differing pixels and no page errors. These captures use the
flat diagnostic material, isolating geometry from the shared water shader work.

The coarse fixture is unchanged. Its detailed case changes 7,592 pixels (maximum
channel delta 4), consistent with corrected wet-bank normals. The real coast
changes 49,438 pixels (maximum channel delta 53) as the adopted builder uses the
same 2 km source relief at every mesh resolution. The new real-detail frame covers
an actual fine-tile admission; it replaces the obsolete separate-builder before
case. The original before image remains in prior history and earlier evidence.

Direct inspection of all four frames and both enlarged bank crops shows retained
island/channel/river coverage and no visible separation between wet and dry banks.
The source-scale stepped outline remains unchanged. Broad/angular shading patches
remain in the real bank; this is not a final shoreline-quality acceptance. The unprimed critique agrees: the new bank is marginally less wrong through improved shading continuity, but repeated source steps and broad faceting remain. It found no holes, floating fragments or new gaps. Flat-water contact cues and fixture cutoffs are outside this geometry checkpoint.

`comparison.json` contains decoded RGBA differences against the prior accepted
captures. `update.json` and `repeat.json` contain the actual scenario checks.
Full-working-set memory and hardware timing are separate acceptance gates and
are not established by these small diagnostic scenes.
