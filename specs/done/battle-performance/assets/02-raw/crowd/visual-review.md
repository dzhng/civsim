Fresh image-only critique. No reports or implementation read.

Target: recognizable intact riders, horses, infantry and held equipment; stable pose/coverage between paired captures; no isolated missing geometry or extra edge shimmer under the supplied small camera steps.

Verdict: visually tied within this narrow probe. Neither actual nor expected is visibly less wrong. All 8 static pairs and all 12 camera-step pairs retain matching model positions, poses, shields, weapons, limbs, and silhouettes at the supplied scale. No visible candidate-only missing rider, detached limb, pose corruption, or broad coverage regression.

Shared concerns:
- High confidence: mid and far-mesh torso surfaces have conspicuous pale triangular facets, with more angular shields and horses than full. Visible at native scale, clearer at 3x. This is present equally on both sides; the pictures cannot determine whether this is intended simplification or a shading problem.
- High confidence observation, conditional defect: the sample named corpse shows six upright units, apparently the same standing pose as full. It does not demonstrate a fallen corpse. The death image does show fallen horses/people. If corpse is meant to verify settled dead pose, evidence is missing; naming alone cannot establish a runtime bug.
- Medium confidence: thin weapons and silhouette edges step/change brightness across camera frames on both sides. No visibly greater sparkle on actual. This is a 12-frame frozen-pose camera probe, not real-time footage, so no claim about FPS, long-term shimmer, or animated skinning follows.

Measured pair differences: static RGB differs at 2–15 / 393216 pixels, maximum channel delta 25/255 (far-mesh); every static pair has identical nonblack occupancy and alpha. Motion RGB differs at 4–29 pixels per frame. Motion-10 contains one occupancy discrepancy at (271,159): actual RGB 0,0,0; expected 54,38,20. Motion-00 and motion-10 each contain one alpha discrepancy. Others have identical alpha. These isolated differences do not present a visible model defect in the inspected originals and crops, but images are not byte-identical.

Limits: six isolated units on transparency viewed against black; no terrain, shadows, crowds/occlusion, selection, or gameplay composition. Reviewed all pairs as full context sheets and all static 3x model crops, plus a matched 12-frame 3x rider contact sequence. GIF generated for human review, not claimed as watched playback.
