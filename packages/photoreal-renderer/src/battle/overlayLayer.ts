// overlayLayer — the overlay ports of slice 08a (they land HERE, not at the
// 08b flip): ground cues/selection (depth-tested world decal lines, gold glow
// per aesthetics rule 6), effect lines + debug triangles (overlay band, no
// depth), and the far-LOD marker impostors re-homed as camera-facing TSL
// billboards (the 04c/04d item). Upload contracts are unchanged: the SAME
// Float32Array layouts drawTacticalLines/drawTris feed the bespoke passes.
// The upload contracts carry display-referred colours (authored for the
// bespoke swapchain); since slice 09 the frame is ACES-tonemapped sRGB, so
// each overlay linearizes through the one linearAlbedo seam — the gold glow
// (rule 6) and faction accents keep their authored hue through the transform.
import * as THREE from 'three/webgpu';
import {
  attribute, clamp, float, length, max, mix, smoothstep, step, uniform, varying, vec3, vec4,
} from 'three/tsl';
import type { MarkerInstance } from '../../../renderer-core/src/frameShell';
import { linearAlbedo } from './battleTsl';
import { RENDER_ORDER } from './terrainLayer';

/** A growable line-list layer fed by (x, y, r, g, b)-stride vertex arrays —
 *  the BattleGroundCuePass / BattleEffectLinePass upload contract. */
export class PhotorealLineLayer {
  private readonly lines: THREE.LineSegments;
  private capacity = 0;
  private vertexCount = 0;

  constructor(
    scene: THREE.Scene,
    private readonly z: number,
    opts: { alpha: number; depthTest: boolean; renderOrder: number },
  ) {
    const material = new THREE.LineBasicNodeMaterial({ transparent: true });
    material.depthTest = opts.depthTest;
    material.depthWrite = false;
    material.fog = false;
    material.colorNode = vec4(linearAlbedo(varying(attribute<'vec3'>('lineColor', 'vec3'))), opts.alpha);
    this.lines = new THREE.LineSegments(this.makeGeometry(128), material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = opts.renderOrder;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  private makeGeometry(capacity: number): THREE.BufferGeometry {
    this.capacity = capacity;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    geo.setAttribute('lineColor', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    return geo;
  }

  /** Same contract as the bespoke pass: floor(len / 5) vertices of (x, y, rgb). */
  upload(vertices: Float32Array): void {
    const count = Math.floor(vertices.length / 5);
    this.vertexCount = count;
    this.lines.visible = count > 0;
    if (count > this.capacity) {
      const old = this.lines.geometry;
      this.lines.geometry = this.makeGeometry(Math.max(count, this.capacity * 2, 128));
      old.dispose();
    }
    const position = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const color = this.lines.geometry.getAttribute('lineColor') as THREE.BufferAttribute;
    const pos = position.array as Float32Array;
    const col = color.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const o = i * 5;
      pos[i * 3] = vertices[o];
      pos[i * 3 + 1] = vertices[o + 1];
      pos[i * 3 + 2] = this.z;
      col[i * 3] = vertices[o + 2];
      col[i * 3 + 1] = vertices[o + 3];
      col[i * 3 + 2] = vertices[o + 4];
    }
    position.needsUpdate = true;
    color.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, count);
  }

  stats() {
    return { vertices: this.vertexCount, lineSegments: Math.floor(this.vertexCount / 2) };
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
    const triColor = varying(attribute<'vec4'>('triColor', 'vec4'));
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
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    geo.setAttribute('triColor', new THREE.BufferAttribute(new Float32Array(capacity * 4), 4));
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
    const position = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const color = this.mesh.geometry.getAttribute('triColor') as THREE.BufferAttribute;
    const pos = position.array as Float32Array;
    const col = color.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const o = i * 6;
      pos[i * 3] = vertices[o];
      pos[i * 3 + 1] = vertices[o + 1];
      pos[i * 3 + 2] = 0;
      col[i * 4] = vertices[o + 2];
      col[i * 4 + 1] = vertices[o + 3];
      col[i * 4 + 2] = vertices[o + 4];
      col[i * 4 + 3] = vertices[o + 5];
    }
    position.needsUpdate = true;
    color.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, count);
  }

  stats() {
    return { vertices: this.vertexCount, triangles: Math.floor(this.vertexCount / 3) };
  }
}

/** Far-LOD marker impostors as camera-facing billboards (the 04c/04d re-home).
 *  Same MarkerInstance inputs and fragment shading as the frameShell builtin;
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
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0,
    ]), 3));
    this.geometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.geometry.instanceCount = 0;

    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    material.depthTest = false;
    material.depthWrite = false;
    material.fog = false;
    material.alphaTest = 0.5;
    const quad = attribute<'vec3'>('position', 'vec3');
    const inst = attribute<'vec4'>('markerInst', 'vec4'); // (x, y, facing, faction)
    const meta = attribute<'vec4'>('markerMeta', 'vec4'); // (size, lod, 0, 0)
    const right = vec3(this.camRight).mul(quad.x.mul(meta.x).mul(0.34));
    const up = vec3(this.camUp).mul(quad.y.mul(meta.x).mul(0.58));
    material.positionNode = vec3(inst.x, inst.y, 0.0).add(right).add(up);
    const local = varying(quad.xy).toVar();
    const faction = varying(inst.w);
    const lod = varying(meta.y);
    const blue = vec3(0.20, 0.42, 0.88);
    const red = vec3(0.84, 0.24, 0.20);
    const neutral = vec3(0.76, 0.67, 0.42);
    let accent = mix(blue, red, step(0.5, faction));
    accent = mix(accent, neutral, step(1.5, faction));
    const d = length(local);
    const inside = float(1.0).sub(step(1.15, d));
    const body = mix(vec3(0.56, 0.41, 0.24), vec3(0.78, 0.65, 0.42), clamp(float(1.0).sub(local.y.abs()), 0.0, 1.0));
    const stripe = smoothstep(float(0.02), float(0.0), local.x.add(0.32).abs());
    const lodDim = float(1.0).sub(lod.mul(0.08));
    material.colorNode = vec4(linearAlbedo(mix(body, accent, max(stripe, 0.58)).mul(lodDim)), inside);

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
      this.geometry.setAttribute('markerInst', new THREE.InstancedBufferAttribute(this.inst, 4));
      this.geometry.setAttribute('markerMeta', new THREE.InstancedBufferAttribute(this.meta, 4));
    }
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const o = i * 4;
      this.inst[o] = m.x;
      this.inst[o + 1] = m.y;
      this.inst[o + 2] = m.facing ?? 0;
      this.inst[o + 3] = m.faction ?? 0;
      this.meta[o] = m.size ?? 1;
      this.meta[o + 1] = m.lod ?? 0;
    }
    for (const name of ['markerInst', 'markerMeta'] as const) {
      (this.geometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.geometry.instanceCount = markers.length;
  }

  stats() {
    return { markers: this.count };
  }
}
