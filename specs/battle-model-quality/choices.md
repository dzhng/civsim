# Implementation choices

## Sound — medium confidence

### Keep correct material transfer before repairing placeholder readability (slice04a)

When the campaign draws the old warm-colored soldiers using correctly decoded light and explicit material properties, some skin and limbs become darker and harder to distinguish. This pass keeps that truthful transfer instead of brightening the renderer to preserve the old accidental result. The future authored surface passes must restore readability through the actual assets; this is not approval of the darker placeholder art.

The plan separates infrastructure from final art but leaves this intermediate visual tradeoff open. **Sound:** making authoring dependable comes first, consistent with the user's infrastructure-first clarification. The reach is the later foot, mounted and crew surface review: those passes inherit a visible readability obligation, not permission to lower the quality target.

### Retain a simpler lighting model in the raw renderer (slice04a)

When the same metal material appears in the campaign's raw renderer and the battle's Three renderer, both now read its authored color, roughness and metallic value. The raw renderer uses its existing smaller lighting model, extended to respond to those values; it does not acquire a second copy of Three's full physically based lighting system. The pictures can therefore differ even when the material data agrees.

The plan permits different raw pixels but did not choose how much lighting machinery to share. **Sound:** this avoids a second full lighting engine while preserving authored channel response. Future raw-renderer work must maintain that response; exact battle/campaign lighting parity would be a separate architectural change.

### Keep far-atlas edge quality provisional while measuring its cost (slice04a)

When a soldier becomes a distant image, the new GPU bake records surface properties rather than a pre-lit picture. Its pixels currently use a single coverage sample, whereas the replaced canvas painter smoothed edges. Thin diagonal equipment may consequently have harder stair steps. The provisional call is to keep this infrastructure representation while the first-pair and roster distance passes compare actual authored silhouettes and decide the coverage budget; it is not a final edge-quality verdict.

The plan delegated atlas packing but left this lost edge smoothing unspecified. **Sound, provisionally:** the representation is measured and reversible, and no unexplained material error may be excused as edge debt. Future distance acceptance must explicitly compare smoothing quality and memory cost, rather than inherit this setting as approved art.

### Retain bake depth storage with its property targets (slice04a)

When an atlas finishes baking, its depth buffer is no longer sampled, but remains owned by the same render target until the atlas is replaced or disposed. Releasing only that attachment early could save about45MiB across the current catalog, but would introduce a separate backend resource-lifetime path. The current choice retains the simpler target ownership and includes its full cost in reported allocation and reload peak.

The plan required measured memory without specifying attachment lifetime. **Sound, provisionally:** ownership is explicit and cleanup is tested. The measured asset-budget pass can revisit the retained storage if it constrains the final roster; the quoted allocation must never omit it merely because shaders do not sample it.

### Material tables are immutable GPU copies for one prepared crowd (slice04a)

When an author changes a material file, reload constructs a new GPU material table and replaces the prepared crowd. Mutating an already-loaded JavaScript array does not update the visible material in place. Tiers that share the same loaded table share its GPU copy; a separately prepared crowd owns separate copies, even for identical bytes, so rejecting a reload cannot free the current crowd's resources.

The plan required reload and shared source ownership but left GPU caching lifetime open. **Sound:** resource sharing stays inside one disposable preparation rather than adding global reference counting. A future live material editor must explicitly upload its edits or use reload; ordinary JavaScript mutation is not an editing API.

### Give temporary geometry explicit surface categories (slice04a)

When building the old diagnostic soldiers, a wooden shaft and a leather body can have the same brown color but receive different material slots. The builder now names those surfaces directly. Its temporary heavy body remains categorized as bronze, while the medium body is leather; these categories describe existing placeholder content, not a reinterpretation of the requested chainmail heavy infantry.

The plan required explicit placeholder identity but did not assign every old primitive a surface. **Sound:** the categories make the transport testable without pretending the old geometry is finished equipment. The first-pair gear and surface passes replace this temporary content with the user's leather-versus-chainmail distinction.

