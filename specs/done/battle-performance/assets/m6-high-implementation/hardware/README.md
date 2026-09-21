# High hardware checkpoint — readability remains open

Root merged39 focused shadow/scene tests,28 live tests and full web TypeScript
pass. Six fixed controls build at51819eef. Hardware Chrome single-shadow sampling
and resize/failure lifecycle controls pass. Both1x/4x full-frame reports are exactly
equal to pre-High M1b controls, including all strict image failures. The complete
terrain reports also reproduce exactly against an immediate pre-High ca9b13ac build:
all18 source/actual image pairs and comparison metrics, failed/pending replacement
retention, cancellation and zero resources. Their strict numerical verdict remains
red. This pass neither caused nor waived those failures.

The eight-checkpoint full scene has matching audiences and no GPU/page errors or
remaining tracked buffers/textures. Seven actual captures are pixel-exact to the
M1b promoted build; tactical-initial differs one pixel by one code value, within
the previously documented initial-frame variability. These are pre/post controls,
not source/raw image equivalence or final performance acceptance.

The actual raw Menu build boots single/High/off using the public atlas, moves the
camera to four diagnostic views, resizes and disposes. All three run without page
errors and leave zero tracked allocations. High reports two2048 depth layers,
32MiB, two caster-camera buffers and208 receiver bytes; single reports one1024
layer/4MiB, off allocates no sun depth resources. This proves resource/route wiring
and real WGSL execution. It does not prove slow/fast input cadence, crossing fade
accuracy, moving-troop quality, environment changes or GPU cost. HUD FPS in these
frozen diagnostic captures is not a timing result.

Root inspected tactical and wide captures. Fresh unprimed critique reports faint
foot darkening that is hard to distinguish from grass; no clear floating feet or
large incorrect shadows, but directional grounding remains weak. Wide/reverse
views expose abrupt rectangular terrain/coast bands, haze compresses distant
contrast, and dense troops merge into colored patterns. No obvious cascade seam
is established by these stills. The requested readable-shadow and moving-camera
outcomes remain open; do not call them fixed from this checkpoint.


The follow-up on/off/High pair holds tick30 and the same authoritative state hash
15927906182668164452. It confirms shadow presence at the actual tactical camera,
not sufficient readability: default single darkens the whole battlefield crop by
0.89 RGB code values on average, the foreground-feet strip by1.47; High gives0.66
and2.56 respectively. Exact crop coordinates and absolute differences are in
shadow-pair/contrast.json.gz. These broad strips include bodies and background,
so this is a presence diagnostic, not a per-shadow contrast metric or acceptance
threshold. All modes have the same state; no FPS conclusion follows frozen images.
