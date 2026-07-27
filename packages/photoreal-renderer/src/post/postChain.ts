// BattlePostChain — the ONE post-processing owner for the photoreal battle
// world (spec: specs/3d-perspective-renderer, slice 15). Built on three's
// node-based post pipeline (RenderPipeline, the r183 rename of PostProcessing):
// one scene pass, one bloom stage, one preset-gated look grade, then three's
// renderOutput applies the tone map + output colour transform ONCE at the end
// of the chain.
//
// Ownership rules this seam obeys:
//   - Exposure + tone-map operator stay owned by the environment path
//     (environment.ts sets toneMappingExposure per preset; world.ts sets the
//     ONE tone-map operator). The post chain never re-decides either — three's
//     renderOutput reads renderer.toneMapping at the tail (outputColorTransform
//     = true), so the scene passes render linear/NoToneMapping and AgX is
//     applied exactly once. No double-tonemap of the already-linearized
//     overlays (the slice-09 lesson).
//   - The look grade shapes LINEAR HDR before AgX: it is a photographic print
//     bias over the whole battle frame, while AgX remains the one display
//     tonemap. That keeps the grade material-agnostic and preserves the
//     slice-15 AgX verdict.
//   - Bloom is threshold-disciplined in LINEAR HDR luminance: the highpass
//     (BloomNode) keys off luminance(sceneColor) before the tone map, so a
//     threshold of ~1 catches only genuine emitters — the sky sun disc and the
//     GGX sea glint — never the sun-drenched diffuse field. This is the
//     "sun-drenched, not synthwave" register: subtle strength, soft radius.
//   - The battle's in-scene overlays (tactical lines, effect lines, far-LOD
//     marker impostors, debug tris) carry display-referred colours below the
//     bloom threshold once linearized, so they never bloom; the true HUD
//     (DOM cardbar) is composited outside the WebGPU canvas entirely and is
//     categorically unreachable by this chain.
import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { clamp, dot, float, max, mix, pass, smoothstep, uniform, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import type { CivsimEnvironmentId } from '../../../game-renderer/src/environment/environment';

type Vec4Node = Node<'vec4'>;

/** Physically-restrained bloom. Threshold is LINEAR-HDR luminance (pre-tone-map,
 *  since the scene passes render with NoToneMapping): 1.02 sits just above a
 *  fully sunlit diffuse surface, so only super-white specular/emissive — the
 *  sky sun disc and the disciplined GGX sea glint — spills. Strength/radius and
 *  highpass softness lean toward the pen's five-level glow without turning
 *  bright grass into bloom. */
export const BLOOM_STRENGTH = 0.085;
export const BLOOM_RADIUS = 0.56;
export const BLOOM_THRESHOLD = 1.02;
export const BLOOM_SMOOTH_WIDTH = 0.75;
export const BLOOM_LEVELS = 5;

/** Pen print-grade constants, ported as post-chain policy rather than material
 *  albedo. Shadow tint follows the #5C6E9E violet family; highlight tint follows
 *  the pen's warm cream push. */
// 1.15 lands close-crop grass at the hero band low end with the green undertone kept
// (1.3 read mustard/uniform per unprimed critique) — orchestrator sweep 2026-07-27.
export const GRADE_SATURATION_BOOST = 1.15;
export const GRADE_CONTRAST = 0.16;
export const GRADE_SPLIT_TONE = 0.85;
export const GRADE_SHADOW_LIFT = 1.0;
const GRADE_LUMA = vec3(0.2126, 0.7152, 0.0722);
const GRADE_SHADOW_TINT = vec3(0.9, 0.95, 1.16);
const GRADE_HIGHLIGHT_TINT = vec3(1.055, 1.012, 0.925);
const GRADE_LIFT = vec3(0.017, 0.021, 0.036);
const GRADE_ONE = vec3(1.0);

const PRESET_GRADE_STRENGTH: Record<CivsimEnvironmentId, number> = {
  golden: 1.0,
  dusk: 0.45,
  noon: 0.3,
  'overcast-highland': 0.06,
};

export interface BattlePostGradeUniforms {
  strength: number;
  saturationBoost: number;
  contrast: number;
  splitTone: number;
  shadowLift: number;
}

export interface BattlePostChainStats {
  owner: 'battlePostChain';
  enabled: boolean;
  bloom: {
    enabled: boolean;
    strength: number;
    radius: number;
    threshold: number;
    smoothWidth: number;
    levels: number;
  };
  grade: {
    placement: 'pre-agx';
    preset: CivsimEnvironmentId;
    presetStrength: number;
    uniforms: BattlePostGradeUniforms;
  };
  /** The tone-map identity applied at the chain tail (slice-15 decision). */
  tonemap: string;
}

/** Names the active tone-map operator for the stats identity — the slice-15
 *  ACES-vs-AgX decision reads out here (agx is the verdict; aces is named so a
 *  temporary flip back to the loser stays legible in a lab A/B). */
export function toneMappingName(toneMapping: THREE.ToneMapping): string {
  if (toneMapping === THREE.AgXToneMapping) return 'agx';
  if (toneMapping === THREE.ACESFilmicToneMapping) return 'aces-filmic';
  return 'other';
}

export class BattlePostChain {
  private readonly pipeline: THREE.RenderPipeline;
  private readonly bloomNode: ReturnType<typeof bloom>;
  private readonly sceneColor;
  private preset: CivsimEnvironmentId;
  private presetStrength: number;
  private readonly gradeStrength = uniform(0);
  private readonly gradeSaturationBoost = uniform(GRADE_SATURATION_BOOST);
  private readonly gradeContrast = uniform(GRADE_CONTRAST);
  private readonly gradeSplitTone = uniform(GRADE_SPLIT_TONE);
  private readonly gradeShadowLift = uniform(GRADE_SHADOW_LIFT);
  /** Toggle for the ?post=off lab A/B — when off, render() falls back to a
   *  direct renderer.render (no chain) so the debug param is a true bypass. */
  enabled = true;
  bloomEnabled = true;

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    environmentId: CivsimEnvironmentId,
  ) {
    this.preset = environmentId;
    this.presetStrength = gradeStrengthForPreset(environmentId);
    this.gradeStrength.value = this.presetStrength;
    const scenePass = pass(scene, camera);
    this.sceneColor = scenePass.getTextureNode('output');
    this.bloomNode = bloom(this.sceneColor, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
    this.bloomNode.smoothWidth.value = BLOOM_SMOOTH_WIDTH;
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.setOutputNode();
  }

  private setOutputNode(): void {
    const hdr = this.bloomEnabled ? this.sceneColor.add(this.bloomNode) : this.sceneColor;
    this.pipeline.outputNode = this.gradeNode(hdr);
    this.pipeline.needsUpdate = true;
  }

  private gradeNode(input: Vec4Node): Vec4Node {
    const strength = clamp(this.gradeStrength, 0.0, 1.5);
    const base = max(input.rgb, vec3(0.0));
    const baseLuma = max(dot(base, GRADE_LUMA), float(0.0001));
    const mappedLuma = baseLuma.div(baseLuma.add(1.0));
    const printCurveLuma = mappedLuma.mul(mappedLuma).mul(float(3.0).sub(mappedLuma.mul(2.0)));
    const contrastMappedLuma = mix(mappedLuma, printCurveLuma, strength.mul(this.gradeContrast));
    const contrastLuma = contrastMappedLuma.div(max(float(0.0001), float(1.0).sub(contrastMappedLuma)));
    let graded = base.mul(contrastLuma.div(baseLuma));
    const l = contrastMappedLuma;

    const shadowTint = mix(
      GRADE_ONE,
      mix(GRADE_SHADOW_TINT, GRADE_ONE, smoothstep(float(0.0), float(0.34), l)),
      strength.mul(this.gradeSplitTone),
    );
    const highlightTint = mix(
      GRADE_ONE,
      mix(GRADE_ONE, GRADE_HIGHLIGHT_TINT, smoothstep(float(0.44), float(0.98), l)),
      strength.mul(this.gradeSplitTone),
    );
    const tinted = graded.mul(shadowTint).mul(highlightTint);
    const gradedLuma = dot(graded, GRADE_LUMA);
    graded = tinted.mul(gradedLuma.div(max(dot(tinted, GRADE_LUMA), float(0.0001))));

    const shadowLiftMask = float(1.0).sub(smoothstep(float(0.08), float(0.38), l));
    const lift = GRADE_LIFT.mul(strength).mul(this.gradeShadowLift).mul(shadowLiftMask).mul(0.45);
    graded = graded.mul(GRADE_ONE.sub(lift)).add(lift);

    const saturationLuma = dot(graded, GRADE_LUMA);
    const midtone = smoothstep(float(0.1), float(0.42), l).mul(
      float(1.0).sub(smoothstep(float(0.62), float(0.96), l)),
    );
    const saturationWindow = float(0.55).add(midtone.mul(0.45));
    const saturation = float(1.0).add(strength.mul(this.gradeSaturationBoost).mul(saturationWindow));
    return vec4(max(mix(vec3(saturationLuma), graded, saturation), vec3(0.0)), input.a);
  }

  setGradeUniforms(uniforms: Partial<BattlePostGradeUniforms>): void {
    if (uniforms.strength !== undefined) {
      this.gradeStrength.value = finiteClamped(uniforms.strength, 0, 1.5);
    }
    if (uniforms.saturationBoost !== undefined) {
      this.gradeSaturationBoost.value = finiteClamped(uniforms.saturationBoost, 0, 4.0);
    }
    if (uniforms.contrast !== undefined) {
      this.gradeContrast.value = finiteClamped(uniforms.contrast, 0, 0.6);
    }
    if (uniforms.splitTone !== undefined) {
      this.gradeSplitTone.value = finiteClamped(uniforms.splitTone, 0, 1.5);
    }
    if (uniforms.shadowLift !== undefined) {
      this.gradeShadowLift.value = finiteClamped(uniforms.shadowLift, 0, 1.5);
    }
  }

  setBloomEnabled(on: boolean): void {
    if (on === this.bloomEnabled) return;
    this.bloomEnabled = on;
    this.setOutputNode();
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return;
    }
    this.pipeline.render();
  }

  stats(): BattlePostChainStats {
    return {
      owner: 'battlePostChain',
      enabled: this.enabled,
      bloom: {
        enabled: this.enabled && this.bloomEnabled,
        strength: BLOOM_STRENGTH,
        radius: BLOOM_RADIUS,
        threshold: BLOOM_THRESHOLD,
        smoothWidth: BLOOM_SMOOTH_WIDTH,
        levels: BLOOM_LEVELS,
      },
      grade: {
        placement: 'pre-agx',
        preset: this.preset,
        presetStrength: this.presetStrength,
        uniforms: {
          strength: this.gradeStrength.value,
          saturationBoost: this.gradeSaturationBoost.value,
          contrast: this.gradeContrast.value,
          splitTone: this.gradeSplitTone.value,
          shadowLift: this.gradeShadowLift.value,
        },
      },
      tonemap: toneMappingName(this.renderer.toneMapping),
    };
  }
}

