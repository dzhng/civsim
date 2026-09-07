# Medium upright march candidate

Provisional authoring pass, not a production binding or acceptance verdict. This
walk is for the existing **held-hedge + atEase** appearance context. A walking
soldier is not automatically at ease: primary/forward-pike and sidearm contexts
remain separate. The donor's forward `pike-carry` action remains unchanged and is
not relabeled. No simulation, weapon state, speed, or runtime IK changed.

The editable source uses a nearly upright pike with the left purchase below the
right. Both connected arms reach the shaft; the shield remains fitted to the left
forearm and faces outward at the side. Restrained common torso motion moves the
carried assembly together, without independent shaft motion or finger sculpting.

The inherited lower-body walk is retained exactly: 0.9 seconds per cycle and
1.53 metres of review travel at the engine's 1.7 m/s walk floor. Medium's 0.9 pace
multiplier scales the above-walk range, not this floor. This pass authors the
upper-body carry; it does not claim a newly authored footfall solution. A measured
2.27 mm inherited sole penetration remains.

## Frozen-source controls

Input is the fitted medium source from commit
`82c05cbb2943f570f5d741be9fe1fa2f9170690a`, GLB SHA-256
`793568fa378a54cb983c9326b1f98bbb377b2e43fffb46a9908afa7656d5e3d6`.

All mesh position/index/normal/UV/weight data and rig nodes are exact. The exporter
introduced tiny drift in eleven tangent scalar values; only after proving the
other geometry attributes exact, donor tangent bytes were pinned in this local
motion-only comparison GLB. This is not a general exporter fallback.

`bend`, `bend-pronation`, `pike-carry`, `pronation`, `ready`, and `run` remain exact.
The donor has no `idle` action; none was fabricated. Source-level quarter-frame
sampling across the walk finds unchanged lower-body matrices, palm-to-shaft line
distance below 0.4 micrometres, minimum pike-butt height 11.2 cm, and outward shield
normal X above 0.998. Re-authoring the candidate produces only float-rounding
differences in exported walk channels (maximum 1.2e-7); non-walk clips remain exact.

## Review status

Five production battle-model films cover two cycles each: 36 frames at 20 fps,
with continuous 1.7 m/s world travel through the clip wrap. All 180 frames have
exact repeated `snapCheck` captures, and two formation stills do too: 544 checks,
none failed. The GIFs play at capture speed; corresponding ordered sheets contain
every frame, left-to-right then top-to-bottom. Full-resolution frames remain in
the candidate worktree's `throwaway/medium-walk/film/` directory. Supplemental
opposing whole-body/purchase views also passed exact repeated capture.

Author inspected all five ordered sequences and both formation views. The pike
tip and butt stay within the complete-weapon films and clear the floor; the shaft
and shield move together without a visible pop at either cycle boundary. The
stride alternates consistently. Opposing grip views show both purchases and the
left forearm shield mounting. The upper body is deliberately restrained and may
still read stiff; this remains a naturalness judgment for fresh eyes, not something
the exact-repeat or shaft-distance checks can settle. Independent critique judged
this provisionally usable, not final: the chest, crossing arms, shield and pike
read as a rigid ensemble; passing footfalls look flat. It found convincing
two-hand purchase and plausible straps, without definite collision or an obvious
seam snap. The main reviewer agreed about the rigidity. This version is archived
before a focused load-response revision.

Fresh visual review used installed bundled Codex CLI defaults, session
`01a07c9c-dfed-7761-a942-bb59b2dd327c`, terminal 0, all 180 tiles plus context.
The critic also flagged possible butt/raised-ankle proximity, not established
overlap. A subsequent 109-sample source-surface probe found a minimum sampled
distance of 17.75 mm, at source frame 22.75. Subtracting the butt triangle sampling
cell size gives a conservative 1.64 mm spatial lower bound at sampled times. This
rules out sampled contact, but the clearance is narrow and is not a continuous
collision proof; the revision should improve the margin.

Independent code review (bundled CLI, session
`01a07ca1-95d8-7dc0-ab75-cc5120a450f0`, terminal 0) found no actionable defects.
It checked Python syntax, JSON parsing and diff hygiene, without rerunning Blender.

Candidate editable sources remain local, not promoted. Blend SHA-256:
`38337c5074f4e9824d83b00a2d490e85b1155df5c0c45543ed9c7be5b10a6624`;
GLB SHA-256:
`5d6f307e42cb21ae48261aff87869ce3e100406dd60fd23f120654cd9d84f68d`.

The unsuccessful first upright placement is retained in scratch: it kept both old
forward-carry purchases and drove the long butt below the floor. The current
candidate changes the hand purchase arrangement, not the shaft independently.
