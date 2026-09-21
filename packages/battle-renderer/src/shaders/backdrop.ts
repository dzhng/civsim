import { WORLD_CAMERA_WGSL } from "../../../renderer-core/src/cameraWgsl";
import {
  DEFAULT_TERRAIN_STYLE,
  WIDE_DETAIL_TERRAIN_STYLE,
} from "../../../game-renderer/src/battle/terrainBackdropPolicy";
import { TURF_CONTRAST } from "../../../game-renderer/src/battle/groundMaterialPolicy";
import { MEADOW } from "../../../game-renderer/src/battle/meadowPalette";
import { terrainNoiseFunctions } from "./terrainNoise";
import { terrainMaterialFunctions } from "./terrainMaterial";
export type BackdropKind = "backdrop" | "default" | "wide-detail";
const rgb = (v: readonly number[]) => `vec3f(${v.join(",")})`;

/** Original opaque underlay material before shared environment haze and grade. */
export function backdropSurfaceWgsl(kind: BackdropKind): string {
  const style = kind === "wide-detail" ? WIDE_DETAIL_TERRAIN_STYLE : DEFAULT_TERRAIN_STYLE;
  const contrast =
    kind === "wide-detail" ? TURF_CONTRAST.quad.wideDetail : TURF_CONTRAST.quad.default;
  return kind === "backdrop"
    ? `
 let broad=terrainNoise(world*0.055+vec2f(4.7,8.1));
 let mid=terrainNoise(world*0.42+vec2f(11.3,1.9));
 let speck=smoothstep(0.78,0.98,terrainNoise(world*2.8));
 var grass=mix(${rgb(MEADOW.quad.backdrop.low)},${rgb(MEADOW.quad.backdrop.high)},broad);
 grass=mix(grass,${rgb(MEADOW.quad.backdrop.shadow)},smoothstep(0.62,0.94,mid)*0.38);
 grass+=${rgb(MEADOW.quad.backdrop.fleck)}*speck;
 let normal=vec3f(0,0,1);
 let albedo=terrainLinear(grass);`
    : `
 let fine=terrainNoise(world*2.2);
 let mid=terrainNoise(world*0.47+vec2f(5.2,1.8));
 let broad=terrainNoise(world*0.085+vec2f(0.7,9.3));
 let relief=quadGroundHeight(world);
 let hx=quadGroundHeight(world+vec2f(1.8,0))-relief;
 let hy=quadGroundHeight(world+vec2f(0,1.8))-relief;
 let normal=normalize(vec3f(hx*(-1.45),hy*(-1.45),1));
 let grazing=smoothstep(0.16,0.86,terrainRidge(vec2f(world.x*0.12+world.y*0.03,world.y*0.09)));
 let oliveNoise=mix(${rgb(style.oliveLow)},${rgb(style.oliveHigh)},mid*0.66+fine*0.16+relief*0.18);
 let oliveAnchor=mix(${rgb(style.oliveLow)},${rgb(style.oliveHigh)},0.5);
 let olive=mix(oliveAnchor,oliveNoise,${contrast.oliveSpread});
 let scrubPatch=smoothstep(0.5,0.86,broad)*(1.0-smoothstep(0.86,0.98,fine));
 let trample=smoothstep(0.72,0.98,terrainNoise((world+vec2f(13,-7))*0.18));
 let rakedDust=smoothstep(0.58,0.92,grazing)*(relief*0.08+0.08);
 let seed=floor(world*6.8);
 let fleck=terrainHash(seed);let blade=terrainHash(seed+vec2f(19,41));let pebble=terrainHash(seed+vec2f(73,11));
 let stubble=smoothstep(0.66,0.95,terrainRidge(vec2f(world.x*1.26+world.y*0.18,world.y*0.84)));
 let lightFleck=smoothstep(${style.lightFleckLow},${style.lightFleckHigh},fleck)*(fine*0.54+0.46);
 let darkFleck=smoothstep(${style.darkFleckLow},${style.darkFleckHigh},blade)*(1.0-smoothstep(0.76,0.98,broad));
 let stoneFleck=smoothstep(${style.stoneFleckLow},${style.stoneFleckHigh},pebble)*(relief*0.46+0.36);
 let speckle=lightFleck*${contrast.speckleStrength};
 var grass=mix(olive,${rgb(style.dry)},trample*${contrast.trampleMix}+${contrast.dryMixBase});
 grass=mix(grass,${rgb(MEADOW.quad.scrub)},scrubPatch*${TURF_CONTRAST.quad.scrubStrength});
 grass=mix(grass,${rgb(MEADOW.quad.rakedDust)},rakedDust);
 grass+=${rgb(MEADOW.quad.lightFleck)}*speckle;
 grass=mix(grass,${rgb(style.stubbleColor)},stubble*${contrast.stubbleStrength});
 grass=mix(grass,grass*${rgb(style.darkFleckColor)},darkFleck*${contrast.darkFleckStrength});
 grass=mix(grass,${rgb(MEADOW.quad.stoneFleck)},stoneFleck*${contrast.stoneFleckStrength});
 grass=mix(grass,turfCanopy(broad,mid,fine),${TURF_CONTRAST.canopy.mixStrength});
 let dust=smoothstep(18.0,96.0,distance)*${contrast.dustStrength};
 let albedo=terrainLinear(mix(grass,${rgb(MEADOW.quad.sunBleached)},dust));`;
}
export const quadGroundHeightWgsl = `(p:vec2f)->f32{
 let broad=terrainNoise(p*0.018+vec2f(8.1,2.4))*0.58;
 let folds=terrainRidge(vec2f(p.x*0.052+p.y*0.018,p.y*0.038-p.x*0.012))*0.26;
 let scratch=terrainRidge(vec2f(p.x*0.42+p.y*0.09,p.y*0.26))*0.16;
 return broad+folds+scratch;
 }`;
export function backdropShader(environment: string, kind: BackdropKind) {
  return `${WORLD_CAMERA_WGSL}
 ${environment}
 ${Object.entries(terrainNoiseFunctions)
   .map(([name, body]) => `fn ${name}${body}`)
   .join("\n")}
 fn turfCanopy${terrainMaterialFunctions({}).turfCanopy}
 fn quadGroundHeight${quadGroundHeightWgsl}
 struct V{@builtin(position)clip:vec4f,@location(0)world:vec3f,@location(1)distance:f32};
 @vertex fn vertex(@location(0)p:vec3f)->V{return V(projectWorld(p),p,length(p.xy-cam.focus));}
 @fragment fn fragment(v:V)->@location(0)vec4f{
 let world=v.world.xy;
 let distance=v.distance;
 ${backdropSurfaceWgsl(kind)}
 return shadeWorldSurface(albedo,vec3f(0),${kind === "backdrop" ? 0.98 : 0.96},0.0,0.0,1.0,normal,v.world,1.0);
 }`;
}
