# Incoming skeleton candidates (not yet accepted)

Downloaded 2026-07-13, validated end-to-end through `bake/gltf.mjs`
(deterministic bake confirmed, all contract-required clips present via
`clipNames` mapping). Nothing here ships yet — acceptance per
`specs/done/renderer-skinned-crowd-foundation/assets/ART_CONTRACT.md`.

## Human: Quaternius Universal Animation Library (standard/free tier)

- Files: `AnimationLibrary.gltf` + `AnimationLibrary_Godot_Standard.bin`
  (Godot-flavor glTF; embed the bin or convert to .glb before the workbench —
  the importer rejects external buffers by contract)
- Source: https://quaternius.com/packs/universalanimationlibrary.html via the
  glTF-only mirror https://github.com/J-Ponzo/gltf-universal-animation-library
- License: CC0 1.0 (redistributable; mirror repo carries CC0-1.0 LICENSE)
- Rig: 1 skin, 53 joints, Blender Rigify `DEF-*` bone names, inverse binds
  present. Includes a skinned `Mannequin` base mesh (2 primitives).
- Baked: 142x212 VAT (`human-ual.vat.json`), fps 12, skeleton id
  `ual-rigify-human`
- clipNames map used:
  `Idle_Loop→idle, Walk_Formal_Loop→march, Jog_Fwd_Loop→run,
  Sword_Attack→attack_a, Hit_Chest→hit_a, Spell_Simple_Shoot→shoot,
  Death01→death_a, Sword_Idle→at_ease`
- KNOWN GAP: no bow/archery clip in any free tier (UAL1 or UAL2) —
  `shoot` is mapped from `Spell_Simple_Shoot` as a stand-in. A real bow-draw
  clip must be authored on this rig (Blender) or sourced separately.

## Horse: Quaternius (Ultimate Animated Animal Pack)

- Files: `horse-qvTrSG9pZF.glb` (brown), `whitehorse-bEdE4rmZy9.glb` (white,
  same rig/clips, not baked)
- Source: https://poly.pizza/m/qvTrSG9pZF and https://poly.pizza/m/bEdE4rmZy9
  (pack page: https://quaternius.com/packs/ultimateanimatedanimals.html)
- License: CC0 1.0
- Rig: 1 skin, 50 joints (`AnimalArmature`), inverse binds present, mesh +
  clips in one glb. Extra clips available beyond contract: Death,
  Attack_Headbutt/Kick, HitReact L/R, Eating, Gallop_Jump.
- Baked: 64x200 VAT (`horse-quaternius.vat.json`), fps 12, skeleton id
  `quaternius-horse`
- clipNames map used: `Idle→idle, Walk→walk, Gallop→canter`
- Note: the glb carries duplicate `AnimalArmature|*`-prefixed clips; filter
  animations to the mapped ones before baking.

## Rejected alternative

- Mixamo (Adobe): best clip library, but raw files cannot be redistributed in
  a public repository — fails the provenance/license requirement.
