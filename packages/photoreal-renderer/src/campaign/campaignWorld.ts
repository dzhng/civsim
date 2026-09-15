import { campaignSettlementStandardScale } from "../../../game-renderer/src/campaign/entityFrame";
import { CampaignCityLayer } from "./cityLayer";
import { modelMesh } from "./modelMesh";
import type { CampaignEntityInstance } from "../../../game-renderer/src/campaign/entityInstance";
import { CampaignGeographicLayer, type CampaignGeography } from "./geographicLayer";
import { colorGeometry, decalMaterial } from "../landscape/decal";
import { PhotorealScenery } from "../landscape/sceneryLayer";
import type { SceneryInstance } from "../../../game-renderer/src/terrain/scenery";
import {
  type TerrainAllocationBudget,
  PhotorealTiledTerrain,
  type TerrainTileSurface,
} from "./tiledTerrain";
import { createLandscapeGroundMaterial } from "../landscape/terrainMaterial";
import * as THREE from "three/webgpu";
import {
  attribute,
  varying,
  vec3,
  vec4,
  mix,
  uniform,
  texture,
  positionWorld,
  vec2,
  float,
  clamp,
} from "three/tsl";
import { PhotorealWorld } from "../world";
import { applyCamera3d } from "../cameraBridge";
import { applyCivsimEnvironment } from "../environment";
import { CIVSIM_ENVIRONMENTS } from "../../../game-renderer/src/environment/environment";
import { RENDER_ORDER } from "../renderOrder";
import { createLandscapeFrameUniforms, linearAlbedo } from "../landscape/shaderNodes";
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
  city?: CampaignEntityInstance;
}

export interface CampaignTerritoryData {
  width: number;
  height: number;
  rgba: Uint8Array;
  rect: { min: [number, number]; max: [number, number] };
}

export interface CampaignComposition {
  surface: RenderedSurface;
  objects: readonly CampaignWorldObject[];
  geography: CampaignGeography;
  terrainAllocation?: {
    budget: TerrainAllocationBudget;
  };
  territory: readonly [number, number, number];
  /** Canonical campaign visibility: one means hidden. */
  fogAt: (x: number, y: number) => number;
}

/** Campaign's physical composition owner. The app owns commands and DOM cards;
 * this world owns their 3D anchors, occlusion, and presented-surface picking. */
