# Initial projected-detail comparison — no threshold change accepted

The production Three model workbench renders the same fixed camera, pose, light,
time and framebuffer for L0 and L1. An isolated in-page policy override selects
one representation and is restored afterward; normal production policy is not
edited. Twenty-four individual captures cover sword infantry (0), phalanx (3) and
shock cavalry (6) at canonical physical projected spans of 18, 32, 48 and 64 pixels.
This is the planner's standing-height metric, not a measured raster bounding box.

Each shot asserts its actual admitted main tier and exact frozen repeat pixels,
then passes through `snapCheck`. The contact sheet orders those three classes by
row and each size as an L0-left/L1-right pair. Magnified crops repeat original
pixels sixfold; they are not closer game cameras. `report.json` records the
cameras, clips, framebuffer and checks. Pixel deltas locate changes, not quality
scores. The override also affects shadow selection; these shots do not isolate
shadow quality and cannot accept the final default-shadow requirement.

The inspected ready-pose pilot rejects a blanket large increase in the L0
boundary. At 48–64 pixels the lower mesh visibly fragments blue armor into lighter
vertical shapes, particularly on the cavalry rider. The phalanx spear becomes
less continuous. Shields also become more angular under magnification. Broad
silhouettes survive, but a cheaper representation alone does not satisfy preserved
readability. At 18 pixels no reliable native-size difference was identified; at
32 pixels the shaft/torso differences already warrant caution.

A fresh visual reviewer, given only neutral paired images and crops, independently
identified those armor-value and spear-continuity differences. Both versions have
similar directional grounding in these stills. This is rejection evidence for a
blind threshold increase, not proof of motion stability or all-class equivalence.

Next investigate a better intermediate reduction from the existing authored
assembly, preserving rig, animation, material and thin equipment. Compare its
actual-size pixels before changing policy; then cover attack/death, every relevant
appearance and camera reversals. The old magnification technique that changes
camera and assumes the tier remains admitted must not be reused.
