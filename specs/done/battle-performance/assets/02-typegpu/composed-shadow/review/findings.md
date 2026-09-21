Fresh visual review of saved PNGs only

Target: Twelve standing soldiers should remain present in the same framing, with shadows on the ground meeting their feet, consistent direction across the group, and consistent placement when the same tactical view repeats. A shadow toggle should change shadowing without moving or removing the soldiers.

Verdict: Actual is less wrong on repeat consistency; the initial tactical-plain expected image is visibly inconsistent with its own repeat. This is a bounded acceptance of the supplied still control, not full renderer acceptance.

Findings:
- HIGH confidence, full image and 4x crops: For BOTH ports at BOTH sample counts, initial tactical-plain expected shadows extend left; actual shadows extend right. Repeated tactical-plain expected shadows extend right, aligning with actual. The soldier arrangement and framing do not move. The initial expected is therefore not a valid sole visual oracle for consistent shadow placement. Images alone do not establish the light's absolute intended world-space direction.
- HIGH confidence, full and crop: The actual shadow-on images retain all 12 soldiers visible in the tactical framing, shields and weapons, ground texture, and sky. Shadow-off retains these contents and removes the long dark ground streaks. No obvious missing-model or foreground/ground ordering defect is visible. Horizon has strong row occlusion, so tactical is the reliable count view.
- MEDIUM confidence, crop: Actual shadows meet the foot region without an obvious detached gap or raised shadow plane in both tactical and horizon views. They extend consistently screen-right. Dark contact is subtle and individual shapes merge into long bands; these small soft/dithered shadows do not prove exact foot contact to subpixel precision.
- HIGH confidence, crop: Shadows have visible stippled/checkered edges and thin weapon/leg silhouettes stair-step at samples-1. Samples-4 smooths silhouettes but shadow stippling remains. This is a visible quality limitation shared across compared shots, not a demonstrated newly introduced port regression.
- HIGH confidence: Repeat actual bloom images are pixel-identical at both sample counts; repeat actual plain is identical at samples-4. Samples-1 plain has minor pixel changes, with no visually apparent shadow-direction or content change.

Metrics, independently computed from PNG RGB (768x512 = 393216 pixels), grayscale Rec.601:
- Actual vs expected, initial tactical-plain: 17144–17167 changed pixels (4.36–4.37%); grayscale MAE 0.33605–0.33762 /255. This locates a meaningful shadow-position mismatch despite small full-frame MAE.
- Other 20 shadow-on actual/expected pairs: only 233–333 changed pixels; grayscale MAE 0.000158–0.000485 /255.
- Actual initial/repeat samples-1 plain: TypeGPU 788 changed pixels, grayscale MAE 0.002115; vgpu 821, MAE 0.002302. Six other actual-repeat pairs have zero RGB differences.
- Expected initial/repeat plain: samples-1 16250 changed pixels, MAE 0.335446; samples-4 16933, MAE 0.335897, identical metrics across ports. This independently demonstrates the expected sequence's shadow change.
- Actual on/off tactical: 19047 pixels at samples-1 and 19673 at samples-4 change; grayscale MAE about 0.4882 and 0.4907. Horizon: 2538/2837 pixels change, MAE 0.06482/0.06713. Toggle is materially visible.

Limits: No browser, GPU, animation, runtime data, report assertions, or source implementation inspected. These are twelve-soldier still controls on a flat limited ground plane: no claim about performance, full-world terrain, moving casters, temporal shimmer, formations at scale, selection overlays, props, water, or complete production composition. Camera/data match is judged visually, not proven from capture metadata.

Artifacts: metrics.json and extra.json contain per-pair measurements; *-tactical.png and *-horizon.png are actual/expected/off full comparisons, *-crop.png enlarged comparisons, and *-feet.png 4x contact crops. Scripts and artifacts are only in /tmp/receiver-ports-eyes; no repository edits.
