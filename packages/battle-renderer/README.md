# battle-renderer

The raw WebGPU battle world consumes renderer-neutral presentation data. Its
caller owns the device, canvas, error boundary and authoritative simulation
inputs. The world owns its allocated scene resources and pass ordering; the
caller owns final canvas acquisition and submission.

GPU layers live under `src/world`; shared preparation and frame contracts live
beside the world entry, and WGSL lives under `src/shaders`. Terrain, environment,
camera math, grass residency and soldier assets retain their domain owners.
Consumers import those owners directly, without forwarding modules.

Resource replacement follows admission and lifetime rules: a failed staged
replacement cannot publish mixed generations, and disposal must account for
pending work. Crowd replacement retains the admitted pose and validates all staged
GPU uploads before retiring the installed generation. Diagnostics describe that
admitted pose, so camera-only frames never invent animation progress. Resizing does not imply rebuilding unrelated resources or pipelines.

One depth decision covers the frame's attachment and every world pipeline's
declared state, so the published depth diagnostics are a reading of installed
resources rather than a constant kept beside them; reverse-Z follows from the
clear value and the compare direction together. The world publishes the
committed terrain generation's own content and reports an uncommitted or
disposed scene as such. Its camera is the last *preparation*, which moves before
anything reaches the queue — a presented camera belongs to the caller's own
presentation record, never to this one.

The world names its GPU work through a per-device scope hook. Installing a timing
observer belongs to the caller; the world does not depend on lab measurement
code. Adapted shader algorithms retain their pinned Three attribution.
