// Shared TSL vocabulary for the photoreal battle world: the noise helpers the
// bespoke WGSL passes shared (cameraWgsl.ts viewForwardDist, the groundPass
// hash/vnoise/fbm/ridge family), ported once at 08a, plus the slice-09
// standard-material seams every battle layer uses (linearAlbedo — the one
// display→linear conversion; viewNormalNode — the one normalNode hook).
//
// Determinism: nothing here reads the TSL `time` node (banned); every animated
// term keys off uniforms owned by PhotorealBattleWorld.
import {
  abs, clamp, cos, dot, float, floor, fract, mix, sRGBTransferEOTF, sin, smoothstep, transformNormalToView, uniform, varying, vec2, vec3,
} from 'three/tsl';
import { Vector2 } from 'three';
import type { Node } from 'three/webgpu';

export type FloatNode = Node<'float'>;
export type Vec2Node = Node<'vec2'>;
export type Vec3Node = Node<'vec3'>;
export type Vec4Node = Node<'vec4'>;

export type Rgb = readonly [number, number, number];

export function rgbNode(c: Rgb): Vec3Node {
  return vec3(c[0], c[1], c[2]);
}

/** The per-frame camera/clock uniforms the ported battle shaders read — the
 *  TSL mirror of the bespoke `cam` uniform scalars that survive projection
 *  (focus, time, dt). One owner: PhotorealBattleWorld writes them; the aerial
 *  hook reads `focus` as its observer.
 *  `time` mirrors cam.time — the production battle never sets it, so parity
 *  captures freeze it at 0; live viewing may drive it. `dt` is the single
 *  rAF delta threaded from scene.ts for future stateful render/audio updates. */
export function createBattleFrameUniforms() {
  return {
    focus: uniform(new Vector2(0, 0)),
    time: uniform(0),
    dt: uniform(0),
  };
}

export type BattleFrameUniforms = ReturnType<typeof createBattleFrameUniforms>;

/** WGSL `hash(p)` from groundPass/frameShell — a 2D value hash. */
export function hashN(p: Vec2Node): FloatNode {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  const q = p3.add(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33))).toVar();
  return fract(q.x.add(q.y).mul(q.z));
}

/** WGSL `vnoise(p)` — bilinear value noise over the hash lattice. */
export function vnoiseN(p: Vec2Node): FloatNode {
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0))).toVar();
  return mix(
    mix(hashN(i), hashN(i.add(vec2(1.0, 0.0))), u.x),
    mix(hashN(i.add(vec2(0.0, 1.0))), hashN(i.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
}

/** WGSL `fbm(p)` from groundPass — three octaves of vnoise. */
export function fbmN(p: Vec2Node): FloatNode {
  return vnoiseN(p).mul(0.52)
    .add(vnoiseN(p.mul(2.11).add(vec2(4.3, 1.7))).mul(0.31))
    .add(vnoiseN(p.mul(4.07).add(vec2(9.1, 6.4))).mul(0.17));
}

/** WGSL `ridge(p)`/`ridged(p)` — folded value noise. */
export function ridgeN(p: Vec2Node): FloatNode {
  const r = float(1.0).sub(abs(vnoiseN(p).mul(2.0).sub(1.0))).toVar();
  return r.mul(r);
}

/** WGSL `fnoise(p)` from gerstnerField — the sin-dot hash noise the water
 *  foam/swash speckle uses (distinct from the ground hash family). */
export function fnoiseN(p: Vec2Node): FloatNode {
  const fhash = (q: Vec2Node): FloatNode => fract(sin(dot(q, vec2(127.1, 311.7))).mul(43758.5453));
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0))).toVar();
  return mix(
    mix(fhash(i), fhash(i.add(vec2(1.0, 0.0))), u.x),
    mix(fhash(i.add(vec2(0.0, 1.0))), fhash(i.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
}

/** The battle palette (vertex tints, style constants, preset colours) is
 *  authored display-referred — the bespoke frame wrote those values straight
 *  to a non-sRGB swapchain. A standard-material response needs LINEAR albedo,
 *  so every battle material converts its composed albedo through the sRGB
 *  EOTF exactly once, at the end (compose in display space, light in linear —
 *  the same contract as an sRGB-tagged albedo texture). */
export function linearAlbedo(display: Vec3Node): Vec3Node {
  // The cast re-types the untyped Fn return (@types/three drops the node type).
  return sRGBTransferEOTF(display) as unknown as Vec3Node;
}

/** The standard-material normal hook for battle geometry: attributes are
 *  authored in world (z-up) space on identity-transform meshes, and
 *  `normalNode` expects a VIEW-space normal (07's recorded hazard) — transform
 *  in the vertex stage, interpolate, renormalize.
 *
 *  Setting `normalNode` also OPTS OUT of three's DoubleSide back-face normal
 *  flip (`negateOnBackSide` only wraps geometry-derived normals): both faces
 *  shade with the authored normal. That is deliberate for thin double-sided
 *  cards (grass blades, banners, foliage), where the flip renders the back of
 *  a lit card dark. Any future material that skips this hook and uses the
 *  stock normal path with DoubleSide re-inherits the flip. */
export function viewNormalNode(worldNormal: Vec3Node): Vec3Node {
  return varying(transformNormalToView(worldNormal)).normalize();
}

/** WGSL smoothstep with scalar edges (all ports use constant edges). */
export function smoothstepN(edge0: number, edge1: number, x: FloatNode): FloatNode {
  return smoothstep(float(edge0), float(edge1), x);
}

/** clamp(x, 0, 1). */
export function saturateN(x: FloatNode): FloatNode {
  return clamp(x, 0.0, 1.0);
}

/** Rotate a local XY by an instance yaw (the cy/sy pattern every instanced
 *  battle shader uses). Returns [rotatedX, rotatedY, cosYaw, sinYaw]. */
export function rotateYawN(x: FloatNode, y: FloatNode, yaw: FloatNode): { rx: FloatNode; ry: FloatNode; cy: FloatNode; sy: FloatNode } {
  const cy = cos(yaw).toVar();
  const sy = sin(yaw).toVar();
  return {
    rx: x.mul(cy).sub(y.mul(sy)),
    ry: x.mul(sy).add(y.mul(cy)),
    cy,
    sy,
  };
}