### Benchmark motion uses authored clip duration (slice03)

When the crowd benchmark advances its marching soldiers, it samples the duration declared by their asset using the production phase rule. Keeping the former private shader's rounded clock would measure a different animation path even after sharing the mesh.

The plan required a production-path benchmark but left this timing conversion open. **Sound:** the benchmark now exercises the same sampling behavior as the renderer. The fixed workload and frame-time limit are preserved; this remains a rendering benchmark, not proof of live simulation performance.

### Reject uniformly colored benchmark captures (slice03)

A software-rendered vista once reported healthy soldier counts while its screenshot was effectively one color. The image check now requires a small amount of brightness variation as well as the existing bright-pixel floor. A bright empty canvas no longer counts as visible content.

The plan required readable evidence but did not prescribe this detection. **Sound:** this strengthens the check without replacing visual inspection, the screenshot comparison, or actual workload assertions. The variance threshold is only an empty-frame detector, not an art-quality score.

### Preserve original GLBs beside candidate material metadata (slice03)

When a local Blender export contains a checker texture, the geometry baker records its material slot and keeps the original export beside the candidate. The current scalar material description does not yet reproduce that texture; retaining the source preserves its images, sampling settings and material definitions for04. Discarding them would make a successful geometry import look like a complete surface import when it is not.

The plan separated geometry and material acceptance without specifying this intermediate source provenance. **Sound:** the omission is explicit and recoverable, with no outside service involved. This costs duplicate source bytes in diagnostic bundles;04 should replace this intermediate material reference with the actual rendered texture contract, not leave an unused second material owner.

### Use each appearance's complete near mesh to bake its initial far image (slice03)

When a pikeman becomes a small distant figure, his image is baked from his own complete mesh, so his pike does not become another class's sword. The initial placeholder bundle references its near mesh for that bake rather than storing an identical extra file or using one generic soldier image. Each appearance therefore allocates its own small image atlas, a grid of views used at distance.

The plan required appearance-specific far content but did not choose its first producer. **Sound:** this preserves equipment identity while the later distance-representation slices own authored reductions and final readability. It increases atlas memory and draw groups; performance must be measured with those real groups, not the former shared image.

### Isolate soldiers by removing foliage occlusion (slice01)

When reviewing a hand grip or a foot, randomly placed grass and rocks can cover the part being judged. The workbench hides those objects but retains production ground, lighting, shadows and post-processing. A fully dressed battlefield would provide more context but less reliable close inspection; later production formation/battle gates still require that context.

The plan required production parity but did not specify review scenery. This choice constrains the workbench to asset inspection, not environment acceptance. **Sound:** it removes an occluder without changing how soldiers are shaded. Revisit if a future gate depends on soldier–foliage contact.

## Sound — high confidence

### Missing source faction attributes mean unmarked geometry (slice04b source transport)

When an ordinary Blender export contains no `_FACTION_MASK` custom vertex attribute,
its geometry receives no faction tint. If the attribute exists, its scalar values
must be finite and between zero and one; broken references and other encodings
reject rather than becoming zeros. An author who wants markings must enable
Blender's Attributes export option and name the attribute exactly.

The plan required independent faction masks but did not define their source
convention or absence. **Sound:** ordinary unmarked geometry remains valid, while
present markings have a strict tested contract and are never inferred from color.
Future authoring must check the exported mask when markings are intended; omission
is not evidence that the exporter preserved the intended markings.

### Measure roads and sea-lane strips separately in full-game verification (04 maintenance)

When the full-game check opens the campaign, roads are triangle meshes while its
line counter covers sea-lane strips. The check now requires a substantial road
triangle workload and nonzero sea-lane lines. It no longer asks sea lanes to exceed
the old road-line count. The starting revision fails that same old assertion with
identical map data and geometry, so lowering a timing limit would not address it.

