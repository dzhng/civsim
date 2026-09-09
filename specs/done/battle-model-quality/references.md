# Reference provenance

## The user's visual target

The user-supplied [Rome II phalanx-versus-heavy screenshot](assets/reference-rome2-phalanx-vs-heavy.png)
defines the direction: natural anatomy, rounded helmets and shields, credible
grips, layered leather/cloth versus mail, material-specific light response and
grounded figures at gameplay distance. It is not an exact AAA fidelity promise.
The user's identification of medium phalanx with leather armor and heavy
infantry with mail takes precedence over older Bronze-Age aesthetics guidance.

The foreground and central figures supplied body, helmet, hand and armor
references. Occlusion limits what the still can establish: hidden feet and
hands are not evidence of anatomy, and a still cannot prove motion or contact.
Reference images inform locally authored design; no commercial mesh or texture
is extracted into the game.

## Inspected supplementary stills

The [official Steam gallery](https://store.steampowered.com/app/214950/Total_War_ROME_II__Emperor_Edition/)
was checked through its app screenshot listing on 2026-09-07. Two original
1920×1080 promotional images are retained as supplementary references:

- [Infantry melee](assets/references/steam/infantry-melee.jpg), gallery image 0,
  key `b4ea26bb6fbe4625119fdb1fa48fda313b700b2d`: shoulder reinforcement,
  belted mail, hanging lower armor and raised hand/grip form. Nearby overlapping
  scales are a different surface, not the mail target.
- [Linen layers and shield grip](assets/references/steam/linen-shield-grip.jpg),
  gallery image 1, key `ee35fcc92bddeacb5c0468f1a71c6054639a6fdc`: shoulder
  panels, skirt overlap, shield straps and spear grip from the back.

These are not matched-lighting comparisons, isolated anatomy, named-unit
identification or motion evidence. They supplement the primary reference
without changing its heavy-mail/medium-leather direction.

The [official unit spotlights](https://wiki.totalwar.com/w/Unit_Spotlight_(TWR2).html),
[Rome II gallery](https://www.gamestar.de/galerien/total_war_rome_2,95215.html) and
[Nomadic Tribes gallery](https://www.nuuvem.com/br-pt/item/total-war-rome-ii-nomadic-tribes-culture-pack)
remain discovered leads, not accepted angle or motion evidence.

## Technical provenance

The [Khronos glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
informs the import contract; the project's supported authored subset is narrower
than the standard. The [versioned Three skinning example](https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/webgpu_skinning.html),
[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) and
[SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html) informed independent
export fixtures, not a replacement product renderer or an imported character.
The [Blender exporter manual](https://docs.blender.org/manual/en/5.0/addons/import_export/scene_gltf2.html)
is background guidance; actual installed-exporter behavior and retained
reproduction evidence take precedence over assumed online defaults.

Standards and reference code explain intent. Real export, loader, deformation,
surface and capture tests establish the project's behavior.