export class PhotorealCampaignWorld {
  readonly camera = new THREE.PerspectiveCamera();
  private readonly frame = createLandscapeFrameUniforms();
  private readonly standards: PhotorealStandardLayer;
  private readonly scenery: PhotorealScenery;
  private readonly cities: CampaignCityLayer;
  private get renderObjects() {
    return [...this.objects, ...this.cities.objects];
  }
  private sceneryCandidates: readonly SceneryInstance[] = [];
  private seatedScenery: SceneryInstance[] = [];
  private sceneryUploads = 0;
  private readonly objects: { input: CampaignWorldObject; mesh: THREE.Mesh }[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private pose: Camera3DParams | null = null;
  private width = 1;
  private height = 1;
  private selected: string | null = null;
  private fogEnabled = false;
  private readonly fogAmount = uniform(0);
  private fogAt: (x: number, y: number) => number;
  private readonly territoryEnabled = uniform(0);
  private readonly territoryConfigured = uniform(0);
  private readonly territoryOrigin = uniform(new THREE.Vector2());
  private readonly territorySize = uniform(new THREE.Vector2(1, 1));
  private territoryTexture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  private readonly territorySample = texture(this.territoryTexture);
  private visibilityRevision = 0;
  private readonly selection: THREE.Mesh;
  private readonly terrain: PhotorealTiledTerrain;
  private readonly geography: CampaignGeographicLayer;

  static async create(canvas: HTMLCanvasElement, composition: CampaignComposition) {
    return new PhotorealCampaignWorld(await PhotorealWorld.create(canvas), composition);
  }
  private constructor(
    readonly world: PhotorealWorld,
    readonly composition: CampaignComposition,
  ) {
    this.fogAt = composition.fogAt;
    this.territoryTexture.minFilter = THREE.NearestFilter;
    this.territoryTexture.magFilter = THREE.NearestFilter;
    this.territoryTexture.needsUpdate = true;
    this.scenery = new PhotorealScenery(world.scene);
    this.cities = new CampaignCityLayer(world.scene);
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
    this.standards = new PhotorealStandardLayer(world.scene, world.uTime);
    // Tiles share one graph: Three's node-builder cache keys include node identity.
    const terrainMaterial = createLandscapeGroundMaterial(this.frame, undefined, {
      sourceShore: !!composition.surface.mesh.shoreDistance,
    });
    this.colorLandscapeMaterial(terrainMaterial, true);
    this.terrain = new PhotorealTiledTerrain(
      world.scene,
      terrainMaterial,
      composition.surface,
      (geometry, surface) => this.addLandscapeFog(geometry, surface.mesh.vertices),
      composition.terrainAllocation?.budget,
      Float32Array.BYTES_PER_ELEMENT,
    );
    const geographicMaterial = decalMaterial();
    this.colorLandscapeMaterial(geographicMaterial, false);
    this.geography = new CampaignGeographicLayer(world.scene, geographicMaterial, (x, y) =>
      this.fogAt(x, y),
    );
    this.setGeography(composition.geography);
    this.selection = new THREE.Mesh(new THREE.BufferGeometry(), decalMaterial());
    this.selection.renderOrder = RENDER_ORDER.groundCues + 1;
    this.selection.visible = false;
    this.add(this.selection);
  }
  private addLandscapeFog(geometry: THREE.BufferGeometry, vertices: Float32Array) {
    const fog = new Float32Array(vertices.length / 10);
    for (let i = 0; i < fog.length; i++)
      fog[i] = this.fogAt(vertices[i * 10], vertices[i * 10 + 1]);
    geometry.setAttribute("campaignFog", new THREE.BufferAttribute(fog, 1));
  }
  private colorLandscapeMaterial(
    material: THREE.MeshStandardNodeMaterial | THREE.MeshBasicNodeMaterial,
    territory: boolean,
  ) {
    const base = material.colorNode as THREE.Node<"vec4">;
    let tinted = base.rgb;
    if (territory) {
      const uv = positionWorld.xy.sub(this.territoryOrigin).div(this.territorySize);
      const ownership = this.territorySample.sample(vec2(uv.x, float(1).sub(uv.y)));
      const land = float(1).sub(clamp(varying(attribute<"float">("gWater", "float")), 0, 1));
      const fixtureTint = mix(base.rgb, linearAlbedo(vec3(...this.composition.territory)), 0.12);
      tinted = mix(fixtureTint, base.rgb, this.territoryConfigured);
      tinted = mix(
        tinted,
        linearAlbedo(ownership.rgb),
        ownership.a.mul(0.62).mul(land).mul(this.territoryEnabled),
      );
    }
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

  /** Called by the tile scheduler before render, so geometry, anchors, roads and
   * picking all switch to the same presented surface in one frame. */
  installTerrain(tile: TerrainTileSurface, evictedKeys: readonly string[]) {
    const changed = this.terrain.install(tile, evictedKeys);
    this.seatScenery();
    const surface = this.terrain.surface;
    for (const { input, mesh } of this.objects)
      mesh.position.z = surface.sampleRendered(input.x, input.y)!.position[2];
    this.cities.seat(surface, changed);
    this.geography.seat(surface, changed);
    this.updateSelection();
  }

  /** The frame adapter retains campaign identity, ownership and selection policy. */
  setCities(instances: readonly CampaignEntityInstance[]) {
    if (!this.cities.upload(instances, this.terrain.surface)) return;
    this.selected =
      instances.find((city) => city.selected)?.id.toString() ??
      (this.objects.some((object) => object.input.id === this.selected) ? this.selected : null);
    this.setFog(this.fogEnabled);
  }

  setGeography(data: CampaignGeography) {
    this.geography.upload(data, this.terrain.surface);
  }

  /** Candidate ownership remains with campaign policy; this world owns seating. */
  setScenery(candidates: readonly SceneryInstance[]) {
    if (
      candidates === this.sceneryCandidates ||
      (candidates.length === this.sceneryCandidates.length &&
        candidates.every((item, i) => item === this.sceneryCandidates[i]))
    )
      return;
    this.sceneryCandidates = candidates;
    this.seatScenery(true);
  }
  private seatScenery(force = false) {
    const seated = this.sceneryCandidates.flatMap((item) => {
      if (this.fogEnabled && this.fogAt(item.x, item.y) >= 0.5) return [];
      const hit = this.terrain.surface.sampleRendered(item.x, item.y);
      return hit ? [{ ...item, z: hit.position[2] }] : [];
    });
    if (
      !force &&
      seated.length === this.seatedScenery.length &&
      seated.every((item, i) => item.z === this.seatedScenery[i].z)
    )
      return;
    this.seatedScenery = seated;
    this.scenery.upload(seated);
    this.sceneryUploads++;
  }

  /** Replaces ownership without rebuilding the terrain graph or its geometry. */
  setTerritory(data: CampaignTerritoryData, enabled: boolean) {
    if (
      this.territoryTexture.image.width !== data.width ||
      this.territoryTexture.image.height !== data.height
    ) {
      const previous = this.territoryTexture;
      this.territoryTexture = new THREE.DataTexture(data.rgba, data.width, data.height);
      this.territoryTexture.minFilter = THREE.NearestFilter;
      this.territoryTexture.magFilter = THREE.NearestFilter;
      this.territorySample.value = this.territoryTexture;
      previous.dispose();
    } else {
      this.territoryTexture.image.data = data.rgba;
    }
    this.territoryTexture.needsUpdate = true;
    this.territoryOrigin.value.set(...data.rect.min);
    this.territorySize.value.set(
      data.rect.max[0] - data.rect.min[0],
      data.rect.max[1] - data.rect.min[1],
    );
    this.territoryConfigured.value = 1;
    this.territoryEnabled.value = enabled ? 1 : 0;
  }

  /** A new query may reveal different ground even when fog remains enabled. */
  setVisibility(fogAt: (x: number, y: number) => number, enabled: boolean) {
    this.fogAt = fogAt;
    this.world.scene.traverse((object) => {
      const geometry = (object as THREE.Mesh).geometry;
      const fog = geometry?.getAttribute("campaignFog");
      const positions = geometry?.getAttribute("position");
      if (!fog || !positions) return;
      for (let i = 0; i < fog.count; i++) fog.setX(i, fogAt(positions.getX(i), positions.getY(i)));
      fog.needsUpdate = true;
    });
    this.visibilityRevision++;
    this.setFog(enabled);
  }

  setFog(enabled: boolean) {
    this.fogEnabled = enabled;
    this.fogAmount.value = enabled ? 1 : 0;
    this.seatScenery(true);
    for (const { input, mesh } of this.renderObjects)
      mesh.visible = !enabled || this.fogAt(input.x, input.y) < 0.5;
    if (
      this.selected &&
      !this.renderObjects.find((o) => o.input.id === this.selected)?.mesh.visible
    )
      this.selected = null;
    this.updateSelection();
  }
  select(id: string | null) {
    this.selected =
      this.renderObjects.find((o) => o.input.id === id && o.mesh.visible)?.input.id ?? null;
    this.updateSelection();
  }
  private updateSelection() {
    const object = this.renderObjects.find((o) => o.input.id === this.selected && o.mesh.visible);
    this.selection.visible = !!object;
    if (!object) return;
    const { input } = object,
      vertices: number[] = [];
    const radius = input.city
      ? (input.city.selectionRadius ?? input.city.radius * 1.6)
      : input.scale * 4.7;
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
            const hit = this.terrain.surface.sampleRendered(x, y);
            return hit ? [x, y, hit.position[2] + 0.42, ...SELECTION_GREEN, alpha] : null;
          });
          if (points.every((p) => p !== null)) for (const point of points) vertices.push(...point!);
        }
      }
    }
    this.selection.geometry.dispose();
    this.selection.geometry = colorGeometry(Float32Array.from(vertices), 7, 3);
  }
  render(pose: Camera3DParams, width: number, height: number, dpr = 1, time = 0) {
    this.pose = pose;
    this.width = width;
    this.height = height;
    this.world.resize(width, height, dpr);
    this.frame.focus.value.set(pose.target[0], pose.target[1]);
    applyCamera3d(this.camera, pose);
    this.standards.upload(
      this.renderObjects
        .filter((o) => o.mesh.visible)
        .map(({ input, mesh }, i) => ({
          tier: input.city ? ("settlement-banner" as const) : ("campaign-army" as const),
          unitId: input.city?.id ?? i,
          x: input.x,
          y: input.y,
          z: mesh.position.z + (input.standardBase ?? 0) * input.scale,
          yaw: 0,
          scale: input.city ? campaignSettlementStandardScale(input.city.radius) : input.scale * 2,
          ...(input.city
            ? { livery: { field: input.city.faction, trim: input.city.allegiance } }
            : {}),
          factionId: input.faction,
          selected: input.id === this.selected,
        })),
    );
    this.scenery.prepareRender(this.camera, height);
    this.frame.time.value = time;
    this.world.setTime(time);
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
    const surface = this.terrain.surface.raycastRendered(ray);
    this.raycaster.ray.origin.fromArray(ray.origin);
    this.raycaster.ray.direction.fromArray(ray.dir);
    const hits = this.raycaster.intersectObjects(
      this.renderObjects.filter((o) => o.mesh.visible).map((o) => o.mesh),
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
    return this.renderObjects.map(({ input, mesh }) => {
      const z = mesh.position.z + mesh.geometry.boundingBox!.max.z * input.scale;
      const screen = this.project(input.x, input.y, z);
      let visible = mesh.visible && !!screen?.visible;
      if (visible && this.pose && screen) {
        const ray = screenRay(
          this.pose,
          (screen.x / this.width) * 2 - 1,
          1 - (screen.y / this.height) * 2,
        );
        const hit = this.terrain.surface.raycastRendered(ray);
        if (hit)
          visible =
            Math.hypot(...hit.position.map((v, i) => v - ray.origin[i])) >=
            Math.hypot(input.x - ray.origin[0], input.y - ray.origin[1], z - ray.origin[2]) - 0.01;
      }
      return {
        id: input.id,
        groundZ: mesh.position.z,
        label: input.label,
        selected: input.id === this.selected,
        ...this.project(
          input.x,
          input.y,
          mesh.position.z +
            (input.standardBase ?? 0) * input.scale +
            STANDARD_SIZE_TIERS[input.city ? "settlement-banner" : "campaign-army"].poleHeight *
              (input.city ? campaignSettlementStandardScale(input.city.radius) : input.scale * 2),
        ),
        visible,
      };
    });
  }
  stats() {
    return {
      ...this.world.stats(),
      geography: this.geography.stats(),
      cities: this.cities.stats(),
      visibilityRevision: this.visibilityRevision,
      selected: this.selected,
      fog: this.fogEnabled,
      objects: this.renderObjects.filter((o) => o.mesh.visible).length,
      surfaceRevision: this.terrain.stats().revision,
      terrain: this.terrain.stats(),
      standards: this.standards.stats(),
      scenery: { ...this.scenery.stats(), uploads: this.sceneryUploads },
    };
  }
  dispose() {
    this.cities.dispose();
    this.geography.dispose();
    this.territoryTexture.dispose();
    this.scenery.dispose();
    this.terrain.dispose();
    this.standards.dispose();
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.world.dispose();
  }
}
