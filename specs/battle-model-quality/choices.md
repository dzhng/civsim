# Implementation choices

## Sound — medium confidence

### Preserve source precision and expose immutable transition snapshots (05b)

An interrupted pose retains double-precision local transforms until the shared
sampler composes its Float32 joint matrices. Rounding the locals earlier would
change previously accepted bake bytes. The public saved source uses frozen
ordinary arrays, so a consumer cannot alter or transfer the controller's backing
pose. Copying a mutable typed array on every rendered frame would preserve safety
but repeat that cost throughout a transition.

The plan required bounded saved poses without prescribing storage. **Sound,
medium confidence:** numeric payload is80bytes per joint per active source,
plus array/object overhead and conversion temporaries.07 must measure that real
cost and the eventual GPU packing; this is not an approved final memory budget.

### Distinct diagnostic release motions exercise actual role selection (05b)

A bow release, a throw and a crew release now select different small authored
motions. These are timing fixtures, not accepted final animations. Reusing one
shooting motion for every weapon would hide wrong selection. The plan required
meaningful applicability but left these temporary keyframes open. **Sound, medium
confidence:** the source contract is testable now; later motion slices still owe
the full visual-quality verdict.

### One authored image set per appearance (slice04b)

When one soldier has leather, cloth and metal parts, those parts can use different
regions of the same color image and independently enable its roughness/metalness
or occlusion map. They cannot each supply competing images for the same channel.
The baker rejects that export instead of silently resizing or combining images.
The alternative would require arbitrary per-part textures and more binding or
atlas machinery before the first finished model exists.

The original plan required material maps but did not choose their grouping.
**Sound, medium confidence:** this keeps one appearance drawable as a batch and
preserves the exact authored images. Future Blender authoring must lay out a shared
image set; if a real roster asset cannot fit, revisit this constraint explicitly.

### Prepare distinct image owners sequentially (slice04b)

During reload, each image finishes decoding and GPU admission before the next
starts. If a later image fails, all earlier allocations are already owned and can
be released. A parallel implementation would need to handle images that finish
after the overall reload has already failed.

The plan specified atomic replacement but not scheduling. **Sound, medium
confidence:** predictable cleanup comes before speculative startup concurrency.
The measured asset-budget pass can justify bounded parallel preparation if loading
time warrants its extra ownership machinery.

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

### Rider action admission checks the joints the action actually controls (05b)

A moving horse leg cannot make a motionless rider action qualify as animated.
The source check samples local transforms within the declared rider mask, so
inherited movement from a parent also cannot qualify. Checking all world matrices
would accept movement discarded by playback. The plan required no-op rejection
without specifying this check. **Sound:** admission follows the same local-motion
ownership as the bounded rider override, without adding another animation graph.

### Generate the applicability review matrix from the asset owner (05b)

Changing a source binding regenerates its review row beside the catalog. The
determinism check detects stale review data; the matrix links to the existing spec
acceptance checklist and stores no separate progress state. The plan requested a
matrix but did not specify its owner. **Sound:** review and runtime cannot acquire
independent hand-maintained rosters.

### Isolate source transfer from unrelated presentation policies (slice04d)

When the six material strips switch between the stock loader and production,
they remain above ground-contact darkening, have no faction marking, and show
front-facing surfaces in the same world. Otherwise the pair could differ because
one renderer applies those presentation policies differently, even though the
authored material arrived correctly. Independent controls still test those
policies and posed/backface behavior; this fixture does not replace them.

The plan required matched swatches but did not specify this isolation. **Sound,
high confidence:** it gives the material comparison one interpretable variable.
Future reviews must not treat these strips as proof of grounded silhouettes,
faction behavior or stock/custom backface equivalence.

### Bound cross-renderer arithmetic without weakening regression snapshots (slice04d)

When the stock loader and weighted production path draw the same strip, small
arithmetic and image-path quantization differences can change a channel by one
or two RGB codes. The paired check bounds the whole-world difference and also
checks each material's interior; map-disabled controls prevent unchanged
backgrounds from hiding missing material response. A later run of the same
production snapshot must still match exactly.

The plan required comparison but left its numerical criterion unspecified.
**Sound, high confidence:** a measured cross-renderer allowance is distinct from
permitting regression drift. Future fixture changes must preserve that distinction,
not raise the bound to hide a new transfer defect.

### Admit mapped frames while computing existing animated bounds (slice04c)

