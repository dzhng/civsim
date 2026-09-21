# Main crowd back-face culling — not adopted

A scratch-only ABABA diagnostic changes Three main crowd materials from DoubleSide
to FrontSide. Shadow materials, impostors, assets, geometry and the32/18/9/4 policy
remain unchanged. Tick9000/hash9928381812590497427, hardware Chrome,
1440×900CSS/DPR2, live rendering over paused combat. Each camera settles for5s,
resets audience histories, warms1s, then measures8s. Screenshots occur afterward.
Changing sidedness also changes generated shading; this is not a pure rasterizer
switch. Open surfaces may disappear, so the candidate cannot ship unconditionally.

WebGPU descriptor observation plus bounded actual `setPipeline` usage confirms
none→back→none→back→none culling on main-labelled pipelines, including cache reuse.
No observer drops/errors or pipeline compilation occurred during samples. Main and
shadow work, audience counts, consumed cameras and grass record hashes match.
The first A arm reports different grass triangle estimates in tactical/action
views despite identical record hashes; these cached CPU estimates are not emitted
indirect GPU counts. Do not treat those first pairs as proven whole-scene work
identity. The later return/candidate/return arms retain equal reported counts.

Observed GPU interval-union medians in milliseconds:

| View | A0 | B1 | A2 | B3 | A4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tactical |29.92|29.66|33.39|34.06|35.44|
| Action |28.74|29.46|33.18|33.08|33.49|
| Horizon |31.55|31.27|36.12|36.79|35.70|
| Wide |23.42|24.79|26.60|28.34|25.86|

The second candidate fails to beat both adjacent controls in most dense views;
wide timing worsens. Drift and uncalibrated observer overhead prohibit a causal
slowdown percentage, and no full quiet-host audit was acquired. The experiment
establishes no repeatable material gain, so production sidedness is unchanged.
It does not prove vertex processing alone is the bottleneck.

The raw compressed report preserves submissions, missing timing coverage, actual
pipeline observations, work and material-side checks. The two retained tactical
images are representative diagnostic captures, not frozen matched-time visual
acceptance; other images remain beside the original scratch report. Root inspected
one candidate for gross content loss. No all-roster/animation quality verdict is
claimed and no visual acceptance work is needed to reject this optimization.
