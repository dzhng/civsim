# Independent source instrumentation image review

Claude Opus read the original images and crops in a fresh read-only session. The initial attempt could not read the other worktree; this retry ran from the image-owning worktree and completed successfully.

## Full images (off-0 vs on-0)

I stepped through them region by region — sky/terrain gradient, the four formation blocks, the three blue banners, the front cavalry/spear line, the HUD (Army card, 20-card unit tray, minimap, volume slider, Menu button, "fps" text top-left).

I found **no difference I can see** at the displayed scale (2000×1250 from 2880×1800 originals):

- Grass base color, the horizontal band gradient, and the scattered dark blade flecks fall in the same places.
- Formation footprints, row/column spacing, per-soldier shading (gray mail torsos, tan legs, brown cavalry) match.
- Banner poles, cloth angle, and the gold finials sit at the same pixels.
- HUD is identical including the minimap's red/blue dot clusters, the white selection rectangle, and the unit-card strengths (350/500/…/80/200).
- No visible bloom/exposure shift, no tone or gamma offset, no halo, flicker band, or missing pass in either.

**Neither image shows a one-sided loss.** There is no element present in one and absent, dimmer, blurrier, or mis-shaded in the other. So: **tie** on what these stills show.

## Crops (tap-crop vs baseline-crop)

These two are **not the same framing**, so they don't function as an A/B pair:

- `tap-crop` is a wide, tall strip: two mail-infantry blocks with a banner over each, a large empty grass gap, and the brown cavalry rank entering at the bottom.
- `baseline-crop` is a short, wide band containing only the infantry rows and their two banners — no grass gap, no cavalry, and it's cut tighter top and bottom.

Within the overlapping subject (the mail blocks + banners) I see the same soldier silhouettes, rank spacing, banner placement and color. The apparent tonal difference — baseline-crop reads slightly cooler/bluer on the torsos — is confounded by the tighter crop excluding the grass, which changes the surrounding context; I would not call that a rendering difference from these two crops.

## Limits

- I did **not** measure pixels, so I am not claiming pixel equality — only that I find no difference visible at this scale. Sub-threshold differences (1–2 LSB tone shifts, minor dithering/sampling changes, sub-pixel jitter) would not survive into what I can see here, and downscaling for display can hide fine noise.
- Single frames say nothing about temporal behavior: shimmer, popping, LOD/impostor swap timing, or stability under camera motion are invisible here.
- I am drawing no conclusion about performance or cost; stills carry none.
- The two crops being differently framed means they cannot support a difference claim either way for the cropped region.

**Bottom line:** off-0 and on-0 are visually indistinguishable to me with no one-sided regression — a tie. The crop pair is inconclusive because the framings don't match.

Parent disposition: accept only the limited finding of no visible one-sided scene loss in these stills. Strict cross-launch pixel differences remain red; differently framed crops do not prove parity, and no motion or performance claim follows.
