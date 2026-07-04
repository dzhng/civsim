# Slice 13 — campaign: army standards and settlement banners go 3D

**Contract:** both campaign flag sites become the slice-10 asset:

- **Army stack standard** — buildCampaignStandardMesh
  (campaignEntityModels.ts:59-85, drawn via entityPass.ts:86) is replaced by
  the shared standard at army scale, cloth waving. It stays the marker the
  figure LOD collapses to at far zoom (renderer.ts:796-802) — same anchor,
  same role, real cloth.
- **Settlement banner** — the city flies the faction banner at settlement
  scale from its mast (the static panels in buildCityMesh,
  campaignEntityModels.ts:15-27), sized by city tier toward the Roma
  reference: readable at strategic zoom without swallowing the town. A
  garrisoned army's standard keeps flying from the city anchor
  (renderer.ts:969-974); it must not double up with the settlement banner —
  garrison livery takes the mast, or offsets beside it, one flag per fact.

Far-zoom 2D chips (markerPass) and label-row icons are unchanged — they are
map UI, not flags. Allegiance-vs-faction split holds: figures tint by
allegiance, the standard carries true faction livery (renderer.ts:899-902).

**Verify:** campaign scene shots at strategic zoom + close zoom (this also
clears the pennant-restyle re-bless debt from slice 09); compare-screenshots
vs assets/ref-rome2-campaign-banner.png (banner presence/proportion over the
city, not terrain fidelity); campaign-models army/city review surfaces;
screenshot-critique last.
