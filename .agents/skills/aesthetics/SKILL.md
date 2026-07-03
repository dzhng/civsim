---
name: aesthetics
description: The visual north star for civsim's battle and campaign rendering: a Bronze-Age Aegean / Total War Saga look. Use when adding or changing terrain, sky, lighting, water, models, labels, icons, faction fills, colors, HUD/UI panels, cards, or bars, or any visual surface; when a render or UI looks off (e.g. reads like a webapp); or when choosing new visual constants.
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
- `references/battle-overcast-highland.png` — a **different lighting/weather
  condition**, not a different art style: a cool, overcast, semi-foggy day. Flat
  high-key near-white sky, slate crags, fresh green grass, heavy aerial haze
  swallowing layered ranges, a pale water sliver. The same world as the golden-hour
  shots above — same grass, rock, and water *materials* — read under flat cloudy
  light + deep fog instead of a low warm sun. This is the proof that lighting is an
  environment layer (see below), and the look civsim's `battle-map-reference` spec
  targets.

Campaign (grand-strategy map):
- `references/campaign-map-aegean-wide.png` — the painted parchment overview. Muted
  green/tan land, slate-blue sea, **wispy cloud vignette framing the edges**,
  engraved serif city labels, italic sea names following the water.
- `references/campaign-natural-target.png` — the terrain-palette target (a TW:Troy
  campaign vista David picked). Sun-bleached **yellow-olive turf**, warm
  desaturated register, muted teal water — the campaign's natural-view colors are
  graded toward this shot, never toward vivid kelly-green or webapp brights.
- `references/campaign-map-political-borders.png` — zoomed political view. Faction
  territory as **translucent color washes**; the active/aggressor faction's land
  carries a **diagonal hatch** (the red stripes over Macedon). Cinzel-caps city
  names, region names in larger faded caps. Wash strength follows David's
  EU4-political call: the faction color dominates while terrain relief reads
  through (see `specs/done`/campaign-map-polish rationale once archived).

UI / HUD (in-game panels):
- `references/ui-cardbar-tw.png` — the Total War unit-card bar: the target for any
  in-game HUD chrome. An **opaque worn-bronze housing** frames a row of **inset,
  beveled card wells** — recessed portraits, a strength bar, a role medallion. Note
  what it is NOT: no transparency, no floating rounded cards with gutters, no flat
  webapp panels. This is the style for civsim's battle/campaign DOM UI.

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

## Lighting & weather is an environment, not a material

The seven rules above describe the **golden-hour default** mood. That warmth comes
from the *environment* — the sun's color and angle, the sky, the fog — **not** from
the materials. So:

- **Don't bake light into albedos.** Grass, rock, sand, water, and soldier materials
  carry a **neutral base color**; their final on-screen look is that albedo *times*
  the current environment lighting. The golden-hour reference grass samples warm and
  dark because a low amber sun is on it, not because the grass is painted amber.
- **The mood is a swappable preset.** Sun color/elevation, sky gradient, fill color,
  and fog density together form an **environment preset**. Golden-hour Aegean
  (`battle-coastal-vista`) and the cool overcast-foggy day
  (`battle-overcast-highland`) are two presets over the **same** assets — both are
  in-register, neither is a reskin.
- **Aerial perspective survives every preset.** Whatever the light, far terrain still
  desaturates toward the sky and near stays higher-contrast (rule 1). Overcast just
  means a flatter, cooler, higher-key haze instead of a warm one.

When you judge a render, judge the **albedo** against neutral light and the **mood**
against the matching preset's reference — don't fault neutral grass for not being
golden, or a golden scene for not being grey.

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

## UI & HUD — a game surface, not a webapp (hard rule)

DOM panels, bars, and cards are part of the diegetic game, not a web dashboard.
Judge HUD chrome against `references/ui-cardbar-tw.png`. A surface **fails** if it
shows a **webapp tell**:

- **Transparency / fade** — panels are opaque with their own material, never a
  `linear-gradient(transparent → …)` dissolving into the scene or semi-transparent
  `rgba` fills.
- **Floating rounded cards with gutters** — elements are framed, abutting **wells
  inside a housing**, not free-floating rounded rectangles split by gaps and
  hairline borders.
- **No frame** — a real HUD sits in a worn-metal/bronze (battle) or brass/parchment
  (campaign) **housing with bevel and depth**, not edge-to-edge flat fills.
- **Flat & web-affordant** — wells are **inset** (rim light + inner shadow); no
  hover-lighten, pill buttons, or CSS-drop-shadow-as-glow. Selection is a warm
  **gold glow** (battle, rule 6) or status color (campaign), never a crisp UI
  outline.

Materials follow the world — bronze, iron, leather, bone (battle); brass and
parchment (campaign) — never slate-grey webapp neutrals. Flat CSS rules rarely get
there: expect layered gradients/insets or a 9-slice frame asset.

## The two-color rule (don't break it)

On the campaign map every entity color is **either a faction color or an allegiance
accent**, never anything else — but the two no longer share the icon channel:

- **Faction colors** (`map.factions[].color`) — territory fills and borders, the 3D
  banners/flags, **every 2D label icon and marker**, and the faction band on the
  own-entity map cards. "Who owns this." Icons never carry allegiance color.
- **Allegiance is a treatment, not an icon tint.** OWN entities read as the bronze
  faction-banner **map card** (cities: name + income, garrison as an attached
  footer; field armies: name + strength). NEUTRAL cities keep the engraved canvas
  label. ENEMY cities carry a **red sword** to the right of the label — the one
  allegiance-colored mark on labels. The status colors (`STATUS_CSS`
  green/amber/red) survive only as non-icon accents: the selection ring and the
  crowd-figure tint.

When you add a colored campaign element, decide which of these two meanings it
serves and use that source. Reintroducing allegiance-colored icons, or a third
color vocabulary, is a regression.

## Workflow

1. Read the relevant `references/` image(s) for the surface you're touching.
2. Find the current implementation location from the codebase, not from this
   skill.
3. Make the change, then **follow `screenshot-regression`**: rebuild wasm if you
   touched `crates/`, capture the shot, and look at it next to the reference before
   you call it done. For UI/icon changes, capture every touched panel/control
   surface and inspect the PNG yourself. Re-bless baselines only once the render
   actually matches.
