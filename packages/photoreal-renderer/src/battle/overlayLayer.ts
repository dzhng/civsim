// overlayLayer — the battle world's overlay layers: ground cues (depth-tested
// world decal lines draped on the terrain surface), selection/preview ring
// decals (the shared cross-substrate ring profile), effect lines + debug
// triangles (overlay band, no depth), and the far-LOD marker impostors as
// camera-facing TSL billboards. Upload contracts are unchanged: the SAME
// Float32Array layouts drawTacticalLines/drawTris feed the bespoke passes.
// The upload contracts carry display-referred colours (authored for the
// bespoke swapchain); the frame is tonemapped sRGB (AgX), so
// each overlay linearizes through the one linearAlbedo seam, so authored overlay
// colors keep their hue through the transform.
import {
  BATTLE_MARKER_PROFILE,
  BATTLE_RING_TINT_GAIN,
  prepareBattleLineVertices,
  writeBattleLineVertices,
  writeBattleTriangleVertices,
  writeBattleRingInstances,
  writeBattleMarkerInstances,
  type BattleLinePlacement,
  type MarkerInstance,
} from "../../../game-renderer/src/battle/overlayData";
import * as THREE from "three/webgpu";
import {
  attribute,
  clamp,
  float,
  length,
  max,
  mix,
  smoothstep,
  step,
  uniform,
  varying,
  vec3,
  vec4,
} from "three/tsl";
import { factionForTeam } from "../../../game-renderer/src/battle/factionColors";
import { SELECTION_RING_PROFILE } from "../../../game-renderer/src/selectionRing";
import { linearAlbedo } from "./battleTsl";
import { RENDER_ORDER } from "./terrainLayer";

/** A growable line-list layer fed by (x, y, r, g, b, a)-stride vertex arrays —
 *  the BattleGroundCuePass upload contract; the per-vertex alpha scales the
 *  layer alpha so transient cues fade to transparent. With `perVertexZ` the
 *  stride is instead (x, y, z, r, g, b) — the BattleEffectLinePass contract,
 *  alpha 1 — so lines can leave the ground plane (mid-flight arrows); the
 *  layer z becomes a bias only. With `drape` the (x, y) contract seats every
 *  vertex on the canonical terrain surface, subdividing long segments so a
 *  cross-field order line follows the ground instead of tunnelling through
 *  rises; the layer z is the lift above the surface. */
export class PhotorealLineLayer {
  private readonly lines: THREE.LineSegments;
  private capacity = 0;
  private vertexCount = 0;
  private readonly placement: BattleLinePlacement;

