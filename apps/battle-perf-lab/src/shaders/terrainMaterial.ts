import { MEADOW } from "../../../../packages/game-renderer/src/battle/meadowPalette";
import {
  TURF_CONTRAST,
  TURF_SHAPE,
} from "../../../../packages/game-renderer/src/battle/groundMaterialPolicy";
import {
  WATER_SHALLOW_ALBEDO,
  WATER_DEEP_ALBEDO,
  WATER_FOAM_ALBEDO,
  WATER_ROUGHNESS,
  WATER_FOAM_ROUGHNESS,
  LAKE_NORMAL_DETAIL_FADE_START,
  LAKE_NORMAL_DETAIL_FADE_END,
} from "../../../../packages/game-renderer/src/water/physicalWaterPolicy";
import { FIELD_WATER_RAMP } from "../../../../packages/game-renderer/src/water/waterShoreRamp";
import type { BattleSlopeBands } from "../../../../packages/game-renderer/src/battle/terrainFeatures";
import type { PhotorealEarthDistanceField } from "../../../../packages/game-renderer/src/battle/photorealEarthDistance";

export interface TerrainMaterialOptions {
  earthDistance?: PhotorealEarthDistanceField;
  slopeBands?: BattleSlopeBands | null;
  farGrass?: boolean;
}
const f = (n: number) => `${n.toExponential(16)}f`;
const rgb = (v: readonly number[]) => `vec3f(${v.map(f).join(",")})`;

/** Linear albedo + authored roughness, matching createGroundMesh's base terrain.
 * The on-field water's existing inner and outer EOTF are deliberately preserved.
 * Requires terrainNoiseWgsl; performs no lighting, fog, or GPU orchestration. */
