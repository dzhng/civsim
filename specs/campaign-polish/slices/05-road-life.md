# Road Life

## Contract

Important campaign roads show subtle signs of life: carts, traders, patrols, or
similar small deterministic props that follow road geometry without distracting
from strategic markers. The cart/traffic visual must be accepted in isolation
before it is added to the real campaign map.

## API Seam

- road geometry from `packages/game-renderer/src/campaign/mapPass.ts`
- campaign renderer frame data in `web/src/campaign/rendererWebGPU.ts`
- deterministic scene time from the campaign scene harness
- a cart-on-road fixture scene with one road spline, one cart model, one city
  marker, fixed camera, and deterministic time steps

## Human Review

First review the cart-on-road fixture at several deterministic frames. The cart
should read as a small campaign prop, sit on the road surface, follow the road
direction, and stay below label/army priority. Then review close Rome and
central Italy with road-life enabled at the intended LoD.

## Verification

- Add a deterministic cart-on-road fixture scene/crop before the real campaign
  crop.
- Probe that props stay on road splines.
- Hide or simplify road-life props under fog and distant LoD.
- Keep performance stats before accepting.
- Run screenshot critique on fixture still frames and the real campaign crop.

## Done

- [ ] At least one cart/road-life prop appears on real campaign roads.
- [ ] The isolated cart-on-road fixture passes at deterministic still frames.
- [ ] Props move deterministically on road splines.
- [ ] Props obey fog, LoD, terrain, and label readability constraints.
- [ ] A fresh screenshot critique has reviewed cart scale, perspective, road
  attachment, and readability.
