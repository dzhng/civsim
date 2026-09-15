# Native water component control

The control compares the source ocean/lake meshes against native WebGPU water
using identical CPU topology, camera, injected time, environment, HDR post and
sample count. The lake includes the existing source/native terrain bank so the
water mask and depth relationship are visible. This synthetic component fixture
is not a generated battle or a complete-world/performance result.

[Summary](summary.json) records the result. Lake meets the existing control's
1/255 display-HDR maximum-difference gate at both sample counts. Ocean remains
strictly red, with maximum difference 0.008789 at one sample and 0.059570 at four;
no acceptance threshold was relaxed. The differences are localized separately in
[ocean pixel telemetry](ocean-pixel-localization.json). All captures are finite,
without browser or WebGPU validation warnings/errors, and native texture/buffer
ownership reaches zero after disposal. Cold, changed-time and repeated views are
retained in each case report and PNGs. Both native and source horizon repeat PNGs
are byte-identical at each injected time in all four cases.

The production topology and CPU wave dispersion/phase preparation now have pure
shared owners in [`game-renderer/src/water`](../../../../../packages/game-renderer/src/water); extraction was compared directly to
47010c8b and preserves ocean positions/indices and lake positions/shore distances/
indices exactly. The source TSL surface arithmetic and scalar values remain
unchanged. Native WGSL owns displacement, shoreline response and normal detail;
the established shared native environment supplies GGX, IBL and aerial fog.
Water remains opaque, front-sided and reverse-Z depth-writing, matching source
material behavior. The frame must submit it before read-only world decals.

Independent code review found no shipping issue in the named staged diff. The
local dependency symlink remains unstaged. The [fresh visual review](visual-review/review.md) found no candidate-only visible
regression in the inspected pairs/crops. Both paths show the source lake's
stepped broad shore and rectangular water patches, and the ocean fixture's
finite boundaries and distant speckle. Selected comparison crops, coordinates
and metrics are retained alongside the review; scratch crop tooling and
individual duplicate crops are excluded. Numerical ocean parity and
complete-world integration remain open. Stills and repeatability do not prove
motion smoothness.

The implementation decisions are limited to this comparison seam: topology and
CPU wave preparation move unchanged to shared pure owners; scalar water policies
have one source for both shader languages; native geometry/state buffers belong
to the water layer while lighting, fog, camera and attachments remain borrowed.
The inland control uses a synthetic masked basin with a real terrain bank to
exercise coverage and depth without introducing a generated-world dependency.
These decisions do not select a renderer or authorize changing the source look.
