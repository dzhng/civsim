import { DEFAULT_TERRAIN_SLOPE_BANDS } from "../../../game-renderer/src/terrain/materialProfile";
import { RENDER_ORDER } from "../renderOrder";
import {
  createTerrainGeometry,
  terrainSignals,
  terrainSlopeMasks,
  terrainRockResponse,
  applyTerrainSurface,
  groundDetailNode,
} from "../landscape/terrainMaterial";
// Three terrain fixtures share neutral geometry and appearance policy with production.
import * as THREE from "three/webgpu";
import {
  abs,
  attribute,
  clamp,
  float,
  floor,
  length,
  max,
  min,
  mix,
  step,
  texture,
  varying,
  vec2,
  vec3,
} from "three/tsl";
import type { LandscapeMesh } from "../../../game-renderer/src/terrain/surface";
import type { PhotorealEarthDistanceField } from "../../../game-renderer/src/battle/photorealEarthDistance";
import { MEADOW } from "../../../game-renderer/src/battle/meadowPalette";
import {
  fbmN,
  hashN,
  ridgeN,
  rgbNode,
  smoothstepN,
  type LandscapeFrameUniforms,
  type FloatNode,
} from "../landscape/shaderNodes";
import {
  coverEdgeNode,
  coverEdgeNoiseNode,
  mudInteriorCoverageNode,
  roadInteriorCoverageNode,
  turfEdgeCoverageNode,
  turfCanopyNode,
  TURF_CONTRAST,
} from "./groundDetail";
import type {
  BattleGroundCover,
  BattleSlopeBands,
} from "../../../game-renderer/src/battle/terrainFeatures";

interface TerrainMaterialOptions {
  /** Material-detail frequency in native world units; geometry and masks stay unscaled. */
  detailScale?: number;
  slopeBands?: BattleSlopeBands | null;
  farGrass?: { terrainDetailStrength: FloatNode } | null;
  earthDistance?: PhotorealEarthDistanceField;
  /** The rock face detail map, owned and disposed by the caller's world. */
  rockDetailMap: THREE.Texture;
}

