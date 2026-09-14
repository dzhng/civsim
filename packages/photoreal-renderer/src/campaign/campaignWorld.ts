import * as THREE from "three/webgpu";
import { attribute, varying, vec3, vec4, mix, uniform, modelNormalMatrix } from "three/tsl";
import { PhotorealWorld } from "../world";
import { applyCamera3d } from "../cameraBridge";
import { applyCivsimEnvironment } from "../environment";
import { CIVSIM_ENVIRONMENTS } from "../../../game-renderer/src/environment/environment";
import { createGroundMesh, RENDER_ORDER } from "../battle/terrainLayer";
import { createBattleFrameUniforms, linearAlbedo, viewNormalNode } from "../battle/battleTsl";
import { PhotorealStandardLayer } from "../landscape/standardLayer";
import { SELECTION_GREEN } from "../../../game-renderer/src/overlays";
import { SELECTION_RING_PROFILE } from "../../../game-renderer/src/selectionRing";
import { STANDARD_SIZE_TIERS } from "../../../game-renderer/src/models/shared/standardAsset";
import type { MeshData } from "../../../game-renderer/src/models/shared/meshBuilder";
import type { BattleFactionId } from "../../../game-renderer/src/battle/factionColors";
import type { RenderedSurface } from "../../../game-renderer/src/terrain/surface";
import { projectPoint, screenRay, type Camera3DParams } from "../../../renderer-core/src/camera3d";

export interface CampaignWorldObject {
  id: string;
  x: number;
  y: number;
  scale: number;
  model: MeshData;
  label: string;
  faction: BattleFactionId;
  standardBase?: number;
}

export interface CampaignComposition {
  surface: RenderedSurface;
  objects: readonly CampaignWorldObject[];
  /** Existing roadGeometry output, stride ten. */
  roads: Float32Array;
  territory: readonly [number, number, number];
  /** Canonical campaign visibility: one means hidden. */
  fogAt: (x: number, y: number) => number;
}

/** Campaign's physical composition owner. The app owns commands and DOM cards;
 * this world owns their 3D anchors, occlusion, and presented-surface picking. */
