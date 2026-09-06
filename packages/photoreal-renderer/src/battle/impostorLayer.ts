import * as THREE from "three/webgpu";
import {
  attribute,
  cos,
  dot,
  float,
  max,
  mix,
  mrt,
  sin,
  texture,
  transformNormalToView,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { CrowdInstance } from "../../../crowd-runtime/src/instanceData";
import type { VatBake } from "../../../soldier-assets/src/schema";
import type { SoldierMeshData } from "../../../soldier-assets/src/mesh";
import { poseSoldierMesh } from "../../../soldier-assets/src/skin";
import {
  soldierContactOcclusion,
  soldierFactionAccent,
  soldierSurfaceNodes,
  type PreparedSoldierSurface,
} from "./soldierSurface";
import { RENDER_ORDER } from "./terrainLayer";

export interface ImpostorAtlas {
  textures: { albedo: THREE.Texture; normal: THREE.Texture; orm: THREE.Texture };
  tileSize: number;
  columns: number;
  rows: number;
  directions: THREE.Vector3[];
  center: THREE.Vector3;
  worldSpan: number;
  metrics: { allocatedBytes: number; bakeMs: number; drawCalls: number };
  dispose(): void;
}

type PosedMeshData = ReturnType<typeof poseSoldierMesh>;

interface Bounds2 {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export async function createSoldierImpostorAtlas(
  renderer: THREE.WebGPURenderer,
  mesh: SoldierMeshData,
  vat: VatBake,
  preparedSurface: PreparedSoldierSurface,
  opts: { columns?: number; rows?: number; tileSize?: number; clip: string; phase: number },
): Promise<ImpostorAtlas> {
  await renderer.init();
  const started = performance.now();
  const columns = opts.columns ?? 8;
  const rows = opts.rows ?? 8;
  const tileSize = opts.tileSize ?? 96;
  const posedMesh = poseMeshWithVat(mesh, vat, opts.clip, opts.phase);
  const directions = hemiOctDirections(columns, rows);
  const projectedBounds = directions.map((dir) => projectedMeshBounds(posedMesh, viewBasis(dir)));
  const box = new THREE.Box3().setFromArray(posedMesh.positions);
  const center = box.getCenter(new THREE.Vector3());
  // Every view shares a model-space anchor. Per-tile recentering would make
  // long weapons shift the body when the selected view changes.
  for (let i = 0; i < directions.length; i++) {
    const basis = viewBasis(directions[i]);
    const cx = center.dot(basis.right),
      cy = center.dot(basis.up);
    const bounds = projectedBounds[i];
    const halfX = Math.max(cx - bounds.minX, bounds.maxX - cx);
    const halfY = Math.max(cy - bounds.minY, bounds.maxY - cy);
    projectedBounds[i] = { minX: cx - halfX, maxX: cx + halfX, minY: cy - halfY, maxY: cy + halfY };
  }
  const maxSpan = Math.max(
    ...projectedBounds.map((b) => Math.max(b.maxX - b.minX, b.maxY - b.minY)),
    1e-3,
  );
  const worldSpan = maxSpan / 0.78;
  const device = (renderer.backend as unknown as { device?: GPUDevice }).device;
  if (!device) throw new Error("Soldier atlas admission requires an initialized WebGPU device");
  device.pushErrorScope("out-of-memory");
  device.pushErrorScope("internal");
  device.pushErrorScope("validation");
  let target: THREE.RenderTarget | undefined;
  let submissionError: unknown;
  let submissionFailed = false;
  try {
    target = bakePropertyAtlas(
      renderer,
      mesh,
      posedMesh,
      preparedSurface,
      directions,
      center,
      worldSpan,
      columns,
      rows,
      tileSize,
    );
  } catch (error) {
    submissionFailed = true;
    submissionError = error;
  }
  // The synchronous bake restores renderer state before any scope is awaited.
  // Pop every scope now so unrelated frames cannot be admitted into this bake.
  const admission = await Promise.allSettled([
    device.popErrorScope(),
    device.popErrorScope(),
    device.popErrorScope(),
  ]);
  const failures = admission.flatMap((result) =>
    result.status === "rejected"
      ? [String(result.reason)]
      : result.value
        ? [result.value.message]
        : [],
  );
  if (submissionFailed || failures.length) {
    target?.dispose();
    if (submissionFailed) throw submissionError;
    throw new Error(`Soldier atlas GPU admission failed: ${failures.join("; ")}`);
  }
  if (!target) throw new Error("Soldier atlas preparation produced no render target");
  let mipPixels = 0;
  for (
    let w = columns * tileSize, h = rows * tileSize;
    ;
    w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)
  ) {
    mipPixels += w * h;
    if (w === 1 && h === 1) break;
  }
  return {
    textures: { albedo: target.textures[0], normal: target.textures[1], orm: target.textures[2] },
    tileSize,
    columns,
    rows,
    directions,
    center,
    worldSpan,
    metrics: {
      allocatedBytes: mipPixels * 4 * 3 + columns * rows * tileSize ** 2 * 4,
      bakeMs: performance.now() - started,
      drawCalls: 2,
    },
    dispose: () => target.dispose(),
  };
}

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
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly camRight = uniform(new THREE.Vector3(1, 0, 0));
  private readonly camUp = uniform(new THREE.Vector3(0, 0, 1));
  private capacity = 0;
  private inst = new Float32Array(0);
  private meta = new Float32Array(0);
  private living = new Float32Array(0);
  private source: CrowdInstance[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly atlas: ImpostorAtlas,
  ) {
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
    // Corpse roll cannot affect it: dead instances disable the factor entirely.
    const living = varying(attribute<"float">("impostorLiving", "float"));
    material.aoNode = orm.r.mul(mix(1, normalAndContact.a, living));
    material.colorNode = vec4(
      mix(sample.rgb.div(coverage), soldierFactionAccent(faction), orm.a),
      sample.a,
    );

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = "battle-crowd-far-impostors";
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
      this.inst[o] = src.x + center.x * Math.cos(angle) - center.y * Math.sin(angle);
      this.inst[o + 1] = src.y + center.x * Math.sin(angle) + center.y * Math.cos(angle);
      this.inst[o + 2] = (src.elevation ?? 0) + center.z;
      this.inst[o + 3] = src.faction;
      this.meta[o] = 0;
      this.meta[o + 1] = this.atlas.worldSpan;
      this.meta[o + 2] = this.atlas.worldSpan;
      this.meta[o + 3] = angle;
      this.living[i] = src.alive ? 1 : 0;
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
      this.meta[o] = nearestTile(localDir, this.atlas.directions);
      // Screen-size floor: enlarge the world-space billboard whenever it would
      // project below the minimum viewport fraction, so a far crowd stays a
      // visible blob instead of sub-pixel-vanishing through the alpha-tested
      // mip chain. screenFraction is the projected height as a fraction of the
      // viewport (perspective: worldHeight / (2 · depth · tan(fovY/2))).
      let scale = 1;
      if (tanHalfFov > 0 && dist > 0) {
        const screenFraction = this.atlas.worldSpan / (2 * dist * tanHalfFov);
        if (screenFraction < IMPOSTOR_MIN_SCREEN_FRACTION)
          scale = IMPOSTOR_MIN_SCREEN_FRACTION / screenFraction;
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

function poseMeshWithVat(
  mesh: SoldierMeshData,
  vat: VatBake,
  clipName: string,
  phase: number,
): PosedMeshData {
  const clip = vat.clips.find((c) => c.name === clipName)!;
  const frame = Math.min(
    clip.start + clip.frames - 1,
    clip.start + Math.floor(phase * Math.max(clip.frames - 1, 1)),
  );
  return poseSoldierMesh(mesh, vat, frame);
}

/** One unlit MRT draw: view instances occupy disjoint fixed tiles. The ordinary
 * orthographic camera owns clip/depth conversion, including reversed depth. */
function bakePropertyAtlas(
  renderer: THREE.WebGPURenderer,
  source: SoldierMeshData,
  posed: PosedMeshData,
  preparedSurface: PreparedSoldierSurface,
  directions: THREE.Vector3[],
  center: THREE.Vector3,
  span: number,
  columns: number,
  rows: number,
  tileSize: number,
): THREE.RenderTarget {
  const target = new THREE.RenderTarget(columns * tileSize, rows * tileSize, {
    count: 3,
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
  });
  target.textures.forEach((texture, i) => {
    texture.name = ["albedo", "normal", "orm"][i];
  });
  // The render attachment encodes linear shader output into sRGB8; sampling and
  // mip filtering decode in hardware. Data channels stay linear UNORM8.
  target.textures[0].colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(posed.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(posed.normals, 3));
  geometry.setAttribute("tangent", new THREE.BufferAttribute(posed.tangents, 4));
  geometry.setAttribute("color", new THREE.BufferAttribute(source.colors, 4));
  geometry.setAttribute("materialId", new THREE.BufferAttribute(source.materialIds, 1));
  geometry.setAttribute("factionMask", new THREE.BufferAttribute(source.factionMasks, 1));
  geometry.setAttribute("uv", new THREE.BufferAttribute(source.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(source.indices, 1));
  const views = new Float32Array(directions.length * 11);
  directions.forEach((direction, i) => {
    const basis = viewBasis(direction);
    basis.right.toArray(views, i * 11);
    basis.up.toArray(views, i * 11 + 3);
    basis.forward.toArray(views, i * 11 + 6);
    views[i * 11 + 9] = ((i % columns) + 0.5) * span;
    views[i * 11 + 10] = (rows - Math.floor(i / columns) - 0.5) * span;
  });
  const viewBuffer = new THREE.InstancedInterleavedBuffer(views, 11);
  geometry.setAttribute("bakeRight", new THREE.InterleavedBufferAttribute(viewBuffer, 3, 0));
  geometry.setAttribute("bakeUp", new THREE.InterleavedBufferAttribute(viewBuffer, 3, 3));
  geometry.setAttribute("bakeForward", new THREE.InterleavedBufferAttribute(viewBuffer, 3, 6));
  geometry.setAttribute("bakeOffset", new THREE.InterleavedBufferAttribute(viewBuffer, 2, 9));
  geometry.instanceCount = directions.length;
  const material = new THREE.MeshBasicNodeMaterial({
    side: THREE.DoubleSide,
    blending: THREE.NoBlending,
  });
  const position = attribute<"vec3">("position", "vec3").sub(vec3(center.x, center.y, center.z));
  const tileOffset = attribute<"vec2">("bakeOffset", "vec2");
  material.positionNode = vec3(
    dot(position, attribute<"vec3">("bakeRight", "vec3")).add(tileOffset.x),
    dot(position, attribute<"vec3">("bakeUp", "vec3")).add(tileOffset.y),
    dot(position, attribute<"vec3">("bakeForward", "vec3")),
  );
  const surface = soldierSurfaceNodes(preparedSurface);
  const geometricNormal = attribute<"vec3">("normal", "vec3");
  const tangent = attribute<"vec4">("tangent", "vec4");
  const posedNormal = surface.normal
    ? surface.normal(
        varying(geometricNormal),
        varying(tangent.xyz),
        varying(tangent.w).setInterpolation("flat"),
        varying(position),
      )
    : geometricNormal.normalize();
  material.fragmentNode = mrt({
    albedo: vec4(surface.albedo, 1),
    normal: vec4(
      posedNormal.mul(0.5).add(0.5),
      // Match the mesh path: evaluate height response at posed vertices before
      // interpolation. Alpha was unused; no additional atlas allocation.
      varying(soldierContactOcclusion(attribute<"vec3">("position", "vec3").z)),
    ),
    orm: vec4(surface.occlusion, surface.roughness, surface.metallic, surface.factionMask),
  });
  material.toneMapped = false;
  material.fog = false;
  const scene = new THREE.Scene();
  const clearScene = new THREE.Scene();
  // Three clears auxiliary MRT alpha to one. Explicit zero coverage in every
  // attachment is required before filtering the independently authored mask.
  const clearGeometry = new THREE.PlaneGeometry(columns * span, rows * span);
  const clearMaterial = new THREE.MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  clearMaterial.fragmentNode = mrt({ albedo: vec4(0), normal: vec4(0), orm: vec4(0) });
  clearMaterial.toneMapped = false;
  clearMaterial.fog = false;
  const clearMesh = new THREE.Mesh(clearGeometry, clearMaterial);
  clearMesh.position.set((columns * span) / 2, (rows * span) / 2, 0);
  clearScene.add(clearMesh);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(0, columns * span, rows * span, 0, 0.01, span * 4);
  camera.position.z = span * 2;
  camera.updateMatrixWorld();
  const previousTarget = renderer.getRenderTarget();
  const previousFace = renderer.getActiveCubeFace(),
    previousMip = renderer.getActiveMipmapLevel();
  const previousMrt = renderer.getMRT();
  const previousClear = renderer.getClearColor(new THREE.Color()),
    previousAlpha = renderer.getClearAlpha();
  const previousAutoClear = renderer.autoClear;
  try {
    renderer.setRenderTarget(target);
    renderer.setMRT(null);
    renderer.setClearColor(0, 0);
    renderer.autoClear = false;
    renderer.clear(true, true, false);
    renderer.render(clearScene, camera);
    renderer.render(scene, camera);
    return target;
  } catch (error) {
    target.dispose();
    throw error;
  } finally {
    renderer.setRenderTarget(previousTarget, previousFace, previousMip);
    renderer.setMRT(previousMrt);
    renderer.setClearColor(previousClear, previousAlpha);
    renderer.autoClear = previousAutoClear;
    geometry.dispose();
    material.dispose();
    clearGeometry.dispose();
    clearMaterial.dispose();
  }
}

function hemiOctDirections(columns: number, rows: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const ox = ((x + 0.5) / columns) * 2 - 1;
      const oy = ((y + 0.5) / rows) * 2 - 1;
      let dx = ox;
      let dy = oy;
      let dz = 1 - Math.abs(dx) - Math.abs(dy);
      if (dz < 0) {
        const px = dx;
        dx = (1 - Math.abs(dy)) * Math.sign(px || 1);
        dy = (1 - Math.abs(px)) * Math.sign(dy || 1);
        dz = -dz;
      }
      out.push(new THREE.Vector3(dx, dy, Math.abs(dz)).normalize());
    }
  }
  return out;
}

function viewBasis(dir: THREE.Vector3) {
  const forward = dir.clone().normalize();
  const fallback =
    Math.abs(forward.z) > 0.96 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(fallback, forward).normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  return { forward, right, up };
}

function projectedMeshBounds(mesh: PosedMeshData, basis: ReturnType<typeof viewBasis>): Bounds2 {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = new THREE.Vector3(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
    const x = p.dot(basis.right);
    const y = p.dot(basis.up);
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
  }
  return b;
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

function nearestTile(dir: THREE.Vector3, directions: THREE.Vector3[]): number {
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < directions.length; i++) {
    const d = dir.dot(directions[i]);
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  }
  return best;
}