When an appearance is baked, its material slots now accompany the existing
animated-bounds calculation. Each pose that calculation already visits also checks
that normal-mapped vertices have usable surface directions. Callers cannot omit
the material list and silently skip that check. Loading checks the starting mesh;
it does not repeat a full animation scan in the browser.

The plan required valid posed directions but left the validation API open.
**Sound, high confidence:** one traversal and a required input enforce the rule
without a second scan or an optional bypass. Future bounds callers must supply
the appearance's actual material slots.

### Preserve the existing deformation rule and define its collapsed limit (slice04c)

When several bones bend a surface, its normal and tangent use the same weighted
direction transform already used by the renderer. This does not introduce a new
inverse-transpose normal convention that would relight all existing assets. If
interpolation nearly cancels otherwise valid directions, shading uses the
geometric surface direction instead of amplifying numerical noise. Invalid
normal-mapped source frames still reject; this fallback does not admit bad assets.

The original material requirement did not choose a deformation convention or its
degenerate limit. **Sound, high confidence:** this isolates the requested map
support and keeps ordinary untextured rendering stable. Future rig changes inherit
that convention and must explicitly revisit it if they need different scaling.

### Reject normal scales that cannot survive GPU packing (slice04c)

An authored scale can be a finite JavaScript number yet become infinity in the
GPU's smaller number format. The baker and loader now reject that value rather
than letting it turn a surface's lighting invalid. Large values that do fit remain
supported through bounded normalization; zero still scales only the map's X/Y
components, not its Z direction.

The plan required authored scale but left its numeric storage limit implicit.
**Sound, high confidence:** explicit rejection preserves the actual rendering
contract without silently clamping author data. Future material editors inherit
the same Float32 boundary.

### Exercise collapsed poses by modifying a real export in memory (slice04c)

The source regression opens an existing Blender export and changes only its test
weights and bone rotation to cancel a mapped direction. Its starting mesh is valid,
so a rejection proves the animation check ran. The alternative was another
checked-in art fixture or a fake importer result.

The plan left this failure fixture unspecified. **Sound, high confidence:** the
test exercises the actual byte importer and baker without adding another source
asset to maintain. The ordinary exported fixtures remain unchanged.

### Closing a world makes pending reloads terminal (slice04b)

If an author closes a world while a replacement is loading, that replacement
cannot become the new visible crowd after teardown. Completed preparation is
released, and another reload on the closed owner fails before fetching. Calling
dispose twice is harmless. The alternative would silently claim a successful
reload into an owner that no longer has a usable renderer.

The plan required atomic reload but did not define teardown races. **Sound, high
confidence:** the original owner remains closed, without a generic cancellation
manager or a hidden world-recreation path.

### A complete surface owns its GPU resources (slice04b)

Two appearances may have identical scalar colors but different image maps. Sharing
only by their color table would give one appearance the other's texture. Loaded
surface identity therefore groups the material table, images and sampling settings.
Near meshes and their far-image bake share that prepared owner; an independent
crowd gets independent disposable resources, extending the existing reload lifetime
decision without global reference counting.

The original plan did not define image-cache ownership. **Sound, high confidence:**
closing or rejecting a replacement cannot destroy the visible crowd's images.
Three's external texture wrapper borrows the GPU image; the preparation owner
explicitly destroys it rather than relying on wrapper disposal.

### Omitted source samplers follow the standard loader (slice04b)

If a Blender export omits optional filtering settings, the baker uses the installed
standard glTF loader's linear filtering and mipmap policy. Explicit settings remain
unchanged, including the diagnostic checker's nearest filtering. Choosing unrelated
defaults would make an otherwise identical source look different between its
reference loader and production.

The plan required declared sampling fidelity but left absent settings open.
**Sound, high confidence:** reference and production interpret the same omission
consistently; future loader upgrades must preserve or deliberately review that rule.

### Embedded image packaging does not change image identity (slice04b)

A local export can put a PNG in its binary chunk or encode the same bytes as
base64 text inside its JSON. The baker accepts both and emits the exact image bytes;
external file and network image references still reject. Rejecting the second
container would add a packaging restriction without protecting visual fidelity.

The plan named embedded images without choosing their container. **Sound, high
confidence:** the accepted packaging does not introduce external asset I/O or a
second image source.

### Browser decoding is the image-codec authority (slice04b)

