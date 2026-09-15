# Screen-label atmosphere control

Disabling atmosphere on the screen-label material improves letter outlines, but
does not restore the old brightness gate. This is a verified partial correction,
not complete label acceptance. No baseline or assertion changed in this audit.

The candidate changes only CampaignLabelLayer.material.fog to false, with a
comment explaining the screen/world-coordinate boundary. Runtime campaign,
physical renderer and terrain sources otherwise match the control. Both use the
same WASM hash and pinned patched Three 0.185.1.

## Matched evidence

The normal new campaign repeats campaign-lod's three whole-map stops before the
regional-natural pose: 1280x800, DPR1, paused Day1, time 0, cam(-430,445,3),political and
fog-of-war disabled, no selection. The [before frame](before.png) is byte-identical
to the immutable first-pass image. The candidate [fog-off frame](fog-off.png)
changes 7,424 pixels, all inside the reported city-label boxes. Label rectangles,
city body rectangles and WASM bytes remain identical. The candidate [repeat](fog-off-repeat.png)
has zero different decoded pixels. The [report](report.json) records the controls.

| Existing brightness metric | Before | Atmosphere off |
|---|---:|---:|
| Passing white pixels |134|134|
| Eligible pixels |977,920|977,920|
| White ratio |0.000137|0.000137|
| Existing minimum |0.002|0.002|

Glyph highlight samples move only from roughly RGB (198,196,191) to (200,199,196).
Changes reach 58 channel levels primarily at the outline. The original 0.002 gate
remains red and unchanged.

Fresh unprimed review of both full frames and [three crop pairs](crops/) prefers
B (atmosphere off): darker edges separate Corfinium, Spoletium and Aesernia from
roads and varying ground. Confidence is high in the crops, moderate at full-frame
scale; the improvement is subtle and does not change prominence materially. Direct
inspection agrees. The existing small/soft lettering still limits quick scanning.

## Remaining tone-map boundary

The label material also sets toneMapped=false. The pinned Three Material source
explicitly documents that this property is ignored by WebGPURenderer; its output
pass grades all materials. PhotorealWorld selects AgX at that global output.
Consequently the flag does not guarantee that the near-white canvas ink reaches
the display unchanged. This explains why atmosphere removal can improve the halo
without recovering bright ink; an isolated output/grade control is still needed
before choosing a complete fix or re-deriving the brightness oracle. Increasing
atlas colors to compensate has not been tested or proposed as acceptance.

The candidate's first navigation failed before rendering because Vite had cached
an initially missing portrait-manifest import. It produced no candidate image and
was discarded. After restarting that server, the transform and imported JSON
returned 200; both valid candidate captures have zero page errors. The already
byte-exact before frame was reused unchanged. This setup failure is not a shader
or gameplay result.
