# Readout atlas and native control

Readout layout, chip keys, measured widths, row wrapping, Canvas2D atlas drawing and packed billboard data now have one CPU owner shared by the source and native renderers. The native owner uploads an sRGB canvas atlas without mipmaps, uses linear filtering, preserves alpha cutout and opaque surviving alpha1, and renders camera-facing quads. Camera bias and behind-camera collapse retain source behavior. Actual source depth testing and writes are disabled; misleading source comments and stats were corrected without changing that rendering policy. No glyph style, font, plate color, spacing or selection behavior was redesigned.

The first control exposed a source atlas resource bug. Initial and restored64x128 atlases matched, but growth and shrink produced stretched glyph fragments in Three. The public upload trace proved that source/raw canvas hashes and published dimensions matched, while Three still uploaded to the initial64x128 GPU texture for64x1024 growth and64x16 shrink. Readback of all issued source instance buffers matched CPU data exactly. Thus the divergence was the physical atlas allocation, not placement or a guessed cache effect.

The source owner now replaces its CanvasTexture when atlas dimensions change, updates the public TextureNode value, and disposes the previous texture. The corrected trace shows destination dimensions equal to canvas dimensions throughout growth/shrink/restore. `source-before/` preserves failing images/reports and the causal trace; `trace-after.json` preserves the corrected trace. The old trace's `size` field held Three's mutable extent object and was reset after the call, so only its independently copied canvas/destination dimensions and pixel hashes support the before conclusion. The corrected trace snapshots extent values. Both diagnostic traces retain Canvas2D readback advisory warnings; clean uninstrumented acceptance runs have no warnings.

All18 final1x/4x cases pass the unchanged1/255 HDR gate. The largest difference is0.003173828125 at growth1x; growth4x is0.002197265625 and rotated text0.000732421875. Other cases match exactly, including bright/dark backdrops, repeat, shrink, empty, restore and behind-camera collapse. Native textures and Three's texture accounting both reach zero after disposal. Reports include actual atlas and instance upload-byte counters for later complete-frame integration. Growth and corrected source captures were inspected; fresh independent visual acceptance is still pending.

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| readout-check growth,1x | Maximum HDR difference0.884521484375; source glyph fragments | Maximum0.003173828125; all140 chips use matching atlas data | Replace stale64x128 allocation with64x1024 before rendering. [moved] |
| readout-check growth,4x | Maximum0.884521484375 | Maximum0.002197265625 | Same verified atlas allocation correction. [moved] |
| readout-check shrink,1x/4x | Maximum0.721435546875; single label samples wrong atlas scale | Exact output, maximum0 | Replace stale64x128 allocation with64x16. [moved] |

No existing test thresholds or simulation stats changed. Two new CPU tests cover centered row wrapping with semantic chip keys and zeroing missing atlas slots rather than retaining orphan data. Raw and full-web TypeScript checks, the control build and those tests pass. Review identified the required render-attachment usage for canvas uploads, fixed before successful rendering; the initial blank canvas also now creates its2D context before upload.

Run `readout.vite.config.mts` and the common `verify-frame.mjs` with `FRAME_CHECK_URL=http://localhost:5199/readout-check.html?samples=1` (then4) and a separate `FRAME_EVIDENCE_DIR`. Add `&trace` only for public upload and issued-buffer diagnostics. The sparse task checkout uses an ignored primary-publicDir override, avoiding duplicate asset copies.

This proves the isolated current readout component and its atlas lifecycle correction. Complete battle-frame integration, global post placement, DPR/font-platform coverage, broader motion and performance remain separate gates. No battle stutter fix or backend ranking is claimed.

The library-owned ports and their failure-admission evidence are described in [readout library ownership](../readout-ports/README.md).
