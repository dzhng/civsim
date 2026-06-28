# Road Life

## Contract

Important campaign roads show subtle signs of life: carts, traders, patrols, or
similar small deterministic props that follow road geometry without distracting
from strategic markers.

## API Seam

- road geometry from `packages/game-renderer/src/campaign/mapPass.ts`
- campaign renderer frame data in `web/src/campaign/rendererWebGPU.ts`
- deterministic scene time from the campaign scene harness

## Human Review

Close Rome and central Italy should show small moving road-life props when
zoomed in enough. They must sit on the road, obey terrain perspective, and not
compete with labels or armies.

## Verification

- Add a deterministic road-life scene/crop.
- Probe that props stay on road splines.
- Hide or simplify road-life props under fog and distant LoD.
- Keep performance stats before accepting.

## Done

- [ ] At least one cart/road-life prop appears on real campaign roads.
- [ ] Props move deterministically on road splines.
- [ ] Props obey fog, LoD, terrain, and label readability constraints.
