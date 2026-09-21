import {
  TERRAIN_MATERIAL,
  DEFAULT_TERRAIN_SLOPE_BANDS,
} from "../../../game-renderer/src/terrain/materialProfile";
import { MEADOW } from "../../../game-renderer/src/battle/meadowPalette";
import { TURF_CONTRAST, TURF_SHAPE } from "../../../game-renderer/src/battle/groundMaterialPolicy";
import {
  WATER_SHALLOW_ALBEDO,
  WATER_DEEP_ALBEDO,
  WATER_FOAM_ALBEDO,
  WATER_ROUGHNESS,
  WATER_FOAM_ROUGHNESS,
  LAKE_NORMAL_DETAIL_FADE_START,
  LAKE_NORMAL_DETAIL_FADE_END,
} from "../../../game-renderer/src/water/physicalWaterPolicy";
import { FIELD_WATER_RAMP } from "../../../game-renderer/src/water/waterShoreRamp";
import type { BattleSlopeBands } from "../../../game-renderer/src/battle/terrainFeatures";
import type { PhotorealEarthDistanceField } from "../../../game-renderer/src/battle/photorealEarthDistance";

export interface TerrainMaterialOptions {
  earthDistance?: PhotorealEarthDistanceField;
  slopeBands?: BattleSlopeBands | null;
  farGrass?: boolean;
  vistaBand?: string;
}
const f = (n: number) => `${n.toExponential(16)}f`;
const rgb = (v: readonly number[]) => `vec3f(${v.map(f).join(",")})`;

/** Linear albedo + authored roughness, matching createGroundMesh's base terrain.
 * The on-field water's existing inner and outer EOTF are deliberately preserved.
 * Requires the shared terrain noise functions; performs no lighting, fog, or GPU orchestration. */
