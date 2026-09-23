# Shared campaign and battle landscapes

The campaign and battle maps share terrain character: connected relief,
slope-aware stone and grass, coherent vegetation, and consistent water and
lighting. Strategic geography remains campaign-owned; battle sites preserve
their physical terrain, recipes and gameplay. Matching character does not require
reconstructing campaign geography inside a battle.

The user supplied [this screenshot](assets/landscape-reference.png) as the visual
reference. Its connected mountain mass, green shelves, forest transitions and
shore response motivated the work. It is user-provided reference imagery, not a
capture of this game's final renderer. Later direction made matching character
sufficient and stopped further isolated art tuning. That change in priority does
not establish that the original reference-quality floor was reached.

## Why these boundaries matter

One composition owns each world. The campaign's Three adapter and battle's
TypeGPU adapter share neutral surface, material, environment and model policy;
they retain backend-local GPU resources. The natural campaign preview delegates
to production so it cannot become a prettier independent implementation.
Diagnostic clay and fixture views remain deliberately controlled.

Visible terrain is the presentation authority. Roads, city foundations, scenery,
labels and pointer intersections must agree with its current triangles and
revision. Source geography and physical battle terrain keep their separate
semantics. A visual material or planting change must never rewrite passability,
movement, deployment or water physics.

World-aligned sampling and bounded residency let a location retain its identity
as the camera moves. Coarse coverage stays present while detail arrives;
shared boundary samples and attributes connect the two. Finite budgets and
source-lifetime failure handling prevent repeated travel from becoming an
unbounded allocation or retry loop.

Vegetation follows existing cover and reservations. Stable candidate identities
and shared crown shapes survive detail changes. Campaign fringe bushes and
battle bushes/rough stones already provide intermediate growth through those
same placement owners. Their visibility can remain sparse without implying a
missing second scatter system.

Water retains source-specific semantics while sharing visual policy. Animated
water meets sampled shores; filtered detail quiets as its screen footprint
shrinks. A rendered color is never a substitute for physical water coverage.

## Principles to preserve

- One camera, presented surface revision and composition per world; no alternate
  production canvas or permanent backend selector.
- Shared neutral inputs and policy, with explicit physical-versus-rendered units.
- Categorical coverage decoded before interpolation; authored IDs stay gameplay
  data rather than becoming continuous shader values.
- Resource lifetime follows real ownership, including borrowed textures, timing
  readbacks and shared-resource disposal attachments.
- Verification observes completed frames, actual submitted cameras and finished
  grass publications. An exact repeat proves reproducibility, not visual merit.
- Native measurements and paired performance comparisons are distinct claims.

The [architecture record](architecture.md) owns the detailed contracts. The
[consolidated choices](choices.md) explain retained decisions and tradeoffs.
Implementation owners are in [shared game rendering](../../../packages/game-renderer/src/),
[campaign rendering](../../../packages/photoreal-renderer/src/) and
[battle rendering](../../../packages/battle-renderer/src/). The existing
[scene suite](../../../web/scenes/) and [tests](../../../web/tests/) own executable
coverage; this document does not duplicate their inventory.

## Retained limitations

Foliage and intermediate detail remain visually sparse in some regions;
mountain shapes, forest floors and shore fringes remain simplified. A bounded
regional probe identifies tiny coarse/detail raster pinholes. These are recorded
limitations under the user's direction to stop isolated polishing, not a claim
of perfect seam-free or reference-equivalent output.

Current native engineering measurements are recorded, but a genuine comparable
archived full-game baseline was unavailable. Paired release-performance
acceptance therefore remains unverified. See the [final integration record](assets/closeout-status.md),
[regional evidence](assets/slice-15/final-regions/README.md),
[battle evidence](assets/slice-15/final-battle/README.md),
[native workload evidence](assets/slice-15/30k-current/README.md) and
[lifetime evidence](assets/slice-15/native-lifecycle/README.md) for their actual
scope and results.

## Avoid repeating these dead ends

Independent mountain props and local settlement grading broke continuity;
range-preserving relief and model foundations keep geographic identity.
Unbounded or separate shrub pools added ownership and budget problems without
establishing better composition. Material recolors cannot prove better geometry,
and matching old screenshots cannot justify restoring a retired renderer or an
obsolete camera assumption. These constraints are reasons to preserve the
shared owners, not an invitation to restart the exploratory tuning queue.
