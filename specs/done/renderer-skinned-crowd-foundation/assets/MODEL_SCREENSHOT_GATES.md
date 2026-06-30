# Model Screenshot Gates

## Purpose

Whole-scene screenshots are not enough for the WebGPU cutover. Each model,
prop, and animation family needs an addressable screenshot or frame sample so a
regression can name the exact missing asset instead of hiding inside a crowded
battle or campaign capture.

## Soldier Turntable Gates

Each old `web/shots/baseline/models/*.png` reference needs a matching WebGPU
turntable/contact-sheet capture:

- `00-heavy-sword`
- `01-light-spear`
- `02-longsword`
- `03-phalanx`
- `04-archers`
- `05-skirmishers`
- `06-shock-cav`
- `07-horse-archers`
- `08-artillery`
- `09-peasant`
- `10-light-sword`
- `11-heavy-spear`
- `12-medium-infantry`
- `13-medium-spear`
- `14-shock-cav-sidearm`

## Soldier In-Game Readability Gates

Each old `web/shots/baseline/models-ingame/*.png` reference needs a matching
WebGPU in-game readability capture:

- `00-heavy-sword`
- `01-light-spear`
- `02-longsword`
- `03-phalanx`
- `04-archers`
- `05-skirmishers`
- `06-shock-cav`
- `07-horse-archers`
- `08-artillery`
- `09-peasant`
- `10-light-sword`
- `11-heavy-spear`
- `12-medium-infantry`
- `13-medium-spear`
- `14-shock-cav-sidearm`

## Animation And GIF Gates

Each old `web/shots/anim/*.gif` reference needs deterministic WebGPU still
frames sampled from the equivalent clip. When a new WebGPU GIF is generated,
the still frames remain the regression baseline because they are easier to diff:

- `00-heavy-sword-attack`
- `00-heavy-sword-die`
- `00-heavy-sword-hit`
- `00-heavy-sword-run`
- `00-heavy-sword-walk`
- `03-phalanx-attack`
- `03-phalanx-die`
- `03-phalanx-hit`
- `03-phalanx-run`
- `03-phalanx-walk`
- `04-archers-attack`
- `04-archers-die`
- `04-archers-hit`
- `04-archers-run`
- `04-archers-walk`
- `06-shock-cav-attack`
- `06-shock-cav-die`
- `06-shock-cav-hit`
- `06-shock-cav-run`
- `06-shock-cav-walk`

## Campaign Model And Prop Gates

Each campaign model/prop family needs a close-up screenshot in addition to the
full campaign scene:

- city cluster with terracotta roofs, towers, ownership flag, shadow, label
- town/smaller settlement scale variant
- selected city footprint
- garrison state sequence: army outside city, partly inside/occluded by city,
  and hidden inside city using the same depth-tested model path
- army marker with attached flag, representative figures, faction livery,
  shadow, selection footprint
- road-only segment
- road segment connecting city endpoints
- broadleaf tree as its own `broadleaf.png` capture
- conifer tree as its own `conifer.png` capture
- mixed tree-family comparison as `trees.png`
- mountain massif
- rock/boulder cluster
- terrain grass/scrub sample
- terrain stone/relief sample
- shoreline/water sample
- fogged terrain sample
- cloud/fog layer sample
- cart/road traffic, when present in the WebGPU port
- city label icon+text sample
- army label icon+text sample
- faction label sample
- sea label sample

The current executable campaign model shot scene lives as `campaign-models` and
writes screenshots through the normal `web/shots` baseline path:

```sh
cd web
VERIFY_GPU=1 node scene.mjs campaign-models
```

The scene must keep adding gates until every individual campaign model and prop
has its own PNG under `web/shots/models/campaign/`, not a separate generated
report. These images are review evidence, not final parity acceptance.

Current executable campaign gates cover city, garrison-outside, garrison-city
(partial), garrison-hidden, town, army, road-with-cities, road-only,
selected-city footprint, mixed trees, individual conifer, individual broadleaf,
mountain, rocks, terrain grass/scrub, terrain stone/relief, shoreline-water,
cloud/fog, and label typography/icon samples. Soldier model review is handled by
`shots/models/scripts/soldier-sheets.mjs` and `shots/models/scripts/soldier-animation.mjs`, which write under
`web/shots/models/shared/soldiers/`.

## Rule

The WebGPU port can claim whole-scene visual parity only after the relevant
model-level gate exists and has been inspected. A lower full-scene pixel diff is
useful evidence, but it does not excuse a missing model, missing animation beat,
detached flag, random debug line, square terrain artifact, or missing font/icon.
A higher diff is also not a failure by itself once WebGPU deliberately improves
the old renderer; the gate is accepted by visible completeness, grounded 3D
composition, and fresh critique, with metrics used to explain changes rather
than to chase similarity.