export function terrainMaterialFunctions(options: TerrainMaterialOptions) {
  const sdf = options.earthDistance,
    bands = options.slopeBands ?? DEFAULT_TERRAIN_SLOPE_BANDS;
  const rock = TERRAIN_MATERIAL.rock;
  const slow = 1 / Math.sqrt(1 + bands.slowMin ** 2);
  const rolling = 1 / Math.sqrt(1 + bands.rollingMax ** 2);
  const cliff = 1 / Math.sqrt(1 + bands.cliffMin ** 2);
  return {
    turfCanopy: `(broad:f32,mid:f32,fine:f32)->vec3f {
 let canopy=smoothstep(${f(TURF_SHAPE.canopy.contrastLow)},${f(TURF_SHAPE.canopy.contrastHigh)},broad*${f(TURF_SHAPE.canopy.broadWeight)}+mid*${f(TURF_SHAPE.canopy.midWeight)});
 let anchor=mix(${rgb(MEADOW.farGrass.low)},${rgb(MEADOW.farGrass.high)},${f(TURF_CONTRAST.canopy.anchorMix)});
 let neutral=dot(anchor,vec3f(0.2126,0.7152,0.0722));
 let quiet=mix(vec3f(neutral),anchor,${f(TURF_CONTRAST.canopy.anchorChroma)})*${f(TURF_CONTRAST.canopy.anchorLift)}*vec3f(${f(1 + TURF_CONTRAST.canopy.anchorWarmth)},1,${f(1 - TURF_CONTRAST.canopy.anchorWarmth)});
 let value=clamp(1.0+(canopy-0.5)*${f(TURF_CONTRAST.canopy.valueSpread)}+(fine-0.5)*${f(TURF_CONTRAST.canopy.fineSpread)},${f(TURF_CONTRAST.canopy.valueMinimum)},${f(TURF_CONTRAST.canopy.valueMaximum)});
 return quiet*value;
}`,
    terrainSurface: `(position:vec3f,normal:vec3f,surfaceColor:vec3f,coverage:vec3f,water:f32,time:f32,focus:vec2f,farStrength:f32,earthSdf:texture_2d<f32>,linear:sampler,rockMap:texture_2d<f32>,rockSampler:sampler)->vec4f {
 let world=position.xy;let rawWater=clamp(water,0.0,1.0);let waterBlend=smoothstep(0.08,0.55,rawWater);
 var unionDistance=${f(-(sdf?.rangeMeters ?? 1))};var roadDistance=unionDistance;
 ${
   sdf
     ? `let sdfUv=(world-vec2f(${f(sdf.ox)},${f(sdf.oy)}))/vec2f(${f(sdf.cell * sdf.width)},${f(sdf.cell * sdf.height)});
 let encoded=textureSample(earthSdf,linear,clamp(sdfUv,vec2f(0),vec2f(1)));
 let inside=step(0.0,sdfUv.x)*step(sdfUv.x,1.0)*step(0.0,sdfUv.y)*step(sdfUv.y,1.0);
 unionDistance=mix(${f(-sdf.rangeMeters)},(encoded.r-0.5)*${f(2 * sdf.rangeMeters)},inside);
 roadDistance=mix(${f(-sdf.rangeMeters)},(encoded.g-0.5)*${f(2 * sdf.rangeMeters)},inside);`
     : ""
 }
 let edgeNoise=${sdf ? `(terrainFbm(world*${f(TURF_CONTRAST.edge.noiseScale)})-0.5)*2.0` : "0.0"};
 let earth=${sdf ? `smoothstep(${f(-TURF_CONTRAST.edge.featherMeters)},${f(TURF_CONTRAST.edge.featherMeters)},unionDistance+edgeNoise*${f(TURF_CONTRAST.edge.noiseDisplacementMeters)})` : "0.0"};
 let noisyRoad=${sdf ? `smoothstep(${f(-TURF_CONTRAST.edge.featherMeters)},${f(TURF_CONTRAST.edge.featherMeters)},roadDistance+edgeNoise*${f(TURF_CONTRAST.edge.noiseDisplacementMeters)})` : "0.0"};
 let roadEdge=min(noisyRoad,earth);let mudEdge=earth-roadEdge;
 let turfEdge=1.0-smoothstep(${f(TURF_CONTRAST.edge.turfSpillStart)},${f(TURF_CONTRAST.edge.turfSpillEnd)},earth);
 let roadInterior=smoothstep(${f(TURF_CONTRAST.edge.roadInteriorStartMeters)},${f(TURF_CONTRAST.edge.roadInteriorEndMeters)},roadDistance);
 let mudInterior=smoothstep(${f(TURF_CONTRAST.edge.mudInteriorStartMeters)},${f(TURF_CONTRAST.edge.mudInteriorEndMeters)},unionDistance)*(1.0-roadInterior);
 let nz=clamp(normalize(normal).z,0.0,1.0);
 let tintDither=(terrainHash(floor(world*1.7))-0.5)*0.5+(terrainFbm(world*0.12)-0.5)*0.24;
 let coverDetail=1.0-smoothstep(0.18,0.95,abs(tintDither));
 let forest=coverage.y*coverDetail;
 let screeTint=(coverage.z*coverDetail)*(1.0-roadEdge);
 let sourceRock=${options.slopeBands ? "coverage.x*coverDetail" : "0.0"};
 let sourceScree=${options.slopeBands ? "screeTint" : "0.0"};
 let slopeRock=1.0-smoothstep(${f(cliff)},${f(slow)},nz);
 let slowSlope=1.0-smoothstep(${f(slow)},${f(rolling)},nz);
 let rockMask=clamp(sourceRock+slopeRock,0.0,1.0)*(1.0-waterBlend);
 let screeMask=clamp(sourceScree*0.95+slowSlope*(1.0-sourceRock)*0.42,0.0,1.0)*(1.0-waterBlend);
 let authoredScree=screeTint*0.95*(1.0-waterBlend);
 let exclusion=max(forest,max(rockMask,max(screeMask,authoredScree)));
 let base=surfaceColor*(1.0-earth)+${rgb(MEADOW.earth.mud)}*mudEdge+${rgb(MEADOW.earth.roadDust)}*roadEdge;
 let drift=(terrainFbm(world*${f(TURF_SHAPE.ground.driftScale)})-0.5)*${f(TURF_CONTRAST.ground.driftStrength)};
 let mottle=(terrainFbm(world*${f(TURF_SHAPE.ground.mottleScale)})-0.5)*${f(TURF_CONTRAST.ground.mottleStrength)};
 let detail=clamp(drift+mottle+1.0,${f(TURF_CONTRAST.ground.minimum)},${f(TURF_CONTRAST.ground.maximum)});
 var albedo=mix(base,base*detail,(1.0-exclusion)*turfEdge);
 ${
   options.farGrass
     ? `let farMask=(1.0-waterBlend)*(1.0-exclusion)*turfEdge;
 let wind=time*0.035;
 let brush=terrainRidge(vec2f(world.x*0.62+world.y*0.12+wind,world.y*0.6-world.x*0.09-wind*0.6));
 let raked=terrainRidge(vec2f(world.x*1.16-world.y*0.2-wind*0.4,world.y*1.1+world.x*0.16+wind*0.25));
 let fineBreak=terrainFbm(world*2.4+vec2f(9,4));
 let fine=brush*0.6+raked*0.28+fineBreak*0.12;
 let broad=terrainFbm(world*${f(TURF_SHAPE.canopy.broadScale)}+vec2f(2.5,7));let mid=terrainFbm(world*${f(TURF_SHAPE.canopy.midScale)}+vec2f(6,1.5));
 albedo=mix(albedo,turfCanopy(broad,mid,fine),farMask*farStrength*${f(TURF_CONTRAST.canopy.mixStrength)});`
     : ""
 }
 let clods=terrainFbm(world*0.07)*0.6+terrainFbm(world*0.16+vec2f(5,2))*0.4;
 let ruts=terrainRidge(world*vec2f(0.11,0.045)+vec2f(2,0));
 let churn=clamp(clods*0.72+ruts*0.28+0.58,0.42,1.3);albedo=mix(albedo,albedo*churn,mudInterior);
 var roughness=0.95;
 let weights=abs(normalize(normal));let axisWeights=weights/(weights.x+weights.y+weights.z);
 let faceVisibility=1.0-smoothstep(${f(rock.detailFade[0])},${f(rock.detailFade[1])},length(fwidth(position))*${f(rock.faceFrequency)});
 let rockPosition=position*${f(rock.faceFrequency / rock.platesPerTile)};
 let faceSample=textureSample(rockMap,rockSampler,rockPosition.yz).r*axisWeights.x+textureSample(rockMap,rockSampler,rockPosition.xz).r*axisWeights.y+textureSample(rockMap,rockSampler,rockPosition.xy).r*axisWeights.z;
 let faceHeight=mix(0.5,faceSample,faceVisibility);
 let fracture=(1.0-smoothstep(${f(1 - rock.fractureBand[1])},${f(1 - rock.fractureBand[0])},faceHeight))*faceVisibility;
 var rock=mix(${rgb(rock.faceLow)},${rgb(rock.faceHigh)},faceHeight);
 rock=mix(rock,${rgb(rock.fracture)},fracture*slopeRock*${f(rock.fractureStrength)});
 let pebble=smoothstep(0.6,0.78,terrainFbm(world*0.5))*(1.0-smoothstep(${f(rock.detailFade[0])},${f(rock.detailFade[1])},length(fwidth(vec3f(world,0)))*0.5));
 var scree=mix(${rgb(rock.screeLow)},${rgb(rock.screeHigh)},terrainFbm(world*0.22+vec2f(8,3)));
 scree=mix(scree,${rgb(rock.screePebble)},pebble*0.28);
 let bench=clamp(rockMask+sourceScree*0.45,0.0,1.0)*smoothstep(${f(slow)},${f(rolling)},nz)*smoothstep(0.42,0.84,terrainFbm(world*0.18+vec2f(6,1)))*0.44;
 let inputAlbedo=albedo;
 albedo=mix(albedo,scree,screeMask*0.78);albedo=mix(albedo,rock,rockMask);albedo=mix(albedo,mix(${rgb(rock.bench)},inputAlbedo,${f(rock.benchBaseMix)}),bench);
 roughness=mix(roughness,0.985,clamp((rockMask+screeMask)*0.62,0.0,1.0));
 roughness=mix(roughness,${f(rock.roughnessBase)}+faceHeight*${f(rock.roughnessHeight)},rockMask);
 let swash=smoothstep(0.16,0.02,rawWater)*smoothstep(0.006,0.03,rawWater);
 let waterDetail=1.0-smoothstep(${f(LAKE_NORMAL_DETAIL_FADE_START)},${f(LAKE_NORMAL_DETAIL_FADE_END)},length(world-focus));
 let lace=terrainWaterNoise(world*1.2+vec2f(time*0.05,0))*0.28+0.72;
 let foam=clamp(swash*lace*0.7*waterDetail,0.0,1.0);
 let depth=smoothstep(${f(FIELD_WATER_RAMP.depthNear)},${f(FIELD_WATER_RAMP.depthFar)},rawWater);
 let waterAlbedo=terrainLinear(mix(mix(${rgb(WATER_SHALLOW_ALBEDO)},${rgb(WATER_DEEP_ALBEDO)},depth),${rgb(WATER_FOAM_ALBEDO)},foam));
 albedo=mix(albedo,waterAlbedo,waterBlend);
 roughness=mix(${options.vistaBand ? `max(roughness,${f(options.vistaBand === "farFog" ? 0.995 : 0.985)})` : "roughness"},mix(${f(WATER_ROUGHNESS)},${f(WATER_FOAM_ROUGHNESS)},foam),waterBlend);
 return vec4f(terrainLinear(clamp(albedo,vec3f(0),vec3f(1))),roughness);
}`,
  };
}