The baker checks image declarations, signatures and byte ranges, then retains the
encoded bytes. The browser decodes them when preparing the GPU surface. A corrupt
image body rejects that preparation and keeps the previous scene usable. Adding a
second full decoder to the baker would duplicate a dependency and still would not
prove that the target browser can decode the image.

The plan required malformed images to fail but did not choose the decoding owner.
**Sound, high confidence:** load-time decoding remains part of atomic admission,
not an assumption that every correctly labeled byte array is renderable.

### Neutral raw bindings mean absent maps, never failed maps (slice04b)

An untextured soldier still uses the raw renderer's fixed binding layout. Small
neutral images fill absent channels, while explicit per-slot flags decide whether
a map contributes. A declared image that fails never receives this substitute.
The alternative would compile separate pipeline layouts or split draws for each
combination of maps.

The plan prohibited extra material draws but left absent-resource binding open.
**Sound, high confidence:** neutral bindings simplify batching without hiding
broken authoring or inferring material meaning from colors.

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

### One production owner for zero-copy battle views (05a, `f36211df`)

**Confidence: medium.** When reinforcements append soldiers or WASM memory grows, the next health read must use the current memory buffer, pointer and soldier count. The existing position, facing and unit-info reads followed this rule inside world creation. The pass extracts those closures into `createBattleViews` and adds injury views there; world creation composes that same factory. An alternative would leave the closures embedded and require renderer/UI setup to test memory behavior, or create a separate test-only copy that could drift.

The plan required minimal zero-copy observations but did not choose the view module boundary. Future observation channels inherit this one owner and its real-WASM lifecycle tests, not a cache or a second memory adapter. **Sound:** extraction isolates the existing memory-view responsibility while preserving its public methods and behavior. It introduces no injury history, action policy or permission to write simulation memory from presentation code.

### One battle observation adapter, separate from action policy (05c)

**Confidence: medium.** When a soldier switches from pike to sword, production and the battle lab now read the same equipped-weapon state and choose the same catalog appearance. A shared adapter reads WASM and measures motion; the action controller decides which action runs. The unbuilt alternative leaves the lab with its own frame/weapon policy, so a successful lab test can disagree with battle.

The plan named the production adapter but did not settle how to eliminate the lab duplicate. Future observation fields belong to that shared boundary, while timing remains outside it. The existing class/weapon schema moves beside class data rather than remaining owned by the renderer. **Sound:** this gives each decision one owner without adding a second health cache or changing combat.

### Reloading models starts fresh visual history (05c)

**Confidence: medium.** If an author reloads a model while a soldier is midway through an action, the accepted catalog replacement starts a new visual action entry from current observations, including already-dead soldiers. It does not carry an old skeleton's partially blended pose into a new skeleton. A failed reload keeps the previous catalog and history. The unbuilt alternative attempts to preserve progress across potentially incompatible joint layouts.

The plan required safe reload but did not choose cross-rig history behavior. Future hot-reload work inherits this deliberate loss of visual progress, not a promise of seamless action continuity while authoring. **Sound:** preventing incompatible pose reuse is more important than retaining authoring-session phase; gameplay state is untouched.

### Reach overlays report engagement, not fabricated strike beats (05c)

**Confidence: medium.** While a living soldier is engaged, the tactical reach overlay now shows that weapon's reach envelope within its existing visibility budget. Previously a numeric-frame rhythm made it blink as if particular strike moments were known. The unbuilt alternatives keep that invented rhythm or remove the overlay entirely.

The plan removed fabricated action events but did not specify this diagnostic overlay. Future animation/contact work must not interpret the overlay as evidence of an actual hit. **Sound:** it retains useful spatial information while disclosing the less-specific observation. Likewise, switch cooldown no longer forces an idle pose: current equipment and genuine actions remain visible until authored switching/attachment continuity is implemented in slice14.

### Frozen rendering caches observations, not just the camera (05c)

**Confidence: high.** Advancing a frozen battle by three ticks can change a soldier's pose without moving the camera. The renderer therefore includes the observation tick and accepted catalog identity in its reuse decision. Repeating the same request can still reuse the submitted frame; a same-tick reload cannot. A thin debug reload call reaches the existing owner so the production path can be tested.

The plan did not account for the inherited cache's missing inputs. Future pose changes made outside normal tick/catalog updates must provide an explicit invalidation signal; they cannot rely on a new array allocation to defeat caching. **Sound:** the cache follows actual state ownership without removing frozen reuse or weakening performance gates.

