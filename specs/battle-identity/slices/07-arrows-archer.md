# Slice 07 — Arrows fly; archers draw and loose

**Contract:** (a) wasm exports projectile_z_ptr (game-wasm/src/lib.rs:319-332);
renderer draws arrows as elevated segments following flight z with a visible
size/contrast treatment at BOTH tactical and close zoom (scene.ts:1076-1090 —
zoom-aware width/length floor in screen px so they never vanish). (b) archer
fire cycle: sim per-soldier loosing ttl set at fire (missiles.rs:283, mirror
hit_ttl), wasm loosing_ptr, frame code in scene.ts:1308-1324, clip 'shoot'
(schema.ts, soldier-placeholders.mjs draw+loose using both arms, frameMap),
animationState.ts mapping, ANIMS entry in soldier-animation.mjs.

Sim state change (ttl) moves golden: re-pin once, deliberately, with a ledger
note. Mechanics walls must stay green otherwise.

**Verify:** NEW regression scene battle-arrows (David's explicit ask): archers
vs a target unit, frozen at a tick with arrows mid-flight, one shot ZOOMED IN
(arrows clearly visible as arced shafts) + one ZOOMED OUT (volley still
readable); write-anim GIF for the shoot cycle; screenshot-critique on both
shots; scripts/test-mechanics + golden re-pin; missile scenario tests green.
