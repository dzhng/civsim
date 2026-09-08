# Original heavy-infantry timeline

Reference for the pure-performance contact pass, captured on 2026-09-09
before simulation edits. Simulation source is `2bef8193`; the serving
worktree adds only the forwarding `Game::state_hash` export. The rebuilt
wasm, bundled headless Chromium, SwiftShader, existing `heavy-both` fixture,
and its fixed simulation clock define the comparison. Renderer code and
capture tolerances are unchanged.

Run: `VERIFY_GPU=1 VERIFY_URL=http://localhost:5179 NAME=heavy-both ATK=0 DEF=0 POSTURE=both node web/vibe/duel-posture.mjs`.

The timeline completes normally in 18 frames, through 340 simulation
seconds. The existing committed July reference already differs: 16 frames
fail its pixel comparison (40s onward); the first two pass the existing
vibe tolerance with 27,683 and 48,273 differing pixels. This is a reference
failure set, not a new regression and not a re-bless. The process exits 16.
Loaded-machine screenshot timeouts did not occur in this run. Timings from
this capture are not performance evidence.

[Original timeline](heavy-both-original.gif). Every frame was inspected in
chronological order; the observations below describe the captured state,
not a claim that performance work has changed or improved the fight.

| Time (s) | Living A / B | Fighting A / B | Observed frame |
|---|---|---|---|
| 0 | 240 / 240 | 0 / 0 | Two intact formations begin far apart. |
| 20 | 240 / 240 | 0 / 0 | Both advance; ranks loosen before contact. |
| 40 | 239 / 236 | 128 / 118 | The lines meet in a broad dense front. |
| 60 | 233 / 228 | 113 / 120 | The front bends into two shoulders around the center. |
| 80 | 228 / 221 | 100 / 100 | The curved front holds while both sides lose men. |
| 100 | 222 / 214 | 104 / 103 | The center thins between the two shoulders. |
| 120 | 218 / 206 | 105 / 100 | A broad curved front continues to fight. |
| 140 | 213 / 198 | 95 / 88 | The central gap deepens; both wings remain engaged. |
| 160 | 209 / 186 | 96 / 95 | The wings contract toward the remaining center. |
| 180 | 206 / 176 | 98 / 86 | The front becomes a shallower arc. |
| 200 | 192 / 167 | 92 / 94 | The left shoulder grows ragged while the right remains dense. |
| 220 | 183 / 151 | 88 / 84 | Both sides continue grinding across the narrowing front. |
| 240 | 173 / 134 | 93 / 82 | The surviving front is noticeably narrower. |
| 260 | 146 / 100 | 70 / 73 | Casualties leave a shallow band of standing soldiers. |
| 280 | 121 / 79 | 61 / 53 | Standing ranks thin above the field of fallen bodies. |
| 300 | 99 / 56 | 54 / 41 | Small groups remain; the continuous front breaks up. |
| 320 | 80 / 36 | 34 / 0 | The northern force withdraws while the southern survivors remain. |
| 340 | 80 / 34 | 0 / 0 | The southern survivors reform; the battle reports team 0 victorious. |
