import { RENDER_ORDER } from "../renderOrder";
import * as THREE from "three/webgpu";
import {
  attribute,
  cos,
  float,
  max,
  mix,
  sin,
  texture,
  transformNormalToView,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  corpsePresentationStrength,
  type CrowdInstance,
} from "../../../crowd-runtime/src/instanceData";
import type { ImpostorAtlas } from "../../../soldier-assets/bake/impostors/atlas";
import {
  hemiOctTileDirections,
  nearestHemiOctTile,
} from "../../../soldier-assets/src/impostorTile";
import { soldierFactionAccent } from "./factionAccent";

// Minimum on-screen billboard height as a fraction of viewport height. The
// battle rig's eye parks hundreds of metres up at max zoom-out, so a fixed
// world-space sprite projects to ~2 px — small enough that the mipmapped,
// alpha-tested atlas averages the soldier silhouette into its transparent
// margin and the whole sprite fails alphaTest at once (the army vanishing over
// one scroll tick). Flooring the projected size keeps the crowd readable as at
// least a small blob at any zoom. ~0.008 ≈ 6-9 px on typical viewports.
const IMPOSTOR_MIN_SCREEN_FRACTION = 0.008;

export class OctahedralImpostorLayer {
  private readonly mesh: THREE.Mesh;
  private geometry: THREE.InstancedBufferGeometry;
  private readonly camRight = uniform(new THREE.Vector3(1, 0, 0));
  private readonly camUp = uniform(new THREE.Vector3(0, 0, 1));
  private capacity = 0;
  private inst = new Float32Array(0);
  private meta = new Float32Array(0);
  private living = new Float32Array(0);
  private source: CrowdInstance[] = [];
  private readonly tileDirs: Float64Array;

