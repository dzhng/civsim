# Independent standards visual review

Excerpt of the fresh image-only review commissioned by the parent task. The reviewer inspected source PNGs and exact 3× nearest-neighbor crops without implementation code or prior judgments. Actual is left and expected right; the motion crop instead compares actual front and actual wave. Pixel metrics are display RGBA, separate from the HDR numerical control.


Sources: `/Users/david/dev/game-raw-post-verification/specs/done/battle-performance/assets/02-preflight/standards/`: `raw-1x/front`, `raw-1x/wave`, `raw-4x/reverse`, each actual/expected.

### Actual-versus-expected defects

**None visibly distinguishable; confidence 0.99.** All three pairs have matching cloth outlines, attachments, pole endpoints, emblems, colors and coverage at full size and 3×. Only 4, 5 and 4 pixels differ respectively, by one RGB code value; alpha is identical throughout each pair. These numerical differences are not visible defects. Neither side is visibly less wrong.

### Shared limitations and observations

| Feature | Concrete observation | Full frame vs tight3x | Confidence |
|---|---|---|---|
| Attachment | Cloth meets the crossbar continuously; crossbars meet the pole. The pole remains visible down the center on the back-facing blue flag in front/wave and the back-facing ochre flag in reverse. No visible detached cloth, drifting finial, or gap at the top attachment. | Continuous at full frame; joints confirmed in crop. | 0.97 |
| Edge-on readability | The middle rust-colored flag is nearly edge-on: it collapses to a narrow orange/gold strip rather than a readable banner face. Its emblem is not usable at this angle, including reverse. This is shared projected-silhouette limitation, not evidence of missing geometry. | Obvious in full frame; crop exposes the thin face and border. | 0.99 |
| Ochre emblem contrast | Front/wave's left flag has a faint dark disk and a low-contrast diamond against an ochre field. The blue face in reverse carries a considerably more readable gold disk/diamond. Team color remains distinct, but the ochre markings are weak. | Faint at full size, readily inspectable at 3×. | 0.97 |
| Raster edges/material read | The 1× poles, hems and finials are stepped, especially the gold edge on the edge-on middle cloth. Reverse 4× has smoother coverage. Large cloth faces remain quite flat in shading; folds are mostly communicated by contour rather than obvious interior relief. This does not establish incorrect cloth physics. | Steps visible at native size under scrutiny, dominant in crop; flat faces visible at full size. | 0.96 |
| Color | Ochre/olive gold, muted rust, slate blue and brown shafts form a coherent restrained palette. No actual-only hue shift, darkening, bright fringe or lost team color. The gold edge of the edge-on banner is especially bright against transparency on both sides. | Same at full and crop. | 0.98 |
| Motion difference | Comparing **front to wave**, the middle cloth bows farther left and its lower gold tip drops/curves outward; outer banner hems also move subtly. Pole/crossbar positions stay visually stable. Actual and expected show the same pose change. This proves distinct static cloth poses, not smooth animation, timing, or absence of temporal clipping. | Middle tip movement visible full-frame when alternating; clearest in dedicated crop. | 0.98 for pose change; animation quality unassessed |
| Grounding | There is no terrain, bearer, contact shadow or support context. Shafts simply terminate into transparent space. Thus these isolated renders cannot establish whether standards float, penetrate ground, or attach properly to soldiers in-game. Not an actual-only defect. | Clear at full frame; crop adds no grounding evidence. | 1.00 for evidence limitation |

Selected evidence: [front](standard-1-front-tight3x.png), [wave](standard-1-wave-tight3x.png), [reverse](standard-4-reverse-tight3x.png). [Motion comparison](standard-front-vs-wave-motion-tight3x.png) is the exception to pair labeling: **actual front left, actual wave right**, crop `[300,140,35,120]`.
