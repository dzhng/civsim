# Slice 06 — Camera: own army bottom; zoom-in to soldier eye level

**Contract:** (a) interactive battle open sets camera.yaw = -PI/2
(scene.ts:200-249 block) so team 0 reads at the BOTTOM (the review hook at
scene.ts:1592 already proves the bearing); Home-key reset (input.ts:204)
matches. (b) BATTLE_CURVE close endpoint becomes ABSOLUTE: distance ~10m at
vistaPitch ~0.24 -> eye ~2.4m at zoomT=1 (cameraRig.ts:53-63; keep the far
endpoint map-relative). Max-zoom framing must show soldier detail per
assets/ref-rome2-closeup.jpeg.

**Verify:** new focused scene battle-camera: shot at open (own blue line
bottom, red top) + shot at max zoom-in (eye just above helmet height,
soldiers detailed) + max zoom-out unchanged vs current. screenshot-critique
on both; input still clamps (clampView) sanely at the new floor.
