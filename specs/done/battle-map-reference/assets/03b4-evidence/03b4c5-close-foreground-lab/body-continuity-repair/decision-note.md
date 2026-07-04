# B4B1A1R decision - rejected

Verdict: reject all B4B1A1R `texture-volume` continuity repair profiles.

Target for this slice: preserve a visible close foreground grass body while
removing the B4B1A1 hanging-curtain / hay-mat island artifact. The fixed B4B1A0
lab camera, crop windows, terrain, meadow/root material, palette, and target crop
were frozen.

Profiles tested:

- `current`: rejected baseline from B4B1A1. Keeps the most recognizable grass
  body, but it still forms separated curtain islands over exposed flat ground.
- `seated-soft`: seats roots and shortens/widens the texture cards, but reads as
  large leaf/card piles at the crop edge, not continuous grass.
- `overlap-stagger`: adds the strongest overlapping body, but turns into giant
  starburst sheets that dominate the full shot and close crop.
- `broken-lattice`: reduces the loudest body and scores closest to the target by
  some metrics, but mainly by removing visible grass; it still leaves card
  clusters and exposed smooth ground.

Telemetry:

- Target comparison: `broken-lattice` has the lowest target distance
  (`parityDistance=0.18768`, `edgeEnergyRatio=1.16223`), but direct inspection
  shows this is because the grass body largely disappears, not because it becomes
  reference-like continuous grass.
- Rejected-current comparison: `overlap-stagger` moves farthest from the rejected
  baseline (`parityDistance=0.38326`, `edgeEnergyRatio=1.87542`) and is visibly
  worse due huge starburst/card artifacts. `seated-soft` and `broken-lattice`
  are closer to current, but neither removes the island/card read.

Learning: shallow shape tweaks inside the existing opaque texture-card model are
not enough. The primitive is trapped between separated vertical curtain islands
and oversized starburst/card sheets. The next slice should not tune density,
camera, palette, fog, or perf; it should isolate the render model that makes low
coverage texture cards draw as opaque card/mat color in the world-depth pass, and
prove whether a cutout/dithered or ground-integrated alpha contract can produce
continuous close body without card walls.

Unprimed screenshot-critique agreed with the rejection: no variant both removes
the hanging-curtain / hay-mat island artifact and preserves close grass body.
It called out discrete card clusters, missing body, persistent curtain/mat
artifacts, overscaled frond/starburst cards, repeated sheet patterns, weak
terrain contact, flat painted ground between clumps, and hard material highlights.
It judged `current` closest for body but still disqualified by hay-mat islands;
`lattice`/`seated` remove more curtain read only by losing the grass body.
