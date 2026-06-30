# Model Shots

Model shots are committed review artifacts for individual model families. Group
by ownership first, then by model family, then by review mode.

Generators for this folder live in `scripts/`:

- `scripts/soldier-sheets.mjs` writes `shared/soldiers/ingame/`.
- `scripts/soldier-animation.mjs` writes `shared/soldiers/anim/`.
- `scripts/grass-wind.mjs` writes `shared/grass/anim/`.
- Campaign model shots are captured by the scene-runner entry
  `web/scenes/models/campaign-models.mjs`, because it uses the shared scene
  screenshot harness, but the baselines still live here under `campaign/`.

```text
shared/
  soldiers/
    ingame/     # static contact sheets at battle camera pitch
    anim/       # review GIFs for soldier motion
  grass/        # reusable grass primitive sheets and wind-review GIFs
  props/        # reusable 3D scenery props shared by battle and campaign
battle/
  props/        # battle-only prop presentations and terrain-prop diagnostics
campaign/
  props/        # campaign-only prop presentations
  entities/     # campaign-only city, town, and army marker models
  terrain/      # roads, terrain material samples, water, and fog/cloud layers
  labels/       # campaign label and glyph-atlas review captures
```

Prefer `shared/props/` for reusable scenery meshes such as trees, rocks,
mountains, carts, banners, and generic battlefield objects. Use `battle/props/`
only when the shot is specific to the battle renderer or battle-only terrain
presentation.
