# Packed RGBA mip control

Sixteen cases compare both library-owned mip chains against native using identical packed RGBA subarrays with nonzero byte offsets, including odd sizes and one-pixel axes in linear/sRGB formats. All88 mip comparisons are byte-identical; no GPU/browser errors or live textures remain. Run `mip-check.html?packed` through `verify-mip.mjs`, with `MIP_EVIDENCE_DIR` selecting this separate directory. Existing bitmap-mode cases remain unchanged.
