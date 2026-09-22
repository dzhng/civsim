# Omit28km fold — eligible for one visual comparison

One fixed CPU ablation: remove only0.18*ridge(28)^2 from accepted folds. Keep source envelope,0.24floor,60km dominant/saddles,13km detail,foothill and coast contract. Reproduce mountain-omit28.mjs. Same exact source,240km window/120km core,0.5km lattice,accepted p25 thresholds,slope<0.2,4-neighbor connectivity,0.005km derivative step and2km Float32 dry-cell mesh approximation as preceding controls.

|Core metric|Accepted|Omit28|
|---|---:|---:|
|Median height(render km)|36.148|30.932|
|Maximum height|63.751|53.212|
|Median slope|0.8254|0.7091|
|p90 slope|1.5804|1.3726|
|Maximum slope|3.8886|2.9882|
|Gentle-low area km²|154.25|523.75|
|Largest gentle-low patch km²|23.25|65.75|
|Largest patch after1km erosion km²|2.75|11.75|
|p99 mesh height error|0.51875|0.40077|
|Maximum mesh error|1.89191|0.86165|

The full window agrees: median slope0.7066→0.5982,max4.376→3.526,largest gentle patch298.75→550km²,largest after1km erosion115.25→436km². Core component count45→81 still warns of fragmentation; increased area partly reflects lower relief under the fixed cutoff. This is not proof of broad connected valleys or better art.

Recommend ONE matched close Alps plus regional Alps/Italy visual comparison. Unlike nonlinear gates, it lowers gradient extremes and interpolation error while enlarging gentle support, and removes one noise evaluation rather than adding policy or neighborhood sampling. Lower relief is the explicit tradeoff, not grounds for automatic rejection. No alternate coefficient/camera/material changes should be bundled into the first comparison. Source geography remains unchanged; final presentation heights and height/slope-based placement can change through the existing owner.

No visual/production acceptance, GPU, or production edit performed. CPU evidence omits coast attenuation, actual resident mesh readback and ecology/material composition.