### Recover release age from the existing simulation countdown (05c)

**Confidence: high.** If a projectile's countdown is first observed partway through, the adapter subtracts its remaining time from the simulation's own duration and reports elapsed release age. The controller can advance beyond its authored release marker rather than pretending emission happened just now. The unbuilt alternative duplicates the duration in JavaScript or requires a new event log.

The plan required release-compatible playback but did not define delayed-observation age transport. The read-only duration accessor is backed by the very constant used when missiles emit, and remaining TTL is still supplied for refresh detection. **Sound:** this supplies the information the current consumer needs without a second clock constant, event counter, or combat change.

### Admit gameplay only when local and baked clip timing agree (05c)

**Confidence: high.** A loaded model can contain a baked GPU clip and a local-joint clip with the same name but different duration. Rendering the former while freezing a blend source from the latter would produce inconsistent poses. Gameplay admission now rejects missing or mismatched required clip names, durations, looping and release markers before installing GPU resources. Manual-only inspection remains available.

The earlier loader validated catalog bindings against GPU clips but did not need local clips for interrupted blends. Future exporters must keep these two representations aligned; the runtime does not guess or silently fall back. **Sound:** the newly active local-pose consumer makes this a concrete admission requirement, not speculative validation.

### Replay is an explicit authoring mode in the existing inspector (05c)

**Confidence: medium.** Opening the ordinary model inspector still shows the same
manual controls. Opening its linked replay URL reveals a repeatable sequence of
synthetic movement, release, injury, equipment and death observations. Those
inputs drive the real action controller and instance submission path, but are
not presented as a recorded fight. The unbuilt alternatives add controls to every
manual visit or build a second viewer whose success could disagree with battle.

The plan required a replay surface but did not choose entry or fixture capture.
The URL is linked from the owning evidence; reduced discoverability is the cost
of preserving the ordinary inspector. Future cases extend the input fixture,
not action policy. **Sound:** one renderer and clearly labeled synthetic inputs
make timing repeatable without claiming exact combat events or GPU blend proof.

### Explicit manual edits end replay, while camera edits preserve it (05c)

**Confidence: medium.** An author can orbit the model during replay without
losing the current action. Choosing a different manual appearance, clip, phase
or formation instead returns control to manual inspection. A successful asset
reload resets replay if the selected appearance still supports it; a valid
manual-only asset exits replay rather than turning that successful reload into
an error. A failed reload retains the last good model and replay history.

The plan did not define the interaction between manual controls and synthetic
history. Keeping both active would leave two competing explanations for the
displayed pose. Future inspection controls inherit one active pose owner.
**Sound:** explicit mode changes prevent stale or misleading state while camera
adjustments remain non-destructive to an author's timing inspection.

### Bound every possible local pose rather than only sampled frames (06 prerequisite)

**Confidence: medium.** A long weapon can swing outside the box containing its
start and end poses. The source baker now follows the skeleton hierarchy and
bounds all allowed translations, scales and rotations, including crossfades and
mounted masks. It uses a sphere centered on the root-translation envelope, not
an optimally tight sphere fitted to a few poses. The unbuilt sampled alternative
can make the renderer wrongly remove a visible weapon near the screen edge.

The plan required conservative continuous bounds but did not choose the method.
Larger diagnostic spheres can retain more off-screen work;07 must measure that
cost. The review camera keeps its own fixed framing rather than moving when a
culling sphere changes. **Sound:** the hierarchy proof covers unseen intermediate
poses without a guessed safety multiplier. Its current Float32 margin does not
pre-approve a different GPU quaternion implementation.

### Reject projective inverse binds instead of silently treating them as affine (06 prerequisite)

**Confidence: medium.** The bounds proof assumes a skeleton transform preserves
the usual homogeneous coordinate. An imported inverse-bind matrix with a small
projective term can pass the importer's approximate shape check yet violate that
assumption, especially far from the origin. The bounds owner rejects that matrix
instead of dropping the term or returning a misleading sphere.

The plan did not define this admission edge. Current Blender exports satisfy the
exact affine row; a future exporter with numerical noise must correct its source
or justify an explicit normalization policy. **Sound:** rejecting unsupported
transforms preserves geometry rather than silently changing authored data to make
the bound appear valid.
