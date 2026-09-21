# Mesh derivative investigation

This is diagnostic evidence, not a passed beauty or performance gate. The original full and isolated runs use the same vertex/fragment program, camera, pose and six instance transforms. Isolation changes only tier-zero index arrays to the original triangle at index offset 22062; vertex arrays remain intact.

At pixel (364,196), full native U is 0.239872605 and Three U is 0.239872351. Full native dU/dx is -0.042391822; Three is -0.352921098. Drawing the original triangle alone changes native dU/dx to -0.352921069 while Three remains unchanged. Current-pixel U and dU/dy remain unchanged. The isolated primitive does not cover the right neighbor; full native dU/dx equals that visible neighbor's U minus current U exactly. This supports batch-dependent fragment-quad behavior, rather than a current-pixel geometry/pose mismatch. It does not establish the compiler's mechanism or harmlessness in motion.

The same-fragment probe reports U, dU/dx, dU/dy and geometry roughness. Earlier separate diagnostic programs must not be treated as one shader execution. Deindexed unique primitive IDs independently distinguish visible triangle selection; full-pose probe IDs match, while isolated far/transition pixels can select different triangles.

Retain the exploratory one-byte numerical report as red. Existing regression gates remain unchanged. Component acceptance additionally needs an independently derived primitive-boundary analysis and matched moving-image review; full scene and performance acceptance remain separate.