The plan required standing checks without identifying this carried-in mismatch.
**Sound:** the assertion follows the actual workload owners and retains the
existing city, depth and timing validity checks. Future verification must not use
one drawing primitive's counter as evidence for a different primitive.

### Validate gameplay clips at controller admission, not generic import (slice03)

When the battle reloads an asset that can stand idle but has no attack clip, it rejects the replacement before a later attack can crash rendering. The required names live beside the controller that requests them. A diagnostic with only an elbow-bend clip is still valid: its workbench explicitly requests no gameplay vocabulary and selects the asset's own clips.

The plan required meaningful clips and candidate inspection without defining this admission boundary. **Sound:** one generic loader can serve both uses without fake clips or fallback animation. Assets are checked before GPU allocation on startup and before replacing the current crowd on reload. Slice05 owns the later role-specific vocabulary; this check represents the current controller only.

### Keep the retained crowd benchmark at full detail (slice03)

When the old prototype switches to the production crowd implementation, it still submits every benchmark soldier at full detail. Applying normal battle distance reduction there would shrink the workload and make an apparent speed improvement incomparable to the old 33 ms gate.

The plan required preserving the existing performance gate but left the shared-renderer submission seam open. **Sound:** the benchmark keeps its original cost, while actual battles retain their ordinary visibility and distance policy.

### Keep candidate selection owned by the production world (slice03)

When the workbench opens a locally baked diagnostic catalog, the production world remembers that catalog's address. Reload reads the same address instead of accidentally replacing the diagnostic with the gameplay roster. The workbench supplies a selection, not a separate loader or rendering path.

The plan required candidate reload without specifying who retains its source. **Sound:** the same owner creates and replaces GPU content, so future reload behavior cannot diverge between inspection and battle. The default gameplay catalog remains unchanged.

### Match fixture framing with an explicit camera target (slice03)

When comparing a mounted fixture to its export reference, the camera aims at the fixture's recorded center rather than a hard-coded human chest height. That target travels with the inspection pose. Ordinary soldier review keeps its existing default target; the renderer's lighting and projection are not redesigned to flatter the candidate.

The plan required matched framing but did not specify this input. **Sound:** the reference and production view can show the same geometry at the same framing, including non-human diagnostic dimensions.

### Hold zero-duration diagnostic clips still (slice03)

When a source fixture contains a single static pose, pressing play leaves it at phase zero rather than dividing elapsed time by a zero duration. Animated clips advance by their authored duration and use their declared loop behavior.

The plan required source timing but did not define static-clip playback. **Sound:** static poses remain valid inspection assets without invented motion or a special replacement clip.

### Match exported tiers by bone names and actual bind transforms (slice03)

A Blender export can number the same arm bones differently in its near and reduced meshes. The baker matches uniquely named bones, checks their parent relationships and resting transforms, and rewrites each vertex's joint references into the near tier's order. It accepts reordered exports but rejects a genuinely different rig, rather than bending the reduced soldier with unrelated joints.

The plan required a shared skeleton without prescribing tier matching. **Sound:** authoring can change export order without changing deformation, while one animation set remains authoritative for all three tiers. Reduced tiers must retain the compatible skeleton; they cannot silently substitute a different rig.

### Changing the selected appearance chooses an applicable clip (slice03)

If the reviewer switches from one appearance to another and the current clip exists on both, the workbench keeps the clip and phase. If it does not, the picker selects the new appearance's first declared clip at its start. Programmatic requests for a missing clip and incompatible reloads still fail explicitly.

The plan required role-appropriate clips but did not define picker behavior. **Sound:** a deliberate selection change remains usable without inventing a missing animation or weakening asset-load failures. This is only a UI default, not a runtime fallback.

### Keep four-weight geometry in one shared upload layout (slice03)

