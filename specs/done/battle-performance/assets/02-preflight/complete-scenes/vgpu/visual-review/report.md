# Image-only comparison

A = source; B = actual. Reviewed all eight full frames and eight unscaled crops. No code, capture reports, browser, or GPU data inspected.

- **tactical-initial: B is less wrong.** B has visible directional ground shadows beneath formations, including soft stripes projecting beyond the central formation's near edge. A lacks these visible shadow cues and reads flatter. The central rear formation is also brighter in B. No missing formation, label, or command cue was found. Both have sparse grass-like dark flecks at this instant; ground color/texture and horizon geometry appear matched.
- **tactical-settled: visual tie at inspected scale.** Both now show the ground shadows and denser grass-like flecks. Central soldiers, row spacing, Holding label, gold arc, orange triangular cue, thin lines, and small purple marker appear matched. No obvious one-sided content found. Grass flecks also cross the command cue surfaces in both.
- **horizon-settled: visual tie, shared readability defect.** Both retain the same ground rectangle, fog/sky, formations, and labels. Labels overlap across rows and obscure most distant units. Grass/shadow fine detail is too small and hazy here to judge confidently. No obvious one-sided content found.
- **far-lod-settled: visual tie, shared readability defect.** Both show the same tiny ground island and chunky formation representations; oversized overlapping Holding readouts dominate them. No obvious missing patch or cue in one side. Ground border/color appear matched; individual grass and shadows cannot be judged at this distance.

**Limits:** Static images establish appearance only, not animation stability, loading duration, or runtime correctness. The initial-to-settled difference indicates A's visible shadows and dense grass arrive between captures; it does not identify the cause. No numerical pixel-equivalence claim is made. Distant label overlap and isolated rectangular ground remain apparent in both versions, so parity does not establish overall visual quality.

**Crop coordinates** (original 2880x1800 pixels, left/top/right/bottom): tactical initial and settled (1220,800,1660,1450); horizon settled (1120,810,1760,980); far-lod settled (1240,810,1640,1000). Files named `<label>-<source|actual>-crop.png` in this directory. Crops were extracted without resampling and viewed at original resolution.
