---
name: aesthetics
description: The visual north star for civsim's battle and campaign rendering: a Bronze-Age Aegean / Total War Saga look. Use when adding or changing terrain, sky, lighting, water, models, labels, icons, faction fills, colors, or any visual surface; when a render looks off; or when choosing new visual constants.
---

# Aesthetics — the Bronze-Age Aegean look

Civsim is going for the **Total War Saga: Troy** look: sun-drenched Mediterranean
warmth on the battlefield, an antique painted-chart feel on the campaign map. The
images in `references/` are the north star — **open them with the Read tool and
judge your render against them**, the same way `screenshot-regression` makes you
look at the actual PNG before claiming a visual change is done. A green snapshot
proves *unchanged*, never *good*; these references are how you decide *good*.

This skill is taste guidance, not an implementation map. Do not preserve stale
file paths, line numbers, current constants, or one-off bug notes here. Put
task-specific implementation notes in the active spec.

## The reference images

Battle (Total War Saga: Troy):
- `references/battle-coastal-vista.jpg` — the master shot. Golden-hour sun low over
  a calm sea, hazy headland in the distance, two armies as dense dark blocks on
  sun-bleached olive grass. Note the **aerial perspective**: everything far reads
  warm-grey/blue and low-contrast; everything near is warm and saturated.
- `references/battle-advance-coast.jpg` — formations advancing along a beach;
  cypress-topped acropolis on a headland, soft hazy horizon, warm tan sand meeting
  pale-blue shallows.
- `references/battle-formations-melee.jpg` — gameplay framing: lush summer grass,
  units locked in melee, **gold selection glow** boxing the player's selected
  units, corpses littering trampled ground.

Campaign (grand-strategy map):
- `references/campaign-map-aegean-wide.png` — the painted parchment overview. Muted
  green/tan land, slate-blue sea, **wispy cloud vignette framing the edges**,
  engraved serif city labels, italic sea names following the water.
- `references/campaign-map-political-borders.png` — zoomed political view. Faction
  territory as **translucent color washes**; the active/aggressor faction's land
  carries a **diagonal hatch** (the red stripes over Macedon). Cinzel-caps city
  names, region names in larger faded caps.

## Battle — the seven rules

The battlefield should read as a warm, hazy, high-key Mediterranean place, not a
dark diorama.

1. **Give it a sky and a horizon.** Use a pale gold-to-blue sky, distance haze,
   and aerial perspective so far terrain and sea fade into the horizon.
2. **Warm the sun, lift the shadows.** Favor warm key light and cool sky fill.
   Keep battles bright and legible; avoid moody near-black contrast.
3. **Grass is sun-bleached olive, not cool meadow-green.** Bias grass and scrub
   toward dry yellow-olive Aegean summer. Small wildflowers are welcome as sparse
   detail, not confetti.
4. **The sea sells the setting.** Coastal battle water should grade tan sand to
   pale turquoise shallows to deeper blue, with glint, foam, and horizon haze.
5. **Trampled ground and corpses are part of the look.** Fighting should leave
   churned earth, dust, contact shadows, and bodies where melee has happened.
6. **Selection is a warm gold glow, never a hard outline.** The references box
   selected units in a soft yellow footprint glow. Match that hue/softness; don't
   draw a crisp UI rectangle that breaks the diegetic feel.
7. **Scenery is sparse and Mediterranean.** Prefer cypress/olive silhouettes,
   rocks, scrub, and headland/acropolis clustering. Keep open ground open.

Soldier materials should stay warm and tactile: bronze, iron, linen, leather, and
earth tones. Team accents must stay recognizable at gameplay zoom.

## Campaign — the antique chart

The campaign map is already close to the references — this is mostly *preserve and
sharpen*, not rebuild. The painted/parchment quality, not satellite literalism, is
the whole point.

- **Land & sea palette.** Muted greens, tan highlands, soft sand, olive forest,
  warm rock, and slate-blue sea. New biome colors must sit in this muted,
  slightly sepia register; never introduce vivid map colors.
- **The grade is the glue.** The whole campaign should feel like one painted
  chart: slightly brightened, softly desaturated, warm-paper tinted, and shadow
  lifted. Anything newly drawn should share that grade.
- **Parchment grain + edge clouds = the chart frame.** Keep fine map grain and
  soft border fog/clouds on far zooms so the overview reads as an antique chart.
- **Typography is the identity — protect it.** Cities: Cinzel engraved caps with a
  dark halo; sea names: italic Georgia following the water, big and faded
  inside the water. Do not swap fonts, lowercase the caps, or drop the halo.
- **Campaign UI icons use Phosphor filled.** For DOM buttons, panels, and compact
  readouts, use filled Phosphor icons. Keep icons
  one-color (`currentColor`) in parchment/brass UI tones, or faction/allegiance
  color only when the icon is literally identifying ownership/standing. Do not
  use emoji in campaign UI controls; they break the antique Total War surface.
- **Faction fills.** Territory should be translucent color wash with smooth
  borders. If belligerents need extra emphasis, use a reference-faithful hatch
  overlay rather than louder fill colors.
- **Scenery stays subordinate.** Mountains, rocks, forests, carts, roads, and
  shadows should enrich the map without covering city labels, roads, or borders.
  At campaign scale, terrain relief usually reads better than oversized props.

## The two-color rule (don't break it)

On the campaign map every entity color is **either a faction color or an allegiance
color**, never anything else:

- **Faction colors** (`map.factions[].color`) — territory fills, the 3D city
  banners/flags. "Who owns this."
- **Allegiance colors** (`STATUS_CSS`, green/amber/red) — the 2D label status icons
  (house for city, users-four for army). "How they stand to me."

When you add a colored campaign element, decide which of these two meanings it
serves and use that source. Introducing a third color vocabulary is a regression.

## Workflow

1. Read the relevant `references/` image(s) for the surface you're touching.
2. Find the current implementation location from the codebase, not from this
   skill.
3. Make the change, then **follow `screenshot-regression`**: rebuild wasm if you
   touched `crates/`, capture the shot, and look at it next to the reference before
   you call it done. For UI/icon changes, capture every touched panel/control
   surface and inspect the PNG yourself. Re-bless baselines only once the render
   actually matches.
