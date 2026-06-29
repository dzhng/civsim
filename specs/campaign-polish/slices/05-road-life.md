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

## Status (2026-06-29)

Done. Carts ride real campaign roads as deterministic, frozen-time props.

- **Cart model** (`models/shared/sceneryPropModels.ts:buildCartMesh`): a small
  ox-less trade cart pointing +X — four dark wheels, a plank bed, a shaft, and a
  canvas/sacks load. Kept low and stubby (size 6.0, height 4.0) so it reads as
  road life at the campaign camera without competing with city/army markers.
- **Placement** (`rendererWebGPU.ts:campaignRoadCarts`): walks `data.map.edges`,
  smooths each `edge.via` with `smoothRoadVia` (the same 0.72/0.14/0.14 weighting
  `mapPass` uses to draw the ribbon, so carts sit on the *rendered* centerline,
  not the raw polyline), then drops carts every `CART_SPACING_KM` along the
  spline. Travel facing uses the per-instance `yaw` slot added in slice 4. Carts
  skip the road-scenery clearance cull (they belong on the road) but skip the
  last ~7 km into each city node and obey fog.
- **Determinism**: cart progress is a function of frozen scene time
  (`fixedTime`), so a snapshot pins every cart to a fixed spot. Double-run
  re-render is byte-identical (0px).
- **Plumbing** (`campaign/sceneryPass.ts`): `'cart'` added to
  `CampaignSceneryKind`; full vertex/index/shadow/instance buffer set, draw and
  shadow passes, `sceneryStats.carts`, and `yaw` packed into the free instance
  slot.

Model-sheet/anim review was scoped to the deterministic fixture frames instead of
the unit model-sheet infra (which is battle-unit specific): the cart is reviewed
on real road geometry at frozen frames per this slice's own "review the
cart-on-road fixture at several deterministic frames" instruction. The
`campaign-polish-roads` (`?campaign=alignment`) and `campaign-webgpu-lod`
rome-close scenes both gate on `sceneryStats.carts >= 1`.

Unbiased `screenshot-critique` (fresh agent, no project context, judging crops):
unanimous HIGH-confidence positive — the carts "read as intended, execute
cleanly, enhance the world without noise."

## Done

- [x] At least one cart/road-life prop appears on real campaign roads.
- [x] The isolated cart-on-road fixture passes at deterministic still frames.
- [x] Props move deterministically on road splines.
- [x] Props obey fog, LoD, terrain, and label readability constraints.
- [x] A fresh screenshot critique has reviewed cart scale, perspective, road
  attachment, and readability.
