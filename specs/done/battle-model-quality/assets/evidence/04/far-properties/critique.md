Visible image-only assessment:

### First two angles

- The side view causes severe silhouette collapse. The left and center infantry bodies compress into narrow vertical slivers; shields, arms, torsos, and legs overlap enough that their roles become difficult to read.
- Thin weapons are unstable-looking at this scale. Bows/poles become one- to three-pixel stair-steps with irregular thickness, dark gaps, and isolated bright terminal pixels. The center weapon’s white tip in the side view is disproportionately prominent.
- In the first view, the center pole looks partially broken into segments near the hand and upper shaft. The left bow also has a fragmented lower end. These may be separate block pieces, but visually they read as discontinuities.
- Cool blue/gray edge pixels appear on several weapons and body boundaries. Some are plausibly authored accents, but on the thinnest diagonals they resemble color fringing or exposed edge shading.
- The mounted unit’s silhouette changes much more than the infantry silhouettes. In the first view, rider, saddle, and mount merge into an ambiguous vertical mass with clustered legs. In the side view, the horse-like body, head, tail, and four-leg arrangement become substantially clearer.
- The mount’s legs remain uneven and partly merged even in side view. Several appendages terminate as blunt, isolated vertical pixels, making rider legs and animal legs difficult to distinguish.
- Illumination changes strongly with orientation. In the side view, the center figure’s head and weapon tip become nearly white, while much of its torso stays dark. The mounted figure also gains bright face and upper-body bands. The first view is generally flatter and murkier.
- The first frame is not visually “front-facing” in the ordinary character-sheet sense. The infantry expose rear/side equipment and little facial information; the second frame establishes that all units are broadly oriented toward screen-right. This may be intentional camera-relative orientation rather than a model error.
- No clear soft transparency halo is visible. The dominant edge problem is hard pixel stair-stepping and loss of thin geometry, not a broad fringe.

### Nine-cell material diagnostic

All nine cells retain essentially the same three-quarter silhouette: block/shield mass on image-left, weapon on image-right. Differences are overwhelmingly material and shading-related rather than major geometry changes.

- **Matte-near:** Dark blue with modest plane separation. Top-facing head and shoulder surfaces are lighter, while the torso remains broadly flat.
- **Matte-far:** Similar overall response, but small features—especially the weapon—look more fragmented and uneven in thickness. Fine internal separations are less reliable.
- **Flat-normal-far:** The most uniformly filled blue result. Much of the head, torso, arm, and leg plane definition disappears, so separate blocks merge into a single graphic silhouette. This visibly demonstrates lost normal-based modeling, regardless of whether that loss was intended.
- **Smooth-near:** Still fairly dark, with restrained highlights on the cap, shoulder, and weapon.
- **Smooth-far:** Considerably stronger pale-blue/cyan highlights appear across top-facing surfaces and narrow edges. The material reads glossier or more strongly lit at “far” than “near,” rather than merely becoming a reduced-detail version.
- **Explicit-mask-blue-far:** Most of the figure becomes a brighter, more saturated blue—not just a small, clearly isolated region. From the image alone, the mask therefore reads as broad coverage or tinting. It would be speculative to call this mask leakage without knowing the intended mask.
- **Metal-near:** Very dark navy with minimal readable reflection. Large surfaces lose separation and read closer to dark painted material than obviously metallic material.
- **Metal-far:** Slightly more top-surface definition than metal-near, but it remains very dark. There is no clear environment reflection or sharp metallic highlight visible at this scale.
- **Explicit-mask-red-far:** Broad red/orange coverage over nearly the entire visible character, again with brighter top edges. It preserves somewhat more plane contrast than flat-normal-far, but does not visually communicate a narrowly localized mask.

### Repeating artifacts

- Diagonal weapon edges are jagged in every far example, with alternating one-pixel steps and occasional protruding pixels.
- Small extremities—weapon tips, head ornaments, hand/weapon junctions—change brightness enough to resemble stray pixels.
- Dark materials swallow joints between torso, arms, shield, and legs; bright explicit-mask examples reveal the silhouette better mainly through increased value contrast.
- Faint rectangular or horizontally smeared ground patches appear behind/below the left-column figures. They are most obvious beside the matte-near and smooth-near cells and remain faintly present in the metal-near cell. They look like coarse shadow/filter blocks rather than natural contact shadows.
- Broad horizontal background seams separate the three diagnostic rows. These are visible presentation/compositing boundaries, not character material behavior.
- None of the nine materials resolves the thin weapon cleanly. Higher brightness makes its stair-stepping more visible; darker materials make sections appear missing.