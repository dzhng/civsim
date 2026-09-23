# Change ledger

| Test | Previous behavior | New behavior | Why |
|---|---|---|---|
| campaign landscape/coast overlap | Regular row-major indices compared equal samples | Final vertices match by XY plus wet/dry side; relief, normal, albedo and shore match | Source conformation adds vertices and duplicate bank sides |
| detailed coast | Every x<=0 vertex was wet | Exact-bank XY may have wet and dry vertices, both at the water datum | A bank has two material/normal sides |
| full-source allocation | Diagnostic conformation over a 32 km regular overview | Actual builder 16 km overview refuses initial allocation;32 km admits detail | Adopted builder must obey the complete 128 MiB ceiling |
| worker transfer | Four original mesh arrays and shore byte equality | Optional topology/coverage arrays also byte-equal and demonstrably transferred/detached | Avoid silent structured-clone copies |
| generation allowance (new) | No caller-specific conforming-output limit | Insufficient residual budget rejects before output allocation; later valid build succeeds | Bound resident+in-flight storage |
| small island/river (new) |1 km island coverage survived but height was 0 | Source pixels preserve water identity and dry island relief at 2/8 km geometry spacing | Coast lattice must resolve source detail |
| wet bank normals (new) | Coincident dry hit tilted wet normal | Wet normal remains vertical through morph | Coverage sides cannot share shading normals |

Mountain-form assertions, query/raycast behavior, scheduling and material lifetime
contracts remain unchanged. The shared fixture now supplies an actual source mask
rather than a separate analytic shoreline predicate.