export function gradeStrengthForPreset(environmentId: CivsimEnvironmentId): number {
  return PRESET_GRADE_STRENGTH[environmentId];
}

export function postGradeUniformsFromParams(
  params: Pick<URLSearchParams, 'has' | 'get'>,
): Partial<BattlePostGradeUniforms> | null {
  const uniforms: Partial<BattlePostGradeUniforms> = {};
  readFiniteParam(params, 'grade', (value) => {
    uniforms.strength = value;
  });
  readFiniteParam(params, 'gradeSat', (value) => {
    uniforms.saturationBoost = value;
  });
  readFiniteParam(params, 'gradeContrast', (value) => {
    uniforms.contrast = value;
  });
  readFiniteParam(params, 'gradeSplit', (value) => {
    uniforms.splitTone = value;
  });
  readFiniteParam(params, 'gradeLift', (value) => {
    uniforms.shadowLift = value;
  });
  return Object.keys(uniforms).length > 0 ? uniforms : null;
}

function finiteClamped(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) return minValue;
  return Math.min(maxValue, Math.max(minValue, value));
}

function readFiniteParam(
  params: Pick<URLSearchParams, 'has' | 'get'>,
  name: string,
  apply: (value: number) => void,
): void {
  if (!params.has(name)) return;
  const value = Number(params.get(name));
  if (Number.isFinite(value)) apply(value);
}