  constructor(
    scene: THREE.Scene,
    private readonly atlas: ImpostorAtlas,
    private readonly modelScale = 1,
  ) {
    this.tileDirs = hemiOctTileDirections(atlas.columns, atlas.rows);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3),
    );
    this.geometry.setIndex([0, 1, 2, 2, 1, 3]);
    this.geometry.instanceCount = 0;

    const material = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
    material.alphaTest = 0.08;
    material.depthWrite = true;
    material.fog = true;
    const quad = attribute<"vec3">("position", "vec3");
    const inst = attribute<"vec4">("impostorInst", "vec4"); // x, y, elevation, faction
    const meta = attribute<"vec4">("impostorMeta", "vec4"); // tile, width, height, model yaw
    const right = vec3(this.camRight).mul(quad.x.mul(meta.y).mul(0.5));
    const up = vec3(this.camUp).mul(quad.y.mul(meta.z).mul(0.5));
    material.positionNode = vec3(inst.x, inst.y, inst.z).add(right).add(up);

    const tile = varying(meta.x).toVar();
    const localUv = varying(quad.xy.mul(0.5).add(vec2(0.5))).toVar();
    const row = tile.div(float(this.atlas.columns)).floor().toVar();
    const col = tile.sub(row.mul(float(this.atlas.columns))).toVar();
    const atlasUv = vec2(
      col.add(localUv.x).div(float(this.atlas.columns)),
      // GPU render targets have top-origin V in WebGPU (unlike CanvasTexture).
      // Preserve both the selected row and upright local tile orientation.
      row.add(1).sub(localUv.y).div(float(this.atlas.rows)),
    );
    const sample = texture(this.atlas.textures.albedo, atlasUv).toVar();
    // All property channels have zero transparent texels. Filtering therefore
    // associates them with coverage; unassociate before using material values.
    const coverage = max(sample.a, 0.0001);
    const orm = texture(this.atlas.textures.orm, atlasUv).div(coverage).toVar();
    const normalAndContact = texture(this.atlas.textures.normal, atlasUv).div(coverage).toVar();
    const normal = normalAndContact.rgb.mul(2).sub(1).normalize().toVar();
    const faction = varying(inst.w).toVar();
    const yaw = varying(meta.w);
    const c = cos(yaw),
      s = sin(yaw);
    const worldNormal = vec3(
      normal.x.mul(c).sub(normal.y.mul(s)),
      normal.x.mul(s).add(normal.y.mul(c)),
      normal.z,
    );
    // This normal is sampled per fragment. The mesh-tier viewNormalNode helper
    // intentionally interpolates a vertex normal and must not hoist atlas reads.
    material.normalNode = transformNormalToView(worldNormal.normalize());
    material.roughnessNode = orm.g;
    material.metalnessNode = orm.b;
    // Contact grounding is a separate posed property, not authored occlusion.
    // Fade fixed-pose grounding out with the corpse shading blend.
    const living = varying(attribute<"float">("impostorLiving", "float"));
    material.aoNode = orm.r.mul(mix(1, normalAndContact.a, living));
    material.colorNode = vec4(
      mix(sample.rgb.div(coverage), soldierFactionAccent(faction), orm.a),
      sample.a,
    );

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = "physical-crowd-far-impostors";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.worldOpaque;
    this.mesh.castShadow = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  upload(instances: CrowdInstance[]): void {
    this.source = instances;
    this.mesh.visible = instances.length > 0;
    if (instances.length === 0) {
      this.geometry.instanceCount = 0;
      return;
    }
    if (instances.length > this.capacity) {
      if (this.capacity > 0) {
        // Renew the geometry identity so Three registers retirement for every growth.
        this.geometry.dispose();
        const next = new THREE.InstancedBufferGeometry();
        next.index = this.geometry.index;
        next.attributes = { ...this.geometry.attributes };
        this.geometry = this.mesh.geometry = next;
      }
      this.capacity = Math.max(instances.length, this.capacity * 2, 512);
      this.inst = new Float32Array(this.capacity * 4);
      this.meta = new Float32Array(this.capacity * 4);
      this.living = new Float32Array(this.capacity);
      this.geometry.setAttribute("impostorInst", new THREE.InstancedBufferAttribute(this.inst, 4));
      this.geometry.setAttribute("impostorMeta", new THREE.InstancedBufferAttribute(this.meta, 4));
      this.geometry.setAttribute(
        "impostorLiving",
        new THREE.InstancedBufferAttribute(this.living, 1),
      );
    }
    for (let i = 0; i < instances.length; i++) {
      const src = instances[i];
      const o = i * 4;
      const angle = src.facing - Math.PI / 2;
      const center = this.atlas.center;
      this.inst[o] =
        src.x + (center.x * Math.cos(angle) - center.y * Math.sin(angle)) * this.modelScale;
      this.inst[o + 1] =
        src.y + (center.x * Math.sin(angle) + center.y * Math.cos(angle)) * this.modelScale;
      this.inst[o + 2] = (src.elevation ?? 0) + center.z * this.modelScale;
      this.inst[o + 3] = src.faction;
      this.meta[o] = 0;
      this.meta[o + 1] = this.atlas.worldSpan * this.modelScale;
      this.meta[o + 2] = this.atlas.worldSpan * this.modelScale;
      this.meta[o + 3] = angle;
      this.living[i] = 1 - corpsePresentationStrength(src);
    }
    (this.geometry.getAttribute("impostorInst") as THREE.InstancedBufferAttribute).needsUpdate =
      true;
    (this.geometry.getAttribute("impostorMeta") as THREE.InstancedBufferAttribute).needsUpdate =
      true;
    (this.geometry.getAttribute("impostorLiving") as THREE.InstancedBufferAttribute).needsUpdate =
      true;
    this.geometry.instanceCount = instances.length;
  }

  setCamera(camera: THREE.Camera): void {
    const m = camera.matrixWorld.elements;
    this.camRight.value.set(m[0], m[1], m[2]).normalize();
    this.camUp.value.set(m[4], m[5], m[6]).normalize();
    const eye = new THREE.Vector3();
    camera.getWorldPosition(eye);
    // Half-angle of the vertical FOV, for the projected screen-size floor below.
    const fovY = "fov" in camera ? ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180 : 0;
    const tanHalfFov = fovY > 0 ? Math.tan(fovY / 2) : 0;
    const localDir = new THREE.Vector3();
    for (let i = 0; i < this.source.length; i++) {
      const src = this.source[i];
      localDir.set(eye.x - src.x, eye.y - src.y, eye.z - (src.elevation ?? 0));
      const dist = localDir.length();
      localDir.normalize();
      rotateViewDirectionIntoSoldierLocal(localDir, src.facing);
      const o = i * 4;
      this.meta[o] = nearestHemiOctTile(
        localDir.x,
        localDir.y,
        localDir.z,
        this.atlas.columns,
        this.atlas.rows,
        this.tileDirs,
      );
      // Screen-size floor: enlarge the world-space billboard whenever it would
      // project below the minimum viewport fraction, so a far crowd stays a
      // visible blob instead of sub-pixel-vanishing through the alpha-tested
      // mip chain. screenFraction is the projected height as a fraction of the
      // viewport (perspective: worldHeight / (2 · depth · tan(fovY/2))).
      let scale = this.modelScale;
      if (tanHalfFov > 0 && dist > 0) {
        const screenFraction = (this.atlas.worldSpan * this.modelScale) / (2 * dist * tanHalfFov);
        if (screenFraction < IMPOSTOR_MIN_SCREEN_FRACTION)
          scale *= IMPOSTOR_MIN_SCREEN_FRACTION / screenFraction;
      }
      this.meta[o + 1] = this.atlas.worldSpan * scale;
      this.meta[o + 2] = this.atlas.worldSpan * scale;
    }
    const attr = this.geometry.getAttribute("impostorMeta") as
      | THREE.InstancedBufferAttribute
      | undefined;
    if (attr) attr.needsUpdate = true;
  }

  stats() {
    return {
      impostorInstances: this.source.length,
      impostorDrawCalls: this.source.length > 0 ? 1 : 0,
      atlas: `${this.atlas.columns}x${this.atlas.rows}x${this.atlas.tileSize}`,
      tileSelection: "nearest",
      factionMask: "explicit authored mask; lit material property atlas",
      atlasMetrics: this.atlas.metrics,
    };
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.atlas.dispose();
  }
}

function rotateViewDirectionIntoSoldierLocal(dir: THREE.Vector3, facing: number): void {
  const angle = Math.PI / 2 - facing;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = dir.x * c - dir.y * s;
  const y = dir.x * s + dir.y * c;
  dir.x = x;
  dir.y = y;
  dir.normalize();
}
