# Rock detail image provenance

The adopted `packages/photoreal-renderer/assets/rock-detail-height.png` is generated
artwork, not survey data. Built-in image generation produced a1254×1254 image
from this prompt:

> Square seamless grayscale height/displacement texture for Mediterranean
> limestone. Flat orthographic tile, mid-gray average rock, narrow dark branching
> fissures and lighter shallow broken ledges; varied oblique bedding, fractured
> planes and erosion channels. Neutral grayscale, no directional lighting,
> shadows, text, borders, watermarks, brick grid or regular horizontal stripes.
> Moderate height range, seamless both directions, for world-space triplanar use.

The source generation identifier is
`01a0a0ec-d04f-7930-bcfb-792253356101/exec-09113234-4700-473b-88a2-940a48664573`.
A one-time bake converted luminance, box-downsampled to576², folded a64-pixel
wrap crossfade into512², centered the field at0.5 with target standard deviation
0.138, clamped and quantized to8-bit grayscale. The crossfade lowers local
contrast in its band; generation/baking does not guarantee physically valid
height or invisible repetition. Production uses it for color/fracture/roughness,
not displacement or a replacement elevation source.

Final PNG:213,591 bytes, SHA-256
`5e657379898ffb20b7fb4a5d1f4c24374383ffb31d644fac6225c4aab8991b96`.
The checked-in final bytes are the runtime asset; there is no runtime generator,
external service, additional dependency, or need to reproduce stochastic output
at build time. Decode bypasses color conversion and sampling uses linear
repeat/mip filtering. World owners release both GPU texture and decoded bitmap.
