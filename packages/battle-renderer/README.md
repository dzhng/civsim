# battle-renderer

The selected raw WebGPU battle world, and the renderer-neutral contracts its caller
speaks to it through. There is one world here, not a choice of engines: the frontend
names what a frame contains, and this package turns that into GPU work.

## The ownership line

The caller owns the device, the canvas and its context, the GPU-error boundary, the
authoritative presentation and every simulation input. The world owns what it
allocates — HDR colour/depth/camera/post attachments, scene layers, pipelines,
staged replacements and their disposal — and it owns final pass ordering. Nothing
here reaches back for the caller's lifetime decisions, and nothing here presents.

Types describe what a battle frame contains. Terrain, water, environment, camera
math, grass residency and assets keep their existing owners in their own domain
packages; consumers import those types directly. There are no re-export bridges or
duplicate frame declarations, in either direction.

## The layers

`world/` holds the GPU resource and pass owners: each one borrows the device and a
camera layout, owns its own resources, and is recreated rather than mutated when its
inputs or framebuffer change. The modules beside this file are renderer-independent
preparation — topology, instance packing, camera publication, record publication,
admission barriers — which is why the lab's typed candidates consume them unchanged.
`shaders/` is WGSL source text on the same footing, and carries the pinned Three
attribution for the algorithms adapted from it.

The world names the GPU work it owns through one scope hook. Whether anyone is
measuring those names belongs to whoever installs an observer, not to the world.

## What is deliberately not here

Comparison backends and their selector, measurement observers, numerical readback,
source timestamp taps and the frontend facade are the laboratory's, and stay there
until cutover. Production battle rendering is still constructed by its existing
owner; this package being complete is not the same as it being switched on.
