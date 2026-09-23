# Shared scenery ownership

The instance pose is a CPU terrain contract, independent of either GPU backend. Battle placement, campaign placement, renderer input and fixtures now consume `SceneryInstance` from the same owner. Its fields and native-unit semantics are unchanged. The physical tree/rock drawing layer also has a neutral landscape home; its construction, shaders, batching and detail selection are unchanged.

No compatibility re-export or campaign-only kind alias remains. Model kind comes from the existing shared registry. Campaign static/dynamic clearances and battle physical eligibility remain policies in their original owners.

All 464 tests and TypeScript pass. Independent Codex review found no actionable regression. The merged campaign captures render through the relocated layer and repeat exactly after the separately accepted crown change. Existing tree-crown tests change their import path only; no assertions, thresholds or test behavior move in this ownership pass.

No runtime mechanism, GPU resource, configuration or dependency is added. The new type module replaces the declaration formerly inside the campaign GPU pass; the drawing module is moved, not duplicated. Render ordering still comes from the existing owner until 05 moves that world-wide constant to its neutral home.
