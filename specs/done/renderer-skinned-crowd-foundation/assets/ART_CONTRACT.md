# Soldier Art Contract

This is the contract for replacing generated placeholders with real art. The
renderer must work without these assets; this document tells artists what to
produce and tells the workbench what to validate.

## Required Pack Shape

```text
soldier-pack/
  manifest.json
  skeletons/
    human.glb
    horse.glb
  meshes/
    human/
      body_l0.glb
      body_l1.glb
      head_*.glb
      shield_*.glb
      weapon_*.glb
    horse/
      horse_l0.glb
      horse_l1.glb
  clips/
    human_idle.glb
    human_march.glb
    human_run.glb
    human_attack_*.glb
    human_hit_*.glb
    human_death_*.glb
    horse_idle.glb
    horse_walk.glb
    horse_canter.glb
  textures/
    *.albedo.png|ktx2
    *.normal.png|ktx2
    *.orm.png|ktx2
    *.faction-mask.png
  provenance.md
```

## Manifest Requirements

`manifest.json` names:

- skeleton ids and bone order
- clip ids, fps, frame count, looping/hold behavior
- mesh pieces and which skeleton they bind to
- LOD level per mesh
- material texture sets
- faction mask channel
- class/archetype assembly for every battle class
- license/provenance for every non-generated source

## Skeletons

- Human and horse skeletons have fixed bone names/order once accepted.
- All human body/equipment pieces bind to the human skeleton.
- Riders use the human skeleton; horses use the horse skeleton.
- Bone count/order changes are breaking changes and must fail validation until
  the runtime manifest and bake tests are updated deliberately.

## Clips

Minimum human clips:

- `idle`
- `march`
- `run`
- `attack_a`
- `hit_a`
- `death_a`
- `at_ease`

Minimum horse clips:

- `idle`
- `walk`
- `canter`

More variants are allowed only if the manifest names them and the bake remains
deterministic.

## Materials

Each material needs:

- albedo
- normal
- ORM: occlusion, roughness, metalness
- faction mask

Faction masks should mark accent areas only: crests, shield marks, sashes,
plumes, standards. Do not tint the entire body.

## LODs

Required at first:

- L0 hero/mid mesh
- L1 cheaper mesh

Later:

- L2 impostor source views
- L3 strategic sprite compatibility or replacement source

The workbench should preview every LOD and show transition screenshots.

## Validation

The workbench must report:

- missing required files
- invalid manifest references
- skeleton/bone-order mismatch
- mesh not bound to declared skeleton
- missing UVs/normals/tangents where required
- missing texture set or faction mask
- clip fps/frame mismatch
- non-deterministic bake output
- missing provenance/license

## Acceptance

An art pack is accepted when it passes validation, bakes reproducibly, previews
correctly in the workbench, and produces reviewed screenshots for body,
equipment, faction masks, clips, LODs, and mounted units.