/** The rolling battle ground mesh shared by playable and vista terrain. */
export function createGroundMesh(
  frame: LandscapeFrameUniforms,
  mesh: LandscapeMesh,
  options: TerrainMaterialOptions,
): THREE.Mesh {
  const geo = createTerrainGeometry(mesh);
  if (!mesh.coverage)
    geo.setAttribute(
      "gCover",
      new THREE.BufferAttribute(new Float32Array((mesh.vertices.length / 10) * 3), 3),
    );
  const earthDistance = options.earthDistance;
  const earthEdgesEnabled = earthDistance !== undefined;
  let earthDistanceTexture: THREE.DataTexture | null = null;

  const material = new THREE.MeshStandardNodeMaterial({ side: THREE.FrontSide, metalness: 0 });
  const surface = terrainSignals(options.detailScale);
  const { worldNormal, surfaceColor, surfaceWorld, world, waterBlend } = surface;
  const coverage = varying(attribute<"vec3">("gCover", "vec3")).toVar();
  // Turf exclusions are computed before the far canopy so that the same masks
  // also protect mud, rock, and scree from the distance replacement.
  let unionDistance: FloatNode = float(-(earthDistance?.rangeMeters ?? 1));
  let roadDistance: FloatNode = float(-(earthDistance?.rangeMeters ?? 1));
  if (earthDistance) {
    const sdf = earthDistance;
    earthDistanceTexture = new THREE.DataTexture(
      sdf.data,
      sdf.width,
      sdf.height,
      THREE.RGFormat,
      THREE.UnsignedByteType,
    );
    earthDistanceTexture.magFilter = THREE.LinearFilter;
    earthDistanceTexture.minFilter = THREE.LinearFilter;
    earthDistanceTexture.wrapS = THREE.ClampToEdgeWrapping;
    earthDistanceTexture.wrapT = THREE.ClampToEdgeWrapping;
    earthDistanceTexture.generateMipmaps = false;
    earthDistanceTexture.unpackAlignment = 1;
    earthDistanceTexture.colorSpace = THREE.NoColorSpace;
    earthDistanceTexture.flipY = false;
    earthDistanceTexture.needsUpdate = true;
    const uv = vec2(
      surfaceWorld.x.sub(sdf.ox).div(sdf.cell * sdf.width),
      surfaceWorld.y.sub(sdf.oy).div(sdf.cell * sdf.height),
    ).toVar();
    const encoded = texture(earthDistanceTexture, clamp(uv, vec2(0), vec2(1))).toVar();
    const inBounds = step(0, uv.x).mul(step(uv.x, 1)).mul(step(0, uv.y)).mul(step(uv.y, 1));
    unionDistance = mix(
      -sdf.rangeMeters,
      encoded.r.sub(0.5).mul(2 * sdf.rangeMeters),
      inBounds,
    ).toVar();
    roadDistance = mix(
      -sdf.rangeMeters,
      encoded.g.sub(0.5).mul(2 * sdf.rangeMeters),
      inBounds,
    ).toVar();
  }
  const edgeNoise = earthEdgesEnabled ? coverEdgeNoiseNode(world).toVar() : float(0);
  const earth = earthEdgesEnabled ? coverEdgeNode(unionDistance, edgeNoise).toVar() : float(0);
  const noisyRoad = earthEdgesEnabled ? coverEdgeNode(roadDistance, edgeNoise).toVar() : float(0);
  const roadEdge = min(noisyRoad, earth).toVar();
  const mudEdge = earth.sub(roadEdge).toVar();
  const turfAtEdge = turfEdgeCoverageNode(earth).toVar();
  const roadInterior = roadInteriorCoverageNode(roadDistance).toVar();
  const mudInterior = mudInteriorCoverageNode(unionDistance)
    .mul(float(1).sub(roadInterior))
    .toVar();
  const normalZ = clamp(worldNormal.z, 0.0, 1.0).toVar();
  const tintDither = hashN(floor(world.mul(1.7)))
    .sub(0.5)
    .mul(0.5)
    .add(fbmN(world.mul(0.12)).sub(0.5).mul(0.24))
    .toVar();
  const coverDetail = float(1)
    .sub(smoothstepN(0.18, 0.95, abs(tintDither)))
    .toVar();
  const forestTint = coverage.y.mul(coverDetail).toVar();
  const screeTint = coverage.z.mul(coverDetail).mul(float(1).sub(roadEdge)).toVar();
  // Authored terrain has semantic tints but no gameplay slope descriptor.
  // Visual slope response still comes from the rendered normal.
  const bands = options.slopeBands ?? DEFAULT_TERRAIN_SLOPE_BANDS;
  const rockTint = coverage.x.mul(coverDetail).toVar();
  // Authored rock/scree tints mark tactical prop footprints, already softened
  // into surfaceColor. Generated tints classify exposed faces from slope.
  const slopeMasks = terrainSlopeMasks(
    normalZ,
    waterBlend,
    options.slopeBands ? rockTint : float(0),
    options.slopeBands ? screeTint : float(0),
    bands,
  );
  const { rockMask, screeMask } = slopeMasks;
  const authoredScree = screeTint.mul(0.95).mul(float(1).sub(waterBlend));
  const nonEarthExclusion = max(forestTint, max(rockMask, max(screeMask, authoredScree))).toVar();

  // Broad neutral albedo variation; real blade geometry owns fine turf.
  const baseAlbedo = surfaceColor
    .mul(float(1).sub(earth))
    .add(rgbNode(MEADOW.earth.mud).mul(mudEdge))
    .add(rgbNode(MEADOW.earth.roadDust).mul(roadEdge));
  let albedo = groundDetailNode(world, baseAlbedo, {
    coverage: float(1).sub(nonEarthExclusion).mul(turfAtEdge),
  });
  if (options.farGrass) {
    const farGrass = options.farGrass;
    // Sustain past the blade edge across the whole vista. A finite outer fade
    // created a camera-centred olive island at top-down zoom; distance fog is
    // the sole far handoff, not a return to bare green ground.
    const farMask = float(1)
      .sub(waterBlend)
      .mul(float(1).sub(nonEarthExclusion))
      .mul(turfAtEdge)
      .toVar();
    const wind = frame.time.mul(0.035);
    // Keep the distance canopy isotropic and world-space. Camera-aligned
    // stretching would turn grazing views into camera-dependent streaks and
    // break the phase-return contract.
    const brush = ridgeN(
      vec2(
        world.x.mul(0.62).add(world.y.mul(0.12)).add(wind),
        world.y.mul(0.6).sub(world.x.mul(0.09)).sub(wind.mul(0.6)),
      ),
    ).toVar();
    const raked = ridgeN(
      vec2(
        world.x.mul(1.16).sub(world.y.mul(0.2)).sub(wind.mul(0.4)),
        world.y.mul(1.1).add(world.x.mul(0.16)).add(wind.mul(0.25)),
      ),
    ).toVar();
    const fineBreak = fbmN(world.mul(2.4).add(vec2(9.0, 4.0))).toVar();
    const grazingFine = brush.mul(0.6).add(raked.mul(0.28)).add(fineBreak.mul(0.12)).toVar();
    // Grazing views compress tens of metres into a narrow screen band, so the
    // canopy uses metre-scale clumps. One khaki anchor keeps hue stable while
    // low-amplitude value variation survives minification.
    const grazingLift = turfCanopyNode(world, grazingFine);
    albedo = mix(
      albedo,
      grazingLift,
      farMask.mul(farGrass.terrainDetailStrength).mul(TURF_CONTRAST.canopy.mixStrength),
    );
  }
  // Churn uses the unwarped mud interior so the noisy visual feather cannot
  // paint a dark ring around earth boundaries.
  const clods = fbmN(world.mul(0.07))
    .mul(0.6)
    .add(fbmN(world.mul(0.16).add(vec2(5.0, 2.0))).mul(0.4));
  const ruts = ridgeN(world.mul(vec2(0.11, 0.045)).add(vec2(2.0, 0.0)));
  const churn = clamp(clods.mul(0.72).add(ruts.mul(0.28)).add(0.58), 0.42, 1.3);
  albedo = mix(albedo, albedo.mul(churn), mudInterior);
  const response = terrainRockResponse(
    surface,
    albedo,
    slopeMasks,
    options.rockDetailMap,
    options.detailScale,
  );
  albedo = response.albedo;
  const dryRoughness = response.dryRoughness;
  const dryNormal = response.normal;
  applyTerrainSurface(material, frame, surface, albedo, dryRoughness, float(0), dryNormal);

  const ground = new THREE.Mesh(geo, material);
  ground.name = "battle-ground";
  ground.frustumCulled = false;
  ground.renderOrder = RENDER_ORDER.worldOpaque;
  // The ground is the primary shadow RECEIVER (soldier/tree/cliff
  // shadows land here) but does NOT cast. A gently undulating heightfield at
  // a grazing golden-hour sun needs cot(elevation)·texel ≈ 2–3 world units of
  // depth bias in the far cascades to stop self-shadow ripple — a bias that
  // erases every soldier-sized shadow (verified on hardware shots). Terrain
  // self-occlusion is owned by 13 (relief look) / 14c (contact AO) instead.
  ground.receiveShadow = true;
  if (earthDistanceTexture && earthDistance) {
    ground.userData.earthDistanceTexture = earthDistanceTexture;
    ground.userData.earthDistance = {
      owner: "playable-ground",
      format: "rg8-unorm",
      width: earthDistance.width,
      height: earthDistance.height,
      rangeMeters: earthDistance.rangeMeters,
      channels: ["earth-union", "road"],
      filters: ["linear", "linear"],
      textureResources: 1,
      vistaSamples: 0,
    } as const;
  }
  return ground;
}
