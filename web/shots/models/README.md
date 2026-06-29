# Model Shots

Model shots are committed review artifacts for individual model families. Group
by ownership first, then by model family, then by review mode.

```text
shared/
  soldiers/
    ingame/     # static contact sheets at battle camera pitch
    anim/       # review GIFs for soldier motion
  props/        # reusable 3D scenery props shared by battle and campaign
battle/
  props/        # battle-only prop presentations and terrain-prop diagnostics
campaign/
  props/        # campaign-only prop presentations
  entities/     # campaign-only city, town, and army marker models
```

Prefer `shared/props/` for reusable scenery meshes such as trees, rocks,
mountains, carts, banners, and generic battlefield objects. Use `battle/props/`
only when the shot is specific to the battle renderer or battle-only terrain
presentation.
