# Water verification changes

No sim or unit-stat changes.

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| battleOceanJoin: ocean starts at every drawn edge knot | No boundary contract | Both sides preserve nonflat edge knots/coverage, remain outside field, settle offshore, and have valid winding/indices | Replaces an overlapping midpoint plane. **moved** |
| battleFieldWaterNormals: dry/wet normal response | No wet lighting-normal contract | Dry normals exact; wet phases differ; normalized response fades with distance | Pins water-only lighting behavior. **moved** |
| battleFieldWaterNormals: dependency resolution | No shared graph check | Resolves wave field, normal consumer, shared water response and actual terrain function | Both shaders now share real dependencies. **moved** |
| reviewGifPalette: subtle shades | RGB444 merges nearby water shades | RGB888 preserves three nearby shades; default still merges them | Review media must retain visible motion. **moved** |
| lake geometry checks, both environments | Raw manifest elevation, regenerated WASM/source import, fixed waits | Installed scaled elevation, live tint, completed camera, positive draws/triangles | Built production no longer depends on a source-only URL or second world. **moved** |
| lake water/dry masks, both environments | Water>=.42 and dry<=.12 at raw lake plane | Same thresholds; installed wet elevation and terrain dry elevation; software water.42/.571,dry.034/.112 | Correct source/projection, unchanged floors. **moved** |
| golden-lake snapshot |329×192 legacy crop |375×265 current installed-surface crop; exact repeat | Correct camera/projection and accepted distant-glint fix. **moved** |
| overcast-lake snapshot |329×192 legacy crop |375×265 current installed-surface crop; exact repeat | Same geometry correction in diffuse light. **moved** |
| sea owner/environment checks | Retired Three Gerstner-TSL/SkyModel/aerial owner metadata | Actual TypeGPU water admission/resources, selected noon environment, stable camera and completed frames | Backend migration replaces retired object-name assertions; no compatibility metadata added. **moved** |
| sea clock return | Cold navigation per phase; no return check | One world; revision/time completion and exact return to t18 | Proves deterministic owned time. **moved** |
| sea interior motion | Whole crop only | Adds ocean-only interior mean delta>.004 | Field effects cannot satisfy a frozen-ocean gate. **moved** |
| sea travel/teleport | Mean>.004; max<6 skipped on SwiftShader | Same limits on both adapters; software mean.2032,max.206 | One-world phases remove cold-navigation discontinuities. **moved** |
| sea GIF |16 frames, RGB444,640×170 |16 frames, RGB888,640×250; same timing | Retains subtle colors and the corrected ocean crop. **moved** |
| film-00 snapshot |1280×340 legacy framing |1280×500 west-facing ocean/join,t18; exact repeat | Films the actual moving owner. **moved** |
| film-01 snapshot |1280×340 legacy framing |1280×500 west-facing ocean/join,t19; exact repeat | Same framing migration. **moved** |
| film-02 snapshot |1280×340 legacy framing |1280×500 west-facing ocean/join,t20; exact repeat | Same framing migration. **moved** |
| film-03 snapshot |1280×340 legacy framing |1280×500 west-facing ocean/join,t21; exact repeat | Same framing migration. **moved** |
