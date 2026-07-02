// BattlePostChain — the ONE post-processing owner for the photoreal battle
// world (spec: specs/3d-perspective-renderer, slice 15). Built on three's
// node-based post pipeline (RenderPipeline, the r183 rename of PostProcessing):
// one scene pass, one bloom stage, then three's renderOutput applies the tone
// map + output colour transform ONCE at the end of the chain.
//
// Ownership rules this seam obeys:
//   - Exposure + tone-map operator stay owned by the environment path
//     (environment.ts sets toneMappingExposure per preset; world.ts sets the
//     ONE tone-map operator). The post chain never re-decides either — three's
//     renderOutput reads renderer.toneMapping at the tail (outputColorTransform
//     = true), so the scene passes render linear/NoToneMapping and the grade is
//     applied exactly once. No double-tonemap of the already-linearized
//     overlays (the slice-09 lesson).
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
import { pass } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';

/** Physically-restrained bloom. Threshold is LINEAR-HDR luminance (pre-tone-map,
 *  since the scene passes render with NoToneMapping): 1.0 sits just above a
 *  fully sunlit diffuse surface, so only super-white specular/emissive — the
 *  sky sun disc and the disciplined GGX sea glint — spills. Strength/radius are
 *  a soft warm halo, not a full-frame smear. Tuned on shots (slice 15a). */
export const BLOOM_STRENGTH = 0.06;
export const BLOOM_RADIUS = 0.3;
export const BLOOM_THRESHOLD = 1.0;

export interface BattlePostChainStats {
  owner: 'battlePostChain';
  enabled: boolean;
  bloom: { enabled: boolean; strength: number; radius: number; threshold: number };
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
  /** Toggle for the ?post=off lab A/B — when off, render() falls back to a
   *  direct renderer.render (no chain) so the debug param is a true bypass. */
  enabled = true;
  bloomEnabled = true;

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const scenePass = pass(scene, camera);
    this.sceneColor = scenePass.getTextureNode('output');
    this.bloomNode = bloom(this.sceneColor, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.setOutputNode();
  }

  private setOutputNode(): void {
    this.pipeline.outputNode = this.bloomEnabled ? this.sceneColor.add(this.bloomNode) : this.sceneColor;
    this.pipeline.needsUpdate = true;
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
      },
      tonemap: toneMappingName(this.renderer.toneMapping),
    };
  }
}
