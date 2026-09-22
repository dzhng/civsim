# Campaign presentation checkpoint

Camera scale is stored in backing pixels, but the player's zoom and tilt must
not change with display density. The renderer converts pitch and maximum zoom
through CSS units; input handlers use its existing clamp. No second camera or
new application API is introduced.

The real-map interaction scene clicks a fixed pixel on Aguntum, chosen from the
existing landscape image independently of projection/picking code. At both DPR1
and DPR2, it selects the same city on a rendered surface at Z21.532245269333675.
Camera pose, projection and CSS framing agree. Both captures repeat exactly.
The focused camera/rig tests independently pass13/13. A separate Codex review
found no actionable defects in the camera, interaction scene or fault-control
ordering; it independently ran the two new camera tests. Neither code review
claims GPU or full-spec acceptance.

## Evidence and limits

[Integration repeat](integration-repeat.json) covers22 captures across production,
collision, LOD, traversal and raised-city interaction. Seventeen repeat exactly;
five LOD captures initially differ after label fault injection. Moving those
controls after all regression captures resolves that observer effect:
[isolated controls repeat](isolated-controls-repeat.json) passes all47 checks,
including all nine exact LOD captures and both missing-label controls. No
snapshot tolerance, classifier or coverage floor was relaxed. Together the two
runs supply exact repeats for all22 captures, not one all-green combined run.

The refreshed production fixture was intentionally made canonical lowland before
this pass; its flatter island does not demonstrate mountain grounding. See the
[fixture rationale](../../slice-14-production/remaining-acceptance/README.md).
Real regional/traversal images incorporate the accepted shelf material and
previous form/atmosphere changes. Old baseline copies were compared before
refresh; they were not used as the desired art direction.

Root inspected the final images. Independent visual review found matching
Aguntum framing, body, standard, ring, road and selection panel across DPR;
DPR2 is sharper. The production fixture retains both towns and presentation
controls. The regional natural view retains road/card/label relationships and
has better connected green ground. This accepts the camera/input checkpoint,
not the full landscape target. Thick white roads/rings, heavy fixture shadows,
angular grass edges, painted mountain patches and sparse overview vegetation
remain visible limitations. The traversal overview also exposes the map extent
and heavy distant haze; it proves residency/return, not final composition.

Raw-scale scenery/label thresholds and part of keyboard pan speed still need a
DPR audit. This change proves camera pose, projection, close zoom ceiling and
one actual raised-city click, not every density-dependent presentation policy.

## Change ledger

| Test | Previous behavior | Current behavior | Why |
| --- | --- | --- | --- |
| Campaign camera DPR tests | No equivalent regression | Same CSS zoom has the same pose/projected city and maximum zoom at DPR1/2 | Backing-pixel scale previously altered pitch and capped high-DPR zoom early |
| Raised-city interaction | Synthetic flat-island selection coverage only in this checkpoint | Fixed visible Aguntum pixel selects the actual raised city at both densities | Prevent a projection helper from choosing its own test stimulus |
| Campaign LOD fault controls | Temporarily hid/restored names before later snapshots | Same missing-owner/isolation/restoration checks after all screenshots | Avoid the controls changing subsequent DOM card paint |
| Campaign LOD/collision/traversal snapshots | Earlier terrain/presentation baselines | Current accepted shelf/form/atmosphere integration | Reconcile production output, with known quality limits retained |
| Production fixture snapshots | Earlier decorative bitmap class and camera framing | Canonical lowland fixture and corrected DPR camera | Pin the actual fixture contract, not accidental mountain classification |