  constructor(
    scene: THREE.Scene,
    z: number,
    opts: {
      alpha: number;
      depthTest: boolean;
      renderOrder: number;
      perVertexZ?: boolean;
      drape?: { heightAt: (x: number, y: number) => number; step: number };
    },
  ) {
    this.placement = { z, perVertexZ: opts.perVertexZ, drape: opts.drape };
    const material = new THREE.LineBasicNodeMaterial({ transparent: true });
    material.depthTest = opts.depthTest;
    material.depthWrite = false;
    material.fog = false;
    material.colorNode = vec4(
      linearAlbedo(varying(attribute<"vec3">("lineColor", "vec3"))),
      varying(attribute<"float">("lineAlpha", "float")).mul(opts.alpha),
    );
    this.lines = new THREE.LineSegments(this.makeGeometry(128), material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = opts.renderOrder;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  private makeGeometry(capacity: number): THREE.BufferGeometry {
    this.capacity = capacity;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    geo.setAttribute("lineColor", new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    geo.setAttribute("lineAlpha", new THREE.BufferAttribute(new Float32Array(capacity), 1));
    return geo;
  }

  /** Same contract as the bespoke passes: floor(len / stride) vertices of
   *  (x, y, rgb, a) or (x, y, z, rgb) with perVertexZ. */
  upload(vertices: Float32Array): void {
    const { source: src, stride, zOff } = prepareBattleLineVertices(vertices, this.placement);
    const count = Math.floor(src.length / stride);
    this.vertexCount = count;
    this.lines.visible = count > 0;
    if (count > this.capacity) {
      const old = this.lines.geometry;
      this.lines.geometry = this.makeGeometry(Math.max(count, this.capacity * 2, 128));
      old.dispose();
    }
    const position = this.lines.geometry.getAttribute("position") as THREE.BufferAttribute;
    const color = this.lines.geometry.getAttribute("lineColor") as THREE.BufferAttribute;
    const alpha = this.lines.geometry.getAttribute("lineAlpha") as THREE.BufferAttribute;
    const pos = position.array as Float32Array;
    const col = color.array as Float32Array;
    const alp = alpha.array as Float32Array;
    writeBattleLineVertices(src, stride, zOff, this.placement, pos, col, alp);
    position.needsUpdate = true;
    color.needsUpdate = true;
    alpha.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, count);
  }

  stats() {
    return { vertices: this.vertexCount, lineSegments: Math.floor(this.vertexCount / 2) };
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}

/** A growable overlay triangle layer fed by (x, y, r, g, b, a)-stride vertex
 *  arrays — the BattleTrianglePass (drawTris/debug blocks) upload contract. */
export class PhotorealTriangleLayer {
  private readonly mesh: THREE.Mesh;
  private capacity = 0;
  private vertexCount = 0;

  constructor(scene: THREE.Scene, renderOrder: number) {
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide });
    material.depthTest = false;
    material.depthWrite = false;
    material.fog = false;
    const triColor = varying(attribute<"vec4">("triColor", "vec4"));
    material.colorNode = vec4(linearAlbedo(triColor.rgb), triColor.a);
    this.mesh = new THREE.Mesh(this.makeGeometry(192), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  private makeGeometry(capacity: number): THREE.BufferGeometry {
    this.capacity = capacity;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    geo.setAttribute("triColor", new THREE.BufferAttribute(new Float32Array(capacity * 4), 4));
    return geo;
  }

  /** Same contract as BattleTrianglePass: floor(len / 6) vertices. */
  upload(vertices: Float32Array): void {
    const count = Math.floor(vertices.length / 6);
    this.vertexCount = count;
    this.mesh.visible = count > 0;
    if (count > this.capacity) {
      const old = this.mesh.geometry;
      this.mesh.geometry = this.makeGeometry(Math.max(count, this.capacity * 2, 192));
      old.dispose();
    }
    const position = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const color = this.mesh.geometry.getAttribute("triColor") as THREE.BufferAttribute;
    const pos = position.array as Float32Array;
    const col = color.array as Float32Array;
    writeBattleTriangleVertices(vertices, pos, col);
    position.needsUpdate = true;
    color.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, count);
  }

  stats() {
    return { vertices: this.vertexCount, triangles: Math.floor(this.vertexCount / 3) };
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Instanced soft ground-ring decals — the campaign selection-ring profile
 *  (selectionPass.ts army ring: thin smoothstepped rim + a whisper of fill)
 *  shared with the battle world for per-soldier selection. Each instance seats
 *  on the canonical terrain surface at upload and is depth-tested read-only,
 *  so soldiers and rises occlude it like any world decal. Upload contract:
 *  (x, y, radius, r, g, b, a) per ring — the alpha scales the profile's ring
 *  and fill alphas so preview rings fade to transparent. */
export class PhotorealRingLayer {
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private capacity = 0;
  private inst = new Float32Array(0);
  private tint = new Float32Array(0);
  private count = 0;

  constructor(
    scene: THREE.Scene,
    private readonly heightAt: (x: number, y: number) => number,
    private readonly lift: number,
  ) {
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3),
    );
    this.geometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.geometry.instanceCount = 0;

    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide });
    material.depthTest = true;
    material.depthWrite = false;
    material.fog = false;
    const quad = attribute<"vec3">("position", "vec3");
    const inst = attribute<"vec4">("ringInst", "vec4"); // (x, y, z, radius)
    const ringTint = attribute<"vec4">("ringColor", "vec4"); // (r, g, b, a)
    material.positionNode = vec3(
      inst.x.add(quad.x.mul(inst.w)),
      inst.y.add(quad.y.mul(inst.w)),
      inst.z,
    );
    const local = varying(quad.xy).toVar();
    const color = varying(ringTint);
    const d = length(local);
    const P = SELECTION_RING_PROFILE;
    const ring = smoothstep(float(1.0), float(P.outerEdge), d).mul(
      smoothstep(float(P.innerCut), float(P.innerFade), d),
    );
    const fill = smoothstep(float(P.fillOuterStart), float(P.fillOuterEnd), d)
      .mul(
        smoothstep(
          float(P.innerCut - P.fillInnerBelowCut),
          float(P.innerCut + P.fillInnerAboveCut),
          d,
        ),
      )
      .mul(P.fillAlpha);
    material.colorNode = vec4(
      linearAlbedo(color.rgb.mul(BATTLE_RING_TINT_GAIN)),
      max(ring.mul(P.ringAlpha), fill).mul(color.a),
    );

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.groundCues;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  upload(rings: Float32Array): void {
    const count = Math.floor(rings.length / 7);
    this.count = count;
    this.mesh.visible = count > 0;
    if (count === 0) {
      this.geometry.instanceCount = 0;
      return;
    }
    if (count > this.capacity) {
      this.capacity = Math.max(count, this.capacity * 2, 256);
      this.inst = new Float32Array(this.capacity * 4);
      this.tint = new Float32Array(this.capacity * 4);
      this.geometry.setAttribute("ringInst", new THREE.InstancedBufferAttribute(this.inst, 4));
      this.geometry.setAttribute("ringColor", new THREE.InstancedBufferAttribute(this.tint, 4));
    }
    writeBattleRingInstances(rings, this.heightAt, this.lift, this.inst, this.tint);
    for (const name of ["ringInst", "ringColor"] as const) {
      (this.geometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.geometry.instanceCount = count;
  }

  stats() {
    return { rings: this.count };
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Far-LOD marker impostors as camera-facing billboards (the 04c/04d re-home).
 *  Retains the production battle marker upload and shading contract;
 *  same background-band ordering (before the depth-tested world, so terrain
 *  painted after them covers them exactly like the bespoke frame). */
export class PhotorealMarkerLayer {
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly camRight = uniform(new THREE.Vector3(1, 0, 0));
  private readonly camUp = uniform(new THREE.Vector3(0, 1, 0));
  private capacity = 0;
  private inst = new Float32Array(0);
  private meta = new Float32Array(0);
  private count = 0;

  constructor(scene: THREE.Scene) {
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3),
    );
    this.geometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.geometry.instanceCount = 0;

    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    material.depthTest = false;
    material.depthWrite = false;
    material.fog = false;
    material.alphaTest = 0.5;
    const quad = attribute<"vec3">("position", "vec3");
    const inst = attribute<"vec4">("markerInst", "vec4"); // (x, y, facing, faction)
    const meta = attribute<"vec4">("markerMeta", "vec4"); // (size, lod, 0, 0)
    const right = vec3(this.camRight).mul(quad.x.mul(meta.x).mul(BATTLE_MARKER_PROFILE.halfWidth));
    const up = vec3(this.camUp).mul(quad.y.mul(meta.x).mul(BATTLE_MARKER_PROFILE.halfHeight));
    material.positionNode = vec3(inst.x, inst.y, 0.0).add(right).add(up);
    const local = varying(quad.xy).toVar();
    const faction = varying(inst.w);
    const lod = varying(meta.y);
    const blue = vec3(...factionForTeam(0).primary);
    const red = vec3(...factionForTeam(1).primary);
    const neutral = vec3(...factionForTeam(2).primary);
    let accent = mix(blue, red, step(0.5, faction));
    accent = mix(accent, neutral, step(1.5, faction));
    const d = length(local);
    const inside = float(1.0).sub(step(BATTLE_MARKER_PROFILE.edgeRadius, d));
    const body = mix(
      vec3(...BATTLE_MARKER_PROFILE.bodyLow),
      vec3(...BATTLE_MARKER_PROFILE.bodyHigh),
      clamp(float(1.0).sub(local.y.abs()), 0.0, 1.0),
    );
    const stripe = smoothstep(
      float(BATTLE_MARKER_PROFILE.stripeHalfWidth),
      float(0.0),
      local.x.add(-BATTLE_MARKER_PROFILE.stripeCenter).abs(),
    );
    const lodDim = float(1.0).sub(lod.mul(BATTLE_MARKER_PROFILE.lodDim));
    material.colorNode = vec4(linearAlbedo(mix(body, accent, stripe).mul(lodDim)), inside);

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.markers;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setCameraBasis(camera: THREE.Camera): void {
    const m = camera.matrixWorld.elements;
    this.camRight.value.set(m[0], m[1], m[2]).normalize();
    this.camUp.value.set(m[4], m[5], m[6]).normalize();
  }

  upload(markers: MarkerInstance[]): void {
    this.count = markers.length;
    this.mesh.visible = markers.length > 0;
    if (markers.length === 0) {
      this.geometry.instanceCount = 0;
      return;
    }
    if (markers.length > this.capacity) {
      this.capacity = Math.max(markers.length, this.capacity * 2, 256);
      this.inst = new Float32Array(this.capacity * 4);
      this.meta = new Float32Array(this.capacity * 4);
      this.geometry.setAttribute("markerInst", new THREE.InstancedBufferAttribute(this.inst, 4));
      this.geometry.setAttribute("markerMeta", new THREE.InstancedBufferAttribute(this.meta, 4));
    }
    writeBattleMarkerInstances(markers, this.inst, this.meta);
    for (const name of ["markerInst", "markerMeta"] as const) {
      (this.geometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.geometry.instanceCount = markers.length;
  }

  stats() {
    return { markers: this.count };
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
