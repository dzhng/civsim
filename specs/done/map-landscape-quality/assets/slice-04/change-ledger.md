# Change ledger

The retained pass changes relief crest sampling and the coastal height transition. It changes no simulation rules, map coordinates, source schema, city placement policy, materials or vegetation rules.

`campaignMountainForm.test.ts` adds two checks: lowland source remains low, and finer geometry resolves curved relief rather than just reproducing coarse triangles. No existing CPU assertion is re-pinned. Tests for the rejected raw-mask/graph algorithms were removed with those implementations.

The additional source-clone and foundation tests were part of the rejected foundation experiment and are not retained. That spike levels all401 actual models at2 km but leaves coarse residuals and makes visible circular shelves. None of its source schema or placement changes are active in the retained pass.

| Test | Previous behavior | New behavior | Why it changed |
|---|---|---|---|
| `campaign-landscape`: landscape-alps | Prior regional PNG used sharp ridged-noise cusps and 6 km height taper. | Updated connected relief; 938,022 RGBA pixels differ; repeated output has 0 changed pixels. | Cusp trimming changes height, normals, shadows and ground-centered camera elevation. **moved** |
| `campaign-landscape`: landscape-italy | Prior coastal PNG used the narrower height taper. | Gentler coastal height transition; 485,757 RGBA pixels differ; repeated output has 0 changed pixels. | Geometry tapers over 16 km while the water mask and material rules remain fixed. **moved** |
| `landscape-surface`: landscape-surface | Prior coastal fixture PNG used sharp crests and narrower height taper. | Perimeter ridge cleanup; 437,926 RGBA pixels differ; repeated output has 0 changed pixels. | Same bounded geometry change on the reference-inspired fixture. **moved** |

All seven new `mountains-*` baselines are recorded and repeat with 0 changed RGBA pixels. The exact verification used the parent branch's `af2fe354` snapshot primitive; the leaf's older snapshot file was restored afterward and is not included in this commit. Raw pixel differences locate change and are not quality scores; the neutral comparison accepts only the modest cleanup, with larger form hierarchy still open.
