# Refitted helmet on the current heavy assembly

Retain the smaller open helmet as a bounded fitting improvement, not acceptance
of the whole model, anatomy or asset budget. The [isolated helmet study](../helmet-refit/review.md)
owns the source diagnosis,448 sampled fit checks, rejected attachment trials and
independent source review. Root integrated only its helmet construction from
`c9b541db`, then rebuilt with the current locally baked mail and existing garments,
scabbard and footwear. No frozen older equipment bundle was transplanted.

Combined source GLB SHA256 is
`17410d045549c86fec783a3065b22367c5f6d1ef16e37104d064d130fabccdc9`.
The candidate increases from85,652 to88,888 triangles; all three provisional tiers
remain identical and unadmitted. The production catalog is unchanged.

## Controls and production evidence

[Source controls](source-controls.json) compare the actual previous and rebuilt
GLBs through the existing importer. Rig and animation are exact. Every non-bronze
primitive retains its positions, normals, UVs, colors, bone indices, weights and
triangle topology. Three skin and eight leather tangent components differ by at
most0.000100017 after export; these are disclosed, not called byte-identical.
The material and texture bundles do not change. The bronze primitive includes
the changed helmet; the isolated editable-source controls establish that its
other equipment parts remain unchanged. The [exact bake check](bake-check.log)
and web typecheck pass.

Unfiltered production run34432 uses
`VERIFY_GPU=1 VERIFY_URL=http://localhost:5174 node web/scene.mjs heavy-kit`
against the verified root worktree server. [Report](capture.json) and [log](capture.log)
record646 checks:634 passes, twelve expected comparisons against older unaccepted
images, and no page errors. All316 submitted pose views and their fresh frozen
repeats pass. No baseline is blessed or threshold changed. The full run also
verifies that the independently committed snapshot-selection improvement preserves
default coverage.

Against the same-framed prior combined-mail images, raw RGBA changes are128,099
pixels in [head detail](head.png),12,226 in [close](close.png),6,009 in [ready](ready.png)
and11,835 in [gameplay pitch](gameplay-pitch.png). This proves the helmet reaches
the production renderer, not merely the Blender source.

## Visual review

Root inspected the static views and all eight sequential bearing grids covering
28 walk and25 run phases. The smaller bowl stays with the head throughout the
sampled poses; the cheek guards retain a coherent plate silhouette. The
[walk](walk-frames.png), [run](run-frames.png), [formation](formation.png) and
[gameplay formation](formation-gameplay.png) preserve whole-model context.
Looping [walk](walk-realtime.gif) and [run](run-realtime.gif) derivatives preserve
the existing pace; this fitting pass does not establish motion rhythm acceptance.

An unprimed static reviewer independently preferred this combination with high
confidence: the previous bowl hid the eyes and read as an oversized bell; the
new rim exposes them, while the guards read as thick curved plates rather than
pointed flaps. No clear detached helmet appears. Fine hinge/contact detail is
not established by these images, and gameplay-scale differences are subtle.
The separate isolated reviewer noted slightly appliquéd-looking guard edges;
that polish concern remains open rather than being hidden by a fit claim.

The final independent reviewer inspected all53 native four-view phase sheets in
order and both formations. It found no visible floating gap, sliding rim, missing
guard, scalp breakthrough or helmet/equipment collision. Gross alignment is
high-confidence evidence; fine cheek contact is below useful inspection size in
the full-body frames. This establishes sampled pose compatibility, not complete
animation or model acceptance. The source fitting and sampled
collision checks are not a continuous-clearance guarantee. The body, shirt-like
garment and grips remain unfinished; the next coherent garment and local hand
reconstruction passes must be reviewed on this combined source before promotion.

Root's shape/diff/docs review retains the existing Blender surface owner,
head binding and single production asset/material path. Independent source
review found no concrete defect; unavailable CLI review is explicitly recorded
in the isolated study. Fitting offsets and crown/rim proportions are reversible
authoring discretion within the delegated helmet task, not a new universal
collision policy. No simulation, clip, test behavior or acceptance gate changes.

The non-blocking Preview checkpoint showed the combined head, prior head and
combined ready pose. No feedback arrived within the review window; retain the
bounded fitting improvement on the independent evidence above, not presumed
user approval. Preview had no open documents when checked afterward. Whole-model
acceptance remains open.