When a vertex bends between an upper arm and forearm, its mesh retains each contributing joint and weight. Both renderers pack those attributes through the same layout immediately before GPU upload; the canonical asset keeps separate typed arrays for baking and CPU inspection. Giving every attribute its own GPU buffer exceeded the baseline device limit when shadows and instance data were added. Dropping weights would fit but would break the intended smooth bends.

The plan delegated buffer packing; the load-bearing ownership choice is that both substrates share its single definition. **Sound:** it preserves the full deformation data and existing device requirements. Future material channels must extend this owner rather than create a renderer-local encoding. Exact packing sizes remain implementation discretion and are measured by the performance gates.

### Fixed export fixtures are loaded once per review session (slice02)

When the reviewer switches quickly between the human and mounted diagnostic, the selected object changes immediately. Both original assets are loaded once at startup and remain owned by this small oracle until the page closes. The alternative refetched each selection, allowing overlapping responses to leave two fixtures visible and repeatedly allocate textures.

The plan required an independent export oracle but did not prescribe fixture loading lifetime. **Sound:** a fixed, bounded pair needs selection, not a general asynchronous asset-replacement system. Production authoring reload remains the separate workbench's responsibility. This constrains only the diagnostic route, not the roster loader.

### Compare mapped surface vertices, not only joint locations (slice02)

An exported elbow can have correctly placed bones but incorrectly weighted skin. Blender therefore records evaluated surface positions, and the exporter maps each glTF vertex back to its source vertex even when UV seams split it into multiple copies. The browser compares every mapped surface point. A joint-only check would miss lost weights or incorrect mesh bind transforms.

The plan named geometry landmarks but left their encoding open. **Sound:** the original fixture is the independent answer, not the custom crowd baker being tested. Generated landmark files are deliberately verbose, and remain reproducible test data rather than hand-maintained geometry inventories.

### Diagnostic fixtures use neutral surfaces and one checker patch (slice02)

When examining the elbow bend, all-over high-frequency checks concealed the surface. Plain rough grey now reveals the shape; the shield alone retains the authored checker for UV inspection. This changes neither deformation nor final soldier art. The alternative would preserve texture noise that made the export check harder to judge.

The plan excluded final material styling but left diagnostic presentation open. **Sound:** source surfaces stay inspectable, and material fidelity is still a later gate. Neutral color, roughness, checker resolution and exact fixture joint counts are reversible diagnostic settings, not a lower quality bar for the roster.

### Failed reloads retain the last working scene (slice01)

After a local bake, the author can press reload. If its files are broken or omit the selected appearance/clip, the workbench shows the error and keeps the previous soldier usable. A successfully loaded replacement is installed as a whole. The unbuilt alternative would blank or break the inspection view while the author corrects the export.

The plan requested visible errors but did not specify replacement failure behavior. Future import work must retain this explicit last-good behavior, including disposing partially allocated GPU resources. **Sound:** an error stays visible without destroying the review session; this is not a hidden placeholder fallback.

### Restore dependencies already recorded in the lockfile (slice01)

A clean install failed because the package manifest omitted the Node and PNG type packages already present in its lockfile. The manifest now requests those same versions. No package upgrade or new dependency choice was made. Leaving the mismatch would make the new worktree impossible to verify with a frozen install.

The plan did not address an inconsistent starting manifest. Future builds can use the existing frozen lockfile. **Sound:** source and lockfile now describe the same installation rather than requiring an undocumented local workaround.

### Render probes honor the renderer's browser-frame boundary (slice01)

When a test submits a second pose in the same browser frame, three.js's post-processing scene can still contain the first pose: that scene is updated once per frame. The parity test waits until the workbench has no pending draw, then submits each compared pose in a new browser frame. It still requires identical pixels; it does not retry until a lucky image matches.

The plan required deterministic parity but left its scheduling unspecified. Other manual render probes must respect the same frame boundary. **Sound:** synchronization follows the renderer's actual update contract rather than increasing a screenshot tolerance or arbitrary delay.
