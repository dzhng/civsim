import * as THREE from "three/webgpu";
import { attribute, dot, mrt, varying, vec3, vec4 } from "three/tsl";
import { IMPOSTOR_ATLAS_POLICY } from "../../src/impostorAtlas";
import type { SoldierMeshData } from "../../src/mesh";
import { poseSoldierMesh } from "../../src/skin";
import { hemiOctTileDirections } from "../../src/impostorTile";
import {
  soldierContactOcclusion,
  soldierSurfaceNodes,
  type PreparedSoldierSurface,
} from "./soldierSurface";

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
  palette: ArrayLike<number>,
  preparedSurface: PreparedSoldierSurface,
  opts: { columns?: number; rows?: number; tileSize?: number; assertUsable?: () => void } = {},
): Promise<ImpostorAtlas> {
  await renderer.init();
  opts.assertUsable?.();
  const started = performance.now();
  const columns = opts.columns ?? IMPOSTOR_ATLAS_POLICY.columns;
  const rows = opts.rows ?? IMPOSTOR_ATLAS_POLICY.rows;
  const tileSize = opts.tileSize ?? IMPOSTOR_ATLAS_POLICY.tileSize;
  const posedMesh = poseSoldierMesh(mesh, palette);
  const flat = hemiOctTileDirections(columns, rows);
  const directions: THREE.Vector3[] = [];
  for (let i = 0; i < columns * rows; i++) {
    directions.push(new THREE.Vector3(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]));
  }
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