export class PhotorealCampaignWorld {
  readonly camera = new THREE.PerspectiveCamera();
  private readonly frame = createBattleFrameUniforms();
  private readonly standards: PhotorealStandardLayer;
  private readonly objects: { input: CampaignWorldObject; mesh: THREE.Mesh }[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private pose: Camera3DParams | null = null;
  private width = 1;
  private height = 1;
  private selected: string | null = null;
  private fogEnabled = false;
  private readonly fogAmount = uniform(0);
  private readonly selection: THREE.Mesh;

  static async create(canvas: HTMLCanvasElement, composition: CampaignComposition) {
    return new PhotorealCampaignWorld(await PhotorealWorld.create(canvas), composition);
  }
  private constructor(
    readonly world: PhotorealWorld,
    readonly composition: CampaignComposition,
  ) {
    const environment = applyCivsimEnvironment(world, CIVSIM_ENVIRONMENTS.golden, {
      aerialObserver: vec3(this.frame.focus, 0),
    });
    const sun = world.sunLight!;
    const domain = composition.surface.domain;
    const cx = domain.ox + ((domain.columns - 1) * domain.cell) / 2,
      cy = domain.oy + ((domain.rows - 1) * domain.cell) / 2;
    const extent = Math.max(domain.columns, domain.rows) * domain.cell * 0.8;
    sun.position.set(
      cx + environment.sunDirection[0] * extent * 2,
      cy + environment.sunDirection[1] * extent * 2,
      environment.sunDirection[2] * extent * 2,
    );
    sun.target.position.set(cx, cy, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -extent,
      right: extent,
      top: extent,
      bottom: -extent,
      near: 1,
      far: extent * 5,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.normalBias = 0.08;
    // Deliberately submit objects before terrain: the common depth buffer must
    // still hide their rear faces and any objects behind raised ground.
    for (const input of composition.objects) {
      const mesh = modelMesh(input.model);
      const z = composition.surface.sampleRendered(input.x, input.y)!.position[2];
      mesh.position.set(input.x, input.y, z);
      mesh.scale.setScalar(input.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = input.id;
      this.add(mesh);
      this.objects.push({ input, mesh });
    }
    this.standards = new PhotorealStandardLayer(world.scene, world.uTime, "campaign-army");
    const ground = createGroundMesh(this.frame, composition.surface.mesh, { detailScale: 2 });
    ground.castShadow = true;
    this.add(ground);
    this.colorLandscape(ground, composition.surface.mesh.vertices, true);
    const road = roadMesh(composition.roads);
    this.colorLandscape(road, composition.roads, false);
    this.add(road);
    this.selection = new THREE.Mesh(new THREE.BufferGeometry(), decalMaterial());
    this.selection.renderOrder = RENDER_ORDER.groundCues + 1;
    this.selection.visible = false;
    this.add(this.selection);
  }
  private colorLandscape(mesh: THREE.Mesh, vertices: Float32Array, territory: boolean) {
    const fog = new Float32Array(vertices.length / 10);
    for (let i = 0; i < fog.length; i++)
      fog[i] = this.composition.fogAt(vertices[i * 10], vertices[i * 10 + 1]);
    mesh.geometry.setAttribute("campaignFog", new THREE.BufferAttribute(fog, 1));
    const material = mesh.material as THREE.MeshStandardNodeMaterial;
    const base = material.colorNode as THREE.Node<"vec4">;
    const tinted = territory
      ? mix(base.rgb, linearAlbedo(vec3(...this.composition.territory)), 0.12)
      : base.rgb;
    material.colorNode = vec4(
      mix(
        tinted,
        linearAlbedo(vec3(0.1, 0.11, 0.12)),
        varying(attribute<"float">("campaignFog", "float")).mul(this.fogAmount).mul(0.78),
      ),
      base.a,
    );
  }
  private add(mesh: THREE.Mesh) {
    this.meshes.push(mesh);
    this.world.scene.add(mesh);
  }

  setFog(enabled: boolean) {
    this.fogEnabled = enabled;
    this.fogAmount.value = enabled ? 1 : 0;
    for (const { input, mesh } of this.objects)
      mesh.visible = !enabled || this.composition.fogAt(input.x, input.y) < 0.5;
    if (this.selected && !this.objects.find((o) => o.input.id === this.selected)?.mesh.visible)
      this.selected = null;
    this.updateSelection();
  }
  select(id: string | null) {
    this.selected = this.objects.find((o) => o.input.id === id && o.mesh.visible)?.input.id ?? null;
    this.updateSelection();
  }
  private updateSelection() {
    const object = this.objects.find((o) => o.input.id === this.selected && o.mesh.visible);
    this.selection.visible = !!object;
    if (!object) return;
    const { input } = object,
      vertices: number[] = [];
    const radius = input.scale * 4.7;
    const profile = SELECTION_RING_PROFILE;
    const bands = [
      [profile.innerCut, 0],
      [profile.innerFade, profile.ringAlpha],
      [profile.outerEdge, profile.ringAlpha],
      [1, 0],
    ];
    for (let i = 0; i < 64; i++) {
      const a = (i * Math.PI * 2) / 64,
        b = ((i + 1) * Math.PI * 2) / 64;
      for (let band = 0; band < bands.length - 1; band++) {
        const [inner, ia] = bands[band],
          [outer, oa] = bands[band + 1];
        for (const triangle of [
          [
            [a, inner, ia],
            [a, outer, oa],
            [b, outer, oa],
          ],
          [
            [a, inner, ia],
            [b, outer, oa],
            [b, inner, ia],
          ],
        ]) {
          const points = triangle.map(([angle, r, alpha]) => {
            const x = input.x + Math.cos(angle) * radius * r,
              y = input.y + Math.sin(angle) * radius * r;
            const hit = this.composition.surface.sampleRendered(x, y);
            return hit ? [x, y, hit.position[2] + 0.42, ...SELECTION_GREEN, alpha] : null;
          });
          if (points.every((p) => p !== null)) for (const point of points) vertices.push(...point!);
        }
      }
    }
    this.selection.geometry.dispose();
    this.selection.geometry = colorGeometry(Float32Array.from(vertices), 7, 3);
  }
  render(pose: Camera3DParams, width: number, height: number, dpr = 1) {
    this.pose = pose;
    this.width = width;
    this.height = height;
    this.world.resize(width, height, dpr);
    this.frame.focus.value.set(pose.target[0], pose.target[1]);
    applyCamera3d(this.camera, pose);
    this.standards.upload(
      this.objects
        .filter((o) => o.mesh.visible)
        .map(({ input, mesh }, i) => ({
          unitId: i,
          x: input.x,
          y: input.y,
          z: mesh.position.z + (input.standardBase ?? 0) * input.scale,
          yaw: 0,
          scale: input.scale * 2,
          factionId: input.faction,
          selected: input.id === this.selected,
        })),
    );
    this.world.setTime(0);
    this.world.render(this.camera);
  }
  project(x: number, y: number, z: number) {
    if (!this.pose) return null;
    const p = projectPoint(this.pose, [x, y, z]);
    return {
      x: ((p.ndc[0] + 1) * this.width) / 2,
      y: ((1 - p.ndc[1]) * this.height) / 2,
      visible: p.clipW > 0,
    };
  }
  pick(x: number, y: number) {
    if (!this.pose) return null;
    const ray = screenRay(this.pose, (x / this.width) * 2 - 1, 1 - (y / this.height) * 2);
    const surface = this.composition.surface.raycastRendered(ray);
    this.raycaster.ray.origin.fromArray(ray.origin);
    this.raycaster.ray.direction.fromArray(ray.dir);
    const hits = this.raycaster.intersectObjects(
      this.objects.filter((o) => o.mesh.visible).map((o) => o.mesh),
      false,
    );
    const first = hits[0];
    if (
      first &&
      (!surface ||
        first.distance <= Math.hypot(...surface.position.map((v, i) => v - ray.origin[i])) + 0.01)
    )
      return first.object.name;
    return null;
  }
  anchors() {
    return this.objects.map(({ input, mesh }) => {
      const z = mesh.position.z + mesh.geometry.boundingBox!.max.z * input.scale;
      const screen = this.project(input.x, input.y, z);
      let visible = mesh.visible && !!screen?.visible;
      if (visible && this.pose && screen) {
        const ray = screenRay(
          this.pose,
          (screen.x / this.width) * 2 - 1,
          1 - (screen.y / this.height) * 2,
        );
        const hit = this.composition.surface.raycastRendered(ray);
        if (hit)
          visible =
            Math.hypot(...hit.position.map((v, i) => v - ray.origin[i])) >=
            Math.hypot(input.x - ray.origin[0], input.y - ray.origin[1], z - ray.origin[2]) - 0.01;
      }
      return {
        id: input.id,
        label: input.label,
        selected: input.id === this.selected,
        ...this.project(
          input.x,
          input.y,
          mesh.position.z +
            (input.standardBase ?? 0) * input.scale +
            STANDARD_SIZE_TIERS["campaign-army"].poleHeight * input.scale * 2,
        ),
        visible,
      };
    });
  }
  stats() {
    return {
      ...this.world.stats(),
      selected: this.selected,
      fog: this.fogEnabled,
      objects: this.objects.filter((o) => o.mesh.visible).length,
      surfaceRevision: this.composition.surface.revision,
      standards: this.standards.stats(),
    };
  }
  dispose() {
    this.standards.dispose();
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.world.dispose();
  }
}

function colorGeometry(
  vertices: Float32Array,
  stride: number,
  colorOffset: number,
  indices?: Uint16Array,
) {
  const geometry = new THREE.BufferGeometry(),
    count = vertices.length / stride;
  const positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    positions.set(vertices.subarray(i * stride, i * stride + 3), i * 3);
    colors.set(vertices.subarray(i * stride + colorOffset, i * stride + colorOffset + 4), i * 4);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("surfaceColor", new THREE.BufferAttribute(colors, 4));
  if (indices) geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}
function decalMaterial() {
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  const color = varying(attribute<"vec4">("surfaceColor", "vec4"));
  material.colorNode = vec4(linearAlbedo(color.rgb), color.a);
  return material;
}
function roadMesh(vertices: Float32Array) {
  const mesh = new THREE.Mesh(colorGeometry(vertices, 10, 3), decalMaterial());
  mesh.renderOrder = RENDER_ORDER.groundCues;
  return mesh;
}
function modelMesh(model: MeshData) {
  const geometry = colorGeometry(model.opaque.vertices, 10, 6, model.opaque.indices);
  const normals = new Float32Array((model.opaque.vertices.length / 10) * 3);
  for (let i = 0; i < normals.length / 3; i++)
    normals.set(model.opaque.vertices.subarray(i * 10 + 3, i * 10 + 6), i * 3);
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, side: THREE.DoubleSide });
  // Shared model normals are authored outward; their legacy winding is mixed.
  material.normalNode = viewNormalNode(modelNormalMatrix.mul(attribute<"vec3">("normal", "vec3")));
  material.colorNode = vec4(linearAlbedo(attribute<"vec4">("surfaceColor", "vec4").rgb), 1);
  return new THREE.Mesh(geometry, material);
}
