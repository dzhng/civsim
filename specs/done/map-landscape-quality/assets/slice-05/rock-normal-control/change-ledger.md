# Material check change

| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `procedural normal changes visible shading`, `web/scenes/campaign/landscape-materials.mjs` | Required more than100 changed pixels between default shading and a geometric-normal query control. | Removed the assertion and query control. Equivalent consumer, source preservation, authored/generated classification, distance captures and GPU validation checks remain. | The controlled production comparison rejects the normal perturbation itself; dry lighting now always uses terrain normals. Keeping this assertion would require a removed feature. **moved** |

The four existing CPU consumer tests now supply the required world texture; their
behavioral assertions and thresholds are unchanged. The new rock asset tests pin
raw image statistics and shared texture wiring, not visual quality. The12 lab
cleanup cases cover owned resource release and interrupted setup. No simulation,
unit-stat or gameplay tests changed. Canonical material image changes are listed below; other scene baselines remain
unchanged.


| Test | Previous behavior | New behavior | Why it changed |
| --- | --- | --- | --- |
| `snapshot landscape-materials-campaign` | Exact comparison to the1ad1bafa image. | Exact comparison to the reviewed image:361,944 pixels differ from that stored image. | Shared image-based rock color/roughness and landform normals replace the former procedural response; the delta also includes accumulated parent drift. Equivalent consumer RGBA still matches. **moved** |
| `snapshot landscape-materials-battle` | Exact comparison to the1ad1bafa image. | Same new image as campaign;361,944 pixels differ from the stored image. | The same shared response reaches this consumer; no independent battle palette is introduced. **moved** |
| `snapshot landscape-materials-near` | Exact comparison to the1ad1bafa near image. | Exact comparison to the reviewed near image;125,171 stored-baseline pixels differ. | Visible fracture color replaces cloudy detail and the rejected bump interference. **moved** |
| `snapshot landscape-materials-far` | Exact comparison to the1ad1bafa far image. | Exact comparison to the reviewed far image;542,916 stored-baseline pixels differ. | Matched parent capture already differs by533,458 pixels; the material change from that parent differs by9,577. Both contributions are retained, not attributed solely to the new texture. **carried-in / moved** |

Every new canonical image was captured twice with zero differing pixels.
`canonical-delta.json` records exact prior/new SHA-256 values. The inherited
parent drift was measured against the unchanged parent renderer, not guessed.
