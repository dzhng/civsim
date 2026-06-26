---
name: aesthetics
description: The visual north star for civsim's battle and campaign rendering — a Bronze-Age Aegean / Total War Saga look — with the target palette, lighting, and typography pinned to the actual shader and renderer knobs that produce them. Use when adding or changing anything visual (terrain/sky/lighting shaders, soldier or scenery models, map labels, faction fills, colors), when a render looks "off" and you need a reference to judge it against, or when picking constants for a new visual feature.
---

# Aesthetics — the Bronze-Age Aegean look

Civsim is going for the **Total War Saga: Troy** look: sun-drenched Mediterranean
warmth on the battlefield, an antique painted-chart feel on the campaign map. The
images in `references/` are the north star — **open them with the Read tool and
judge your render against them**, the same way `screenshot-regression` makes you
look at the actual PNG before claiming a visual change is done. A green snapshot
proves *unchanged*, never *good*; these references are how you decide *good*.

This skill names the target, then points at the exact knob (file:line, with the
current literal value) that moves a render toward or away from it. When you pick a
new color/lighting constant, pick it to sit inside the palette below — don't
invent a fresh hue that fights the existing ones.

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

The battlefield is where we're furthest from the target. The current scene is a
near-black void with cool grass and no sky; Troy is a warm, hazy, high-key
*place*. Close that gap in this order of impact:

1. **Give it a sky and a horizon.** Today there is none — clear color is
   `vec4(0.06, 0.07, 0.06, 1)` (`battle/renderer3d.ts:595`) and there is no fog or
   sky dome. The single biggest move toward the references is a warm sky gradient
   (pale gold near the horizon → soft blue up top) plus distance haze so far
   terrain and the sea fade into it. Without aerial perspective the scene reads as
   a diorama on black, not a coast at golden hour.
2. **Warm the sun, lift the shadows.** Directional sun is `(-0.4, 0.5, -0.78)` @
   intensity `0.8` with hemispheric ambient `(0.34, 0.36, 0.32)` @ `0.78`
   (`renderer3d.ts:613-616`). Push the sun color toward warm white/straw and tint
   the ambient *cool* (sky-blue fill) — warm key + cool fill is what gives the
   references their depth. Keep it **high-key**: Troy battles are bright, not the
   moody dark we render now.
3. **Grass is sun-bleached olive, not cool meadow-green.** Grass tint 0 is
   `mix([0.435,0.561,0.290], [0.545,0.682,0.333])` (`renderer3d.ts:~140`). The
   target is warmer and more golden — bias toward yellow-olive
   (more red, less blue) so it reads as dry Aegean summer, matching the bleached
   grass in `battle-coastal-vista.jpg`. The wildflower scatter (pink/cream/yellow,
   already present) is exactly the right kind of detail — keep it.
4. **The sea sells the setting.** Battle water is a flat
   `mix([0.235,0.455,0.604], [0.337,0.580,0.722])` (tint 1). Where a battlefield
   meets the coast it should grade tan sand → pale turquoise shallow → blue deep,
   with the horizon hazing out (rule 1). The campaign sea shader
   (`campaign/shaders.ts:120-140`, with fresnel shelf + sun glint + foam) is the
   quality bar — borrow its structure.
5. **Trampled ground and corpses are part of the look.** The churned-earth tint
   (5: mud `[0.30,0.24,0.17]→[0.45,0.37,0.26]` with puddles) and the contact-shadow
   blobs (`atlas.ts:89`, `rgba(28,24,16,0.22)`) already exist — lean into them where
   fighting has happened, as in `battle-formations-melee.jpg`. Churn should spread
   under melee, not just spawn-static.
6. **Selection is a warm gold glow, never a hard outline.** The references box
   selected units in a soft yellow footprint glow. Match that hue/softness; don't
   draw a crisp UI rectangle that breaks the diegetic feel.
7. **Scenery is sparse and Mediterranean.** The four props (rock, scrub clump,
   short tree, boulder — `renderer3d.ts:704-721`) are placed deterministically by
   ground tint. For the Aegean read, the tree should be a **cypress/olive**
   silhouette, not a generic broadleaf, and props stay sparse — the references are
   mostly open ground, with cypress clusters marking a headland or acropolis.

Soldier material palette (`shared/soldierModel.ts:185-195`) is already on-target —
bronze/iron/linen/leather earth tones. Don't cool these down; they're the warm
anchor of every formation. Team accents: player blue `[0.20,0.42,0.88]`, enemy red
`[0.84,0.24,0.20]` (`renderer3d.ts:41-49`) must survive minification (see the LOD
metric in `screenshot-regression`).

