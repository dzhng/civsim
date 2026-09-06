# Production prototype cutover

## Target and comparison

The benchmark must retain two opposing formations, identical placement/cameras and
foliage, and all 30,400 soldiers at full detail while using the real production
asset/skin/material owner. This is infrastructure acceptance, not finished art.

Matched mid-camera images use viewport 1100×700, canvas 790×658, time 0.6 and
identical seeds. The shared material and phase sampler replace the private shader:
the measured first run changes **60,971 pixels
(11.7293%)**. Grayscale MAE 14.285, distance 0.29473, edge energy ratio 1.90245.
The terrain is retained; stronger formation contrast accounts for the important
visible difference. No material shader semantics were changed in this pass.

Fresh unprimed review inspected both full images and 3× soldier crops. It found
clearer ranks in the candidate, reduced army-color separation, repeated pixel-grid
patterns in both, and no obvious missing formations/trees. Terrain and scale
appear unchanged. Individual anatomy/equipment cannot be judged at this framing.
Accept the production-path cutover; retain color readability and blocky model
fidelity as quality work, not a reason to preserve a second material implementation.

## Verification

- Typecheck passes after integrating the candidate UI's old-route removal.
- Material tests: 5/5 pass; RGB masks and PBR responses unchanged.
- Source producer and placeholder tests pass: 20 appearances, 2,058,336 posed
  vertices within bounds; source oracle maximum error below 0.00000044 m.
- Placeholder deterministic check passes without regenerating any bundle bytes.
- Hardware substrate retains 30,400 L0 soldiers, 200,000 grass blades, 3,000 trees:
  median rAF 16.665 ms, GPU 5.546706 ms in the final run, seven draws; both remain below 33 ms.
- Final SwiftShader scene passes: mid baseline zero differing pixels, mid and
  vista repeats byte-identical (629,468 / 594,613 bytes respectively). Unchanged
  PBR baseline remains within its existing tolerance (900 pixels, 0.1731%); it
  was not re-blessed. Both software and hardware check reports are retained.

## Change ledger

| Test | Previous behavior | New behavior | Why |
| --- | --- | --- | --- |
| soldierAssetLoad.test: uint32 | Old stride-11 loader retains indices 65535–65537 | Removed obsolete-loader test; canonical loader and source primitive-merge tests retain wide-index coverage | Last old reader removed, not index-width support. **moved** |
| soldierMaterials: identity | Takes kit channel/class metadata, asserts heavy-sword class name | Publishes its actual canonical channels; no stale kit class map | Diagnostic identity no longer depends on deleted manifest. Color/PBR tests remain intact. **moved** |
| soldier-placeholders.test | Compares bundle metadata against generated kit.archetypes | Compares against minimal authoring registry and asserts no kit.json output | One generated catalog; all existing mesh/animation/bounds assertions unchanged. **moved** |
| gltf.test | Fixture clips named REQUIRED_HUMAN_CLIP_NAMES | Same values named TEST_CLIP_NAMES | Fixture vocabulary no longer claims universal production requirements. Assertions unchanged. **moved** |
| substrate mid count check | Count floors only | Same floors plus production owner identity, actual IDs 0–19 and 30,400 visible L0 | Prevents a separate, incomplete or reduced-detail path from satisfying benchmark. **moved** |
| substrate nonblank | Bright pixels exceed 40% | Same threshold plus luminance variance >4 | Rejects a flat-color false green observed in a software vista capture. **moved** |
| substrate mid snapshot | Private shader rendering | Shared production shader rendering | Intentional owner cutover; 33 ms limits unchanged. **moved** |

No class statistics, balance, sim physics, or source art changed.

The deleted validate.ts had no surviving standalone unit-test file. Its old UI
consumers were removed by the candidate-workbench pass. Retired behavior includes
kit schema/provenance/piece/channel warnings, a hardcoded required-human-clip list,
and the old 256-bone validator ceiling. These rules are not silently advertised as
preserved: importer structural validation and complete-bundle validation are the
current owners, while full-battle required-clip admission is a separate integration
check noted below. RigBone, RigClip and ImportedRig are retained unchanged in rig.ts.

## Independent code review disposition

- Fixed the circular completeness assertion: publish the actual loaded appearance
  IDs and assert the complete benchmark roster, rather than trusting only a label.
- Runtime clip admission: reported to the parent integration owner. Diagnostic
  candidates intentionally may have a smaller vocabulary; full-battle admission
  must reject missing required clips before simulation playback.
- Scalar material factors not yet bound in production: known slice04 work. Source
  transport is preserved, but this pass does not claim authored material parity.
- Suggested material identity rename rejected: the shader still is the placeholder
  RGB-mask PBR implementation. Renaming it before replacing that shader would make
  telemetry less truthful. Its identity changes with the material work, not merely
  with deletion of the legacy kit reader.

## Choices for integration

- **Sound, high confidence:** retain a full-detail submission without culling in
  this benchmark. Letting the production visibility system reduce the workload
  would make the old performance number incomparable. Actual battle visibility
  continues to use its normal production policy.
- **Sound, high confidence:** remove old kit files and validators, retain actual
  local-rig types in rig.ts. When a candidate fails, the importer/bundle loader
  reports the failure; there is no second old validator with conflicting rules.
- **Sound, medium confidence:** drive benchmark march from the declared duration
  and production phase owner. This gives the same animation semantics as battle
  instead of preserving the private shader's rounded frame timing.
- **Sound, medium confidence:** require minimal image variance as well as bright
  pixels. A uniformly lit empty canvas must not satisfy a rendered-content gate;
  this supplements rather than relaxes snapshots and workload assertions.

Deleted legacy files remain recoverable in Git. External research inputs were
left intact. Parent-owned production renderer/loader verification copies are not
part of this commit.
