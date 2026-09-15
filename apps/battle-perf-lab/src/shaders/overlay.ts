import {
  BATTLE_MARKER_PROFILE as M,
  BATTLE_RING_TINT_GAIN,
} from "../../../../packages/game-renderer/src/battle/overlayData";
import { WORLD_CAMERA_WGSL } from "../../../../packages/renderer-core/src/cameraWgsl";
import { SELECTION_RING_PROFILE } from "../../../../packages/game-renderer/src/selectionRing";
import { factionForTeam } from "../../../../packages/game-renderer/src/battle/factionColors";
import { linearAlbedoWgsl } from "./soldierFaction";

export type OverlayKind = "line" | "triangle" | "ring" | "marker";

/** Unlit source overlay materials, before the shared scene grade. */
export function overlayShader(kind: OverlayKind, alpha = 1) {
  const instanced = kind === "ring" || kind === "marker";
  const P = SELECTION_RING_PROFILE;
  const faction = (n: number) => `vec3f(${factionForTeam(n).primary.join(",")})`;
  const vertex =
    kind === "ring"
      ? `
    let world=vec3f(a.xy+p.xy*a.w,a.z);
    return V(projectWorld(world),b,p.xy);`
      : kind === "marker"
        ? `
    let world=vec3f(a.xy,0)+basis.right.xyz*(p.x*b.x*${M.halfWidth})+basis.up.xyz*(p.y*b.x*${M.halfHeight});
    return V(projectWorld(world),vec4f(a.w,b.y,0,0),p.xy);`
        : `
    return V(projectWorld(p),vec4f(a.rgb,${kind === "line" ? "alpha" : "a.a"}),vec2f(0));`;
  const fragment =
    kind === "ring"
      ? `
    let d=length(v.local);
    let ring=smoothstep(1.0,${P.outerEdge},d)*smoothstep(${P.innerCut},${P.innerFade},d);
    let fill=smoothstep(${P.fillOuterStart},${P.fillOuterEnd},d)*smoothstep(${P.innerCut - P.fillInnerBelowCut},${P.innerCut + P.fillInnerAboveCut},d)*${P.fillAlpha};
    return vec4f(linearAlbedo(v.color.rgb*${BATTLE_RING_TINT_GAIN}),max(ring*${P.ringAlpha},fill)*v.color.a);`
      : kind === "marker"
        ? `
    if(1.0-step(${M.edgeRadius},length(v.local))<=0.5){discard;}
    let accent=mix(mix(${faction(0)},${faction(1)},step(0.5,v.color.x)),${faction(2)},step(1.5,v.color.x));
    let body=mix(vec3f(${M.bodyLow.join(",")}),vec3f(${M.bodyHigh.join(",")}),clamp(1.0-abs(v.local.y),0,1));
    let stripe=smoothstep(${M.stripeHalfWidth},0.0,abs(v.local.x+${-M.stripeCenter}));
    return vec4f(linearAlbedo(mix(body,accent,stripe)*(1.0-v.color.y*${M.lodDim})),1.0);`
        : `
    return vec4f(linearAlbedo(v.color.rgb),v.color.a*${alpha});`;
  return `${WORLD_CAMERA_WGSL}
fn linearAlbedo${linearAlbedoWgsl}
${kind === "marker" ? "struct Basis { right:vec4f,up:vec4f }; @group(1) @binding(0) var<uniform> basis:Basis;" : ""}
struct V { @builtin(position) clip:vec4f,@location(0) color:vec4f,@location(1) local:vec2f };
@vertex fn vertex(@location(0) p:vec3f,@location(1) a:${kind === "line" ? "vec3f" : "vec4f"}${instanced ? ",@location(2) b:vec4f" : kind === "line" ? ",@location(2) alpha:f32" : ""})->V {${vertex}}
@fragment fn fragment(v:V)->@location(0) vec4f {${fragment}}
`;
}
