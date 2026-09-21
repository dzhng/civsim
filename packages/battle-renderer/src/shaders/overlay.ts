import { BATTLE_RING_TINT_GAIN } from "../../../game-renderer/src/battle/overlayData";
import { WORLD_CAMERA_WGSL } from "../../../renderer-core/src/cameraWgsl";
import { SELECTION_RING_PROFILE as P } from "../../../game-renderer/src/selectionRing";
import { linearAlbedoWgsl } from "./soldierFaction";
import type { OverlayKind } from "../overlayStaging";
/** Unlit source algorithms; runtimes own entrypoint layouts, blending and depth. */
export function overlayFunctions(kind: OverlayKind, alpha = 1) {
  return {
    vertex: `(p:vec3f,a:vec4f,b:vec4f)->OverlayVertex {
      ${kind === "ring" ? "return OverlayVertex(vec3f(a.xy+p.xy*a.w,a.z),b,p.xy);" : "return OverlayVertex(p,a,vec2f(0));"}
    }`,
    fragment: `(color:vec4f,local:vec2f)->vec4f {
      ${
        kind === "ring"
          ? `let d=length(local);
      let ring=smoothstep(1.0,${P.outerEdge},d)*smoothstep(${P.innerCut},${P.innerFade},d);
      let fill=smoothstep(${P.fillOuterStart},${P.fillOuterEnd},d)*smoothstep(${P.innerCut - P.fillInnerBelowCut},${P.innerCut + P.fillInnerAboveCut},d)*${P.fillAlpha};
      return vec4f(linearAlbedo(color.rgb*${BATTLE_RING_TINT_GAIN}),max(ring*${P.ringAlpha},fill)*color.a);`
          : `return vec4f(linearAlbedo(color.rgb),color.a*${alpha});`
      }
    }`,
  };
}
export function overlayShader(kind: OverlayKind, alpha = 1) {
  const f = overlayFunctions(kind, alpha);
  return `${WORLD_CAMERA_WGSL}
fn linearAlbedo${linearAlbedoWgsl}
struct OverlayVertex {world:vec3f,color:vec4f,local:vec2f};
fn overlayVertex${f.vertex}
fn overlayFragment${f.fragment}
struct V { @builtin(position) clip:vec4f,@location(0) color:vec4f,@location(1) local:vec2f };
@vertex fn vertex(@location(0)p:vec3f,@location(1)a:${kind === "line" ? "vec3f" : "vec4f"}${kind === "ring" ? ",@location(2)b:vec4f" : kind === "line" ? ",@location(2)alpha:f32" : ""})->V {
  let v=overlayVertex(p,${kind === "line" ? "vec4f(a,alpha)" : "a"},${kind === "ring" ? "b" : "vec4f(0)"});
  return V(projectWorld(v.world),v.color,v.local);
}
@fragment fn fragment(v:V)->@location(0)vec4f {return overlayFragment(v.color,v.local);}`;
}