## Campaign — the antique chart

The campaign map is already close to the references — this is mostly *preserve and
sharpen*, not rebuild. The painted/parchment quality, not satellite literalism, is
the whole point.

- **Land & sea palette (on-target, keep it).** Grass grades dry→wet
  `[0.66,0.64,0.42]→[0.40,0.56,0.33]`, sand `[0.90,0.81,0.60]→[0.80,0.69,0.48]`,
  forest `[0.24,0.36,0.20]→[0.32,0.46,0.26]`, rock `[0.58,0.50,0.42]→[0.72,0.66,0.58]`,
  sea shallow-teal→deep-slate `[0.40,0.56,0.64]→[0.16,0.30,0.44]`
  (`campaign/shaders.ts:88-140`). These match the muted greens / tan highlands /
  slate sea of the reference. New biome colors must sit in this muted, slightly
  sepia register — never vivid.
- **The grade is the glue.** `GRADE` (`shaders.ts:28-36`) brightens, desaturates 6%,
  lifts shadows, and applies a sepia tint (×1.02 R, ×0.95 B). That warm-paper cast
  is what makes the disparate elements read as one painted chart. Anything new
  drawn in the 3D layer must pass through it.
- **Parchment grain + edge clouds = the chart frame.** Two-octave Perlin grain
  (`shaders.ts:148`) and the overview rim clouds (`shaders.ts:156-162`) reproduce
  the cloud vignette framing `campaign-map-aegean-wide.png`. Keep them; if you add
  an overview-only effect, gate it on the same zoom ramp.
- **Typography is the identity — protect it.** Cities: Cinzel engraved caps with a
  dark halo; sea names: italic Georgia following the water, big and faded
  (`renderer.ts:24-26, 279-295, 339-372`). This is exactly the reference's lettering.
  Do not swap fonts, lowercase the caps, or drop the halo. Allegiance icon colors
  (Friend `#4ed163`, Neutral `#edc74d`, Foe `#e0463a` — `status.ts:14`) are fixed
  by the two-color rule below.
- **Campaign UI icons use Phosphor filled.** For DOM buttons, panels, and compact
  readouts, use the filled variant from <https://phosphoricons.com/>. Keep icons
  one-color (`currentColor`) in parchment/brass UI tones, or faction/allegiance
  color only when the icon is literally identifying ownership/standing. Do not
  use emoji in campaign UI controls; they break the antique Total War surface.
- **Faction fills: translucent wash + smooth border (current) vs. hatch (target
  gap).** Territory is a per-faction RGB wash at `FILL_A=150` with a Douglas-Peucker
  + Chaikin-smoothed border (`territory.ts:262-379`, `renderer.ts:234`). The
  references add a **diagonal hatch** over a faction at war/aggressing
  (`campaign-map-political-borders.png`). If asked to distinguish belligerents,
  a hatch overlay keyed off diplomacy is the reference-faithful way — not a louder
  fill color.
- **Scenery colors (on-target).** Mountains stone `[0.50,0.46,0.40]` / cap
  `[0.74,0.72,0.68]`, rocks `[0.47,0.44,0.40]`, cart timber `[0.42,0.30,0.20]`
  (`terrain3d.ts:627-747`). Trees broadleaf+conifer. Atmosphere: warm-grey fog
  `[0.71,0.71,0.68]` strengthening with tilt, soft contact shadows toward anti-sun.
  Keep scenery readable but subordinate to the labels and borders.

## The two-color rule (don't break it)

On the campaign map every entity color is **either a faction color or an allegiance
color**, never anything else:

- **Faction colors** (`map.factions[].color`) — territory fills, the 3D city
  banners/flags. "Who owns this."
- **Allegiance colors** (`STATUS_CSS`, green/amber/red) — the 2D label status icons
  (house for city, users-four for army). "How they stand to me."

When you add a colored campaign element, decide which of these two it is and use
that source. Introducing a third color vocabulary is a regression.

## Workflow

1. Read the relevant `references/` image(s) for the surface you're touching.
2. Find the knob above (it cites file:line + current value).
3. Make the change, then **follow `screenshot-regression`**: rebuild wasm if you
   touched `crates/`, capture the shot, and look at it next to the reference before
   you call it done. For UI/icon changes, capture every touched panel/control
   surface and inspect the PNG yourself. Re-bless baselines only once the render
   actually matches.
