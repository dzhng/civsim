# Raised glyph label checkpoint

The renderer-neutral [label frame](../../../../packages/game-renderer/src/campaign/labelFrame.ts)
owns the existing atlas, visibility, hierarchy and collision arbitration. The
physical layer consumes its accepted screen anchors and glyph quads in the
world's existing canvas. The raw pass retains its original world-anchor shader
and cache quantization. Label types no longer belong to that raw GPU pass.

Projection comes from the campaign world's canonical pose and presented surface.
Sea anchors remain at water height. Camera movement, resize and terrain replacement
invalidate physical screen quads through exact projected coordinates and viewport
size. Card rectangles remain CSS pixels; the shared layout scales them alongside
glyphs for DPR. World labels deliberately bypass terrain depth, while models and
standards keep their existing depth semantics.

The [fixture](../../../../web/scenes/campaign/campaign-raised-labels.mjs) exercises
city/army ink at DPR1 and DPR2, compares glyph-on/off pixels inside accepted ink,
culls against a card rectangle, replaces the army's terrain, resizes, toggles fog,
and recreates the world with a single canvas. It waits for Cinzel before measuring.
Fixture names use existing below-anchor placement inputs to clear exaggerated
models; production label generators and their offsets are unchanged.

The [DPR1](../../../../web/shots/campaign/campaign-raised-labels-dpr1.png) and
[DPR2](../../../../web/shots/campaign/campaign-raised-labels-dpr2.png) captures
are SwiftShader correctness evidence. The raised tile moves accepted army ink
up by 33.174 CSS pixels at both DPRs. Readability and corresponding placement
are retained; DPR2 has clearer small lettering. No terrain/model art changed.

This is a bounded adoption checkpoint, not production cutover or complete slice12
acceptance. Full real-map sea/faction fitting, actual DOM card integration and
application interaction still need the complete physical campaign presentation.
The existing fitter and occupancy policy remain single-sourced and unchanged.
Raw campaign-collision could not boot in this sparse test worktree (initial
symlink asset403, later readiness stall); no raw baselines were changed. Run the
raw controls in the full integration checkout.

Review extracted one shared owner instead of duplicating layout. Independent
code review caught screen-quad backface culling; the physical material now draws
both sides in one pass. Atlas and geometry resources are released on replacement
and disposal. TypeScript and the focused projection/camera tests pass. The broad
web run's two missing sparse-fixture failures pass when rerun with those files
available. No existing test expectations were changed; new checks pin raised
projection and the glyph layer lifecycle.

Final strict repeats have zero differing pixels at both DPRs. The final unprimed
critique found all names complete and readable, without clipping or text/model
collisions. It noted softer DPR1 lettering and the rear label's distance below a
terrain-occluded banner. That latter relationship follows the ground-anchor
fixture and deliberate screen-overlay semantics; it is not glyph damage or a
reason to flatten terrain or move the shared projection.