export function terrainMaterialWgsl(options: TerrainMaterialOptions) {
  const sdf = options.earthDistance,
    bands = options.slopeBands;
  const slow = bands ? 1 / Math.sqrt(1 + bands.slowMin ** 2) : 1;
  const rolling = bands ? 1 / Math.sqrt(1 + bands.rollingMax ** 2) : 1;
  const cliff = bands ? 1 / Math.sqrt(1 + bands.cliffMin ** 2) : 1;
  return `
fn turfCanopy(broad:f32,mid:f32,fine:f32)->vec3f {
 let canopy=smoothstep(${f(TURF_SHAPE.canopy.contrastLow)},${f(TURF_SHAPE.canopy.contrastHigh)},broad*${f(TURF_SHAPE.canopy.broadWeight)}+mid*${f(TURF_SHAPE.canopy.midWeight)});
 let anchor=mix(${rgb(MEADOW.farGrass.low)},${rgb(MEADOW.farGrass.high)},${f(TURF_CONTRAST.canopy.anchorMix)});
 let neutral=dot(anchor,vec3f(0.2126,0.7152,0.0722));
 let quiet=mix(vec3f(neutral),anchor,${f(TURF_CONTRAST.canopy.anchorChroma)})*${f(TURF_CONTRAST.canopy.anchorLift)}*vec3f(${f(1 + TURF_CONTRAST.canopy.anchorWarmth)},1,${f(1 - TURF_CONTRAST.canopy.anchorWarmth)});
 let value=clamp(1.0+(canopy-0.5)*${f(TURF_CONTRAST.canopy.valueSpread)}+(fine-0.5)*${f(TURF_CONTRAST.canopy.fineSpread)},${f(TURF_CONTRAST.canopy.valueMinimum)},${f(TURF_CONTRAST.canopy.valueMaximum)});
 return quiet*value;
}
fn terrainSurface(position:vec3f,normal:vec3f,surfaceColor:vec3f,tint:f32,water:f32,time:f32,focus:vec2f,farStrength:f32,earthSdf:texture_2d<f32>,linear:sampler)->vec4f {
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
 let forest=1.0-smoothstep(0.18,0.95,abs(tint-4.0+tintDither));
 let screeTint=(1.0-smoothstep(0.18,0.95,abs(tint-6.0+tintDither)))*(1.0-roadEdge);
 var screeMask=screeTint*0.95*(1.0-waterBlend);var rockMask=0.0;var slopeRock=0.0;
 ${
   bands
     ? `slopeRock=1.0-smoothstep(${f(cliff)},${f(slow)},nz);
 let slowSlope=1.0-smoothstep(${f(slow)},${f(rolling)},nz);
 let rockTint=1.0-smoothstep(0.18,0.95,abs(tint-2.0+tintDither));
 rockMask=clamp(rockTint+slopeRock,0.0,1.0)*(1.0-waterBlend);
 screeMask=clamp(screeTint*0.95+slowSlope*(1.0-rockTint)*0.42,0.0,1.0)*(1.0-waterBlend);`
     : ""
 }
 let exclusion=max(forest,max(rockMask,screeMask));
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
 ${
   bands
     ? `let warp=terrainFbm(world*0.035)*2.2+terrainFbm(world*0.12+vec2f(4,9))*0.7;
 let fracture=smoothstep(0.55,0.95,terrainFbm(world*vec2f(0.32)+vec2f(warp*0.35)));
 let strataPhase=fract(position.z*0.16+warp*1.7);
 let strata=smoothstep(0.7,0.98,abs(strataPhase*2.0-1.0))*smoothstep(0.35,0.75,terrainFbm(world*0.021+vec2f(11,3)));
 let faceNoise=terrainFbm(world*0.075+vec2f(2,6));
 var rock=mix(${rgb(MEADOW.rock.faceLow)},${rgb(MEADOW.rock.faceHigh)},faceNoise);
 rock=mix(rock,${rgb(MEADOW.rock.fracture)},fracture*slopeRock*0.62);rock=mix(rock,${rgb(MEADOW.rock.strata)},strata*slopeRock*0.34);
 let pebble=smoothstep(0.78,0.97,terrainHash(floor(world*0.85)));
 var scree=mix(${rgb(MEADOW.rock.screeLow)},${rgb(MEADOW.rock.screeHigh)},terrainFbm(world*0.22+vec2f(8,3)));
 scree=mix(scree,${rgb(MEADOW.rock.screePebble)},pebble*0.28);
 let bench=clamp(rockMask+screeTint*0.45,0.0,1.0)*smoothstep(${f(slow)},${f(rolling)},nz)*smoothstep(0.42,0.84,terrainFbm(world*0.18+vec2f(6,1)))*0.44;
 albedo=mix(albedo,scree,screeMask*0.78);albedo=mix(albedo,rock,rockMask);albedo=mix(albedo,${rgb(MEADOW.rock.bench)},bench);
 roughness=mix(roughness,0.985,clamp((rockMask+screeMask)*0.62,0.0,1.0));`
     : ""
 }
 let swash=smoothstep(0.16,0.02,rawWater)*smoothstep(0.006,0.03,rawWater);
 let waterDetail=1.0-smoothstep(${f(LAKE_NORMAL_DETAIL_FADE_START)},${f(LAKE_NORMAL_DETAIL_FADE_END)},length(world-focus));
 let lace=terrainWaterNoise(world*1.2+vec2f(time*0.05,0))*0.28+0.72;
 let foam=clamp(swash*lace*0.7*waterDetail,0.0,1.0);
 let depth=smoothstep(${f(FIELD_WATER_RAMP.depthNear)},${f(FIELD_WATER_RAMP.depthFar)},rawWater);
 let waterAlbedo=terrainLinear(mix(mix(${rgb(WATER_SHALLOW_ALBEDO)},${rgb(WATER_DEEP_ALBEDO)},depth),${rgb(WATER_FOAM_ALBEDO)},foam));
 albedo=mix(albedo,waterAlbedo,waterBlend);
 roughness=mix(roughness,mix(${f(WATER_ROUGHNESS)},${f(WATER_FOAM_ROUGHNESS)},foam),waterBlend);
 return vec4f(terrainLinear(clamp(albedo,vec3f(0),vec3f(1))),roughness);
}`;
}
