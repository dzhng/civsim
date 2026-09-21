# Candidate material mip preparation

Image upload keeps authored orientation, alpha and color-space policy. The shared WGSL performs area-weighted downsampling so odd dimensions and one-pixel axes retain every input texel. sRGB textures decode on load and encode on attachment writes; normal/ORM images stay linear. No candidate calls a raw pipeline to build its mips.

TypeGPU owns typed textures, mip views, pipelines and command submission. vgpu owns textures and draw pipelines; Frame consumes a small implementation of its public Target interface that selects a borrowed mip attachment. That view does not destroy or resize its owner texture. vgpu lacks an external-image upload method, so the public native queue transfers the initial bitmap into the vgpu-owned allocation. It performs no native render encoding. The public Target factory cannot select a mip, so this minimal descriptor owner is a recorded integration cost.

Sixteen controls cover both runtimes, linear/sRGB formats, even dimensions, odd dimensions, and both one-pixel axes. All 88 mip comparisons are byte-identical to the existing native image preparation on the recorded Apple adapter. The reference and candidates use the same initial bitmap; resource tracking reaches zero textures after disposal, with no GPU/browser warnings or errors. This proves the mip preparation component, not complete material or battle-frame equivalence.

The TypeGPU shader initially referenced an unavailable output constructor. Independent review identified it; the final typed entrypoint constructs its output through the public JS shader API. The successful report is `specs/done/battle-performance/assets/02-native-mips/report.json`.

Run the lab control server with `mip.vite.config.mts`, then `MIP_CHECK_URL=http://localhost:5199/mip-check.html node apps/battle-perf-lab/src/raw/verify-mip.mjs` from the repository root. Full mesh controls consume these same preparation functions.
