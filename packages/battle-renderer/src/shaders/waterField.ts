import { photorealGerstnerWaves } from "../../../game-renderer/src/water/photorealGerstnerWaves";
import * as policy from "../../../game-renderer/src/water/photorealWaterPolicy";

/** One backend wave field for terrain water and standalone lake/ocean surfaces. */
export function waterFieldBody() {
  const f = (value: number) => `${value}${Number.isInteger(value) ? ".0" : ""}`;
  const waveTerms = photorealGerstnerWaves()
    .map(
      (wave, i) => `
    let phase${i}=dot(vec2f(${f(wave.dirX)},${f(wave.dirY)}),p)*${f(wave.k)}-t*${f(wave.omega * 0.42)}+${f(wave.phase)};
    let hump${i}=sin(phase${i})*0.5+0.5;
    h+=(hump${i}*hump${i}-0.333)*${f(wave.amplitude * policy.SEA_SWELL_SCALE)};
    slope+=vec2f(${f(wave.dirX)},${f(wave.dirY)})*(hump${i}*cos(phase${i})*${f(wave.amplitude * policy.SEA_SWELL_SCALE * 2 * wave.k)});
  `,
    )
    .join("\n");
  return `
    var h=0.0;var slope=vec2f(0);
    ${waveTerms}
    let crest=smoothstep(${f(policy.SEA_FOAM_HEIGHT_START)},${f(policy.SEA_FOAM_HEIGHT_END)},h);
    let agitation=smoothstep(${f(policy.SEA_FOAM_SLOPE_START)},${f(policy.SEA_FOAM_SLOPE_END)},dot(slope,slope));
    let speckle=terrainWaterNoise(p*0.5+vec2f(t*0.1,t*0.05))*0.42+terrainWaterNoise(p*1.3-vec2f(t*0.06,t*0.09))*0.34+terrainWaterNoise(p*3.0+vec2f(t*0.04,t*(-0.07)))*0.24;
    return WaterField(h,normalize(vec3f(-slope,1)),crest*agitation*smoothstep(${f(policy.SEA_FOAM_SPECKLE_START)},${f(policy.SEA_FOAM_SPECKLE_END)},speckle)*${f(policy.SEA_FOAM_SCALE)});
  `;
}
