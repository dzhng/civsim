# PMREM numerical control

The control gives each candidate PMREM and Three's public `PMREMGenerator.fromEquirectangular` the same production sky texels. It compares the initial CubeUV projection separately from the eight filtered regions, checks the full atlas for nonfinite values, and compares direction/roughness samples with Three's public `textureCubeUV`. This separates atlas orientation, filtering and sampling failures without a second CPU implementation of the algorithm.

Three's pinned WebGPU readback retains row padding. The 336-pixel HDR atlas has a 2816-byte row pitch; removing this padding is required before comparing coordinates. The 384-pixel input is already aligned. Stage-zero equality verifies face orientation and UVs directly.

The retained report covers all environment presets and disposal of the candidate output while its source/device remain borrowed. It is component correctness evidence, not full battle parity or a performance result. The private `pmrem.vite.config.mts` build and `verify-pmrem.mjs` runner require the coordinated GPU slot. Their exact commands, source identities and unchanged tolerances are recorded with the evidence.

Raw and TypeGPU run through the same query-selected control (`backend=raw` or `backend=typegpu`). The verifier selects that value with `PMREM_BACKEND` and records each result in its backend evidence directory. TypeGPU uses its public experimental command encoder to preserve atlas viewports and scissor rectangles; that versioned API is a complexity cost for backend selection. Both runtimes share shader function bodies and plane data, while their resource and command ownership remain independent.
