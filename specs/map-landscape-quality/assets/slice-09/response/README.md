# Campaign water response checkpoint

This checkpoint is superseded for material acceptance by the [focused finish review](../finish/README.md). Its matched battle controls remain the preservation evidence.

The source-conforming campaign surface now consumes the same linear water albedo owner as battle, with a distinct kilometre-scale depth proxy. Wet coverage comes from the mesh, signed shore distance stays separate, and the bounded offshore ramp is explicitly a visual proxy rather than bathymetry. Narrow water stays shallow and its normal motion fades away. No source heights, indices, coverage, physics, geography or battle water palette changed in this pass.

Material creation declares whether the source provides shore distance. Existing synthetic field fixtures and battle consumers retain their prior filtered-water response without requiring a missing vertex attribute. CampaignWorld shares one material across tiles. Its optional injected render time updates both the existing landscape frame and world clock; zero remains the default for frozen callers.

The eight-second loop uses a modulo phase, stable spatial noise and weak normal perturbation. First candidate sinusoidal normals produced conspicuous parallel bands in Italy and a harsh sun track in the noon fixture; that implementation was rejected. Its images remain in `rejected-bands/`. The surviving noise detail has no new geometry or texture ownership.

## Evidence and current verdict

`candidate/` contains actual composed Alps/Italy and all four frozen fixture phases, plus shore crops. `water-loop.gif` uses every phase in order. At t0/2/4/6 the weak offshore texture and shore lace move without shoreline displacement; river/lake interiors remain calm. The phase returns exactly at t8.

The old regional baselines predated source conformation and lacked today's rivers, so they were not used as a matched material control. `control/` was captured from the same source/geometry/camera/environment with only the campaign water response disabled, then the candidate was restored. Alps changes 23,750 pixels; Italy 405,356. Full-frame grayscale MAE is 0.53665 / 17.19271 and edge energy ratio is about 1.05 for Italy. These measure a darker offshore domain, not landscape geometry loss.

Own inspection: candidate is less wrong than the field-water control because shallow turquoise and offshore darkening are distinct while land is stable. Reference comparison still shows simpler, softer surf and stronger raster shore steps than the target. Shore outline/faceting remains slice08; whole-frame material/environment acceptance remains slice10. **Fresh independent visual critique is pending:** two attempts to spawn an unprimed reviewer were rejected by the agent thread limit. This is an implemented, reproducible checkpoint, not final visual acceptance or a claim that slice09 is complete.

`repeat.json` passes seven exact snapshots (four phases, two regions, unchanged terrain-water), fixed-source checks, visible water motion, shallow/deep separation and phase return. All 206,090 dry fixture pixels match the field-water control exactly at every phase. No page errors or GPU validation warnings occurred. Typecheck and all 497 CPU tests pass.

Independent Codex code review found only the initially pending screenshot baselines; the four baselines are included with this checkpoint. Shape review retained one water albedo/light owner and an explicit source capability, without a second sea shader or material lifetime. No existing assertion was weakened.

Existing `photoreal-sea` and legacy `water-sea` behavior probes pass, but four battle crops and the legacy far-sea stored baselines were already stale. Restoring the parent versions of both shared material files reproduced the same five baseline failures. All five actual candidate/parent captures are byte-identical in decoded RGBA (`battle-matched-pixels.json`); no unrelated baseline was updated. The near legacy shot passes its existing tolerance in both runs. Candidate files were restored after the control.
