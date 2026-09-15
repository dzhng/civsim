# Native terrain underlays

The production background band draws an expanded backdrop and one of two terrain-underlay styles before the real battlefield. These are live passes, even where later terrain covers their pixels. The comparison preserves their procedural albedo, per-fragment relief normal, vertex-interpolated focus distance, roughness, shared environment/haze and depth-disabled ordering. Style thresholds now live in shared data; palette and contrast owners remain unchanged.

All 16 one/four-sample cases pass the unchanged 1/255 HDR gate, with zero browser/GPU errors, nonfinite pixels, or owned buffers/textures after disposal. Cases isolate each material, compose both layers, switch styles and restore, move the terrain rectangle, and look toward the horizon. Native initialization prepares all three pipelines; later style changes select an existing pipeline and rectangle updates reuse the same buffers. No frame-time saving is claimed from these controls.

[Fresh review](visual-review/review.md) finds no visible pair difference. The isolated surfaces retain a sharp yellow/green boundary, coarse stippling and geometric edges; these are shared source characteristics. Real terrain normally covers much of this image. Full-scene composition and TypeGPU/vgpu ports remain required before ranking a backend.

Static review caught an incorrect native bind-group property before acceptance. It was corrected to the actual environment binding and both complete hardware matrices were rerun successfully. The source style extraction changes no values, material algorithm or graphics setting.
