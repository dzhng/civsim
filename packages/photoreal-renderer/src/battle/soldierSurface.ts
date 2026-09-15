import * as THREE from "three/webgpu";
import {
  abs,
  attribute,
  clamp,
  faceDirection,
  float,
  int,
  ivec2,
  max,
  mix,
  smoothstep,
  step,
  texture,
  textureLoad,
  varying,
  vec3,
} from "three/tsl";
import { TANGENT_FRAME_EPSILON_SQUARED } from "../../../soldier-assets/src/skin";
import {
  packSoldierMaterials,
  SOLDIER_MATERIAL_ROWS,
  type SoldierSurface,
  type SoldierTextureChannel,
} from "../../../soldier-assets/src/material";
import { createSoldierImageOwner, type OwnedSoldierImage } from "./soldierImages";
import { factionForTeam } from "../../../game-renderer/src/battle/factionColors";
import { linearAlbedo } from "./battleTsl";

/** Scale before squaring: even a finite authored normal scale can overflow dot(v,v). */
export function soldierUnitDirection(direction: THREE.Node<"vec3">, fallback: THREE.Node<"vec3">) {
  const largest = max(max(abs(direction.x), abs(direction.y)), abs(direction.z)).toVar();
  const bounded = direction.div(max(largest, float(largest.equal(0)))).toVar();
  // Both candidates are finite. Arithmetic selection keeps derivatives and image
  // sampling outside TSL ConditionalNode's lazy, nonuniform control flow.
  return mix(
    fallback,
    bounded.div(max(bounded.dot(bounded), TANGENT_FRAME_EPSILON_SQUARED).sqrt()),
    float(largest.greaterThan(0)),
  );
}

/** Evaluate at posed vertices, then interpolate. Grounding affects ambient
 * light only; callers gate it off for corpses, independently of authored AO. */
export function soldierContactOcclusion(posedHeight: THREE.Node<"float">) {
  return mix(0.45, 1, smoothstep(0, 0.42, posedHeight));
}

export function soldierFactionAccent(faction: THREE.Node<"float">) {
  const blue = linearAlbedo(vec3(...factionForTeam(0).primary));
  const red = linearAlbedo(vec3(...factionForTeam(1).primary));
  const neutral = linearAlbedo(vec3(...factionForTeam(2).primary));
  const team = mix(mix(blue, red, step(0.5, faction)), neutral, step(1.5, faction));
  return mix(team, linearAlbedo(vec3(0.42, 0.34, 0.26)), 0.35);
}

export interface PreparedSoldierSurface {
  table: THREE.DataTexture;
  images: Partial<Record<SoldierTextureChannel, THREE.ExternalTexture>>;
  dispose(): void;
}

/**
 * The material table is authored per appearance and always allocated here; the
 * images are borrowed from `owner`, which shares one GPU allocation between
 * appearances whose bytes and sampling requirements are identical. A caller
 * without a world-wide owner gets a private one, so its surface owns its images
 * outright. Disposal releases the borrows: the owner destroys each image once,
 * when the last surface holding it is gone.
 */
export async function prepareSoldierSurface(
  renderer: THREE.WebGPURenderer,
  source: SoldierSurface,
  assertUsable?: () => void,
  owner = createSoldierImageOwner(),
): Promise<PreparedSoldierSurface> {
  const table = new THREE.DataTexture(
    packSoldierMaterials(source.materials),
    source.materials.length,
    SOLDIER_MATERIAL_ROWS,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  table.minFilter = THREE.NearestFilter;
  table.magFilter = THREE.NearestFilter;
  table.generateMipmaps = false;
  table.needsUpdate = true;
  const images: PreparedSoldierSurface["images"] = {};
  const borrowed: OwnedSoldierImage[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    table.dispose();
    for (const image of borrowed) image.release();
  };
  try {
    assertUsable?.();
    const device = (renderer.backend as unknown as { device?: GPUDevice }).device;
    if (!device) throw new Error("Soldier surfaces require an initialized WebGPU device");
    for (const [key, definition] of Object.entries(source.textures)) {
      const channel = key as SoldierTextureChannel;
      const image = await owner.acquire(device, channel, definition, assertUsable);
      // Tracked before the next cancellation check so no acquired image escapes
      // this surface's disposal.
      borrowed.push(image);
      assertUsable?.();
      images[channel] = image.texture;
    }
    return { table, images, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Unlit authored properties shared by the crowd shader and far-property bake. */
export function soldierSurfaceNodes(surface: PreparedSoldierSurface) {
  // Slot IDs are categorical: fragment interpolation can round an integer down
  // and select its neighbor even when every vertex of a triangle shares an ID.
  const slot = varying(int(attribute<"float">("materialId", "float"))).setInterpolation("flat");
  const base = textureLoad(surface.table, ivec2(slot, 0));
  const properties = textureLoad(surface.table, ivec2(slot, 1));
  const flags = textureLoad(surface.table, ivec2(slot, 2));
  const uv = attribute<"vec2">("uv", "vec2");
  const albedoMap = surface.images.baseColor ? texture(surface.images.baseColor, uv).rgb : vec3(1);
  const orm = surface.images.orm ? texture(surface.images.orm, uv).rgb : vec3(1);
  return {
    // Call with fragment-stage directions in a single coordinate space. In
    // particular, never feed this texture read to a vertex-normal varying.
    normal: surface.images.normal
      ? (
          normal: THREE.Node<"vec3">,
          tangent: THREE.Node<"vec3">,
          handedness: THREE.Node<"float">,
          position: THREE.Node<"vec3">,
        ) => {
          const face = soldierUnitDirection(
            position.dFdx().cross(position.dFdy()).mul(faceDirection),
            vec3(0, 0, 1),
          );
          // Vertex directions are unit length. A tiny interpolated remainder is
          // cancellation noise, unlike a small but directional decoded map.
          const normalUsable = normal.dot(normal).greaterThan(TANGENT_FRAME_EPSILON_SQUARED);
          const n = mix(face, soldierUnitDirection(normal, face), float(normalUsable)).toVar();
          const sourceT = soldierUnitDirection(tangent, vec3(0)).toVar();
          const projectedT = sourceT.sub(n.mul(n.dot(sourceT))).toVar();
          const t = soldierUnitDirection(projectedT, vec3(0)).toVar();
          const decoded = texture(surface.images.normal!, uv).rgb.mul(2).sub(1);
          const mapped = soldierUnitDirection(
            vec3(decoded.xy.mul(properties.a), decoded.z),
            vec3(0, 0, 1),
          ).toVar();
          const result = soldierUnitDirection(
            t.mul(mapped.x).add(n.cross(t).mul(handedness).mul(mapped.y)).add(n.mul(mapped.z)),
            n,
          );
          return mix(
            n,
            result,
            float(
              flags.g
                .greaterThan(0)
                .and(normalUsable)
                .and(tangent.dot(tangent).greaterThan(TANGENT_FRAME_EPSILON_SQUARED))
                .and(projectedT.dot(projectedT).greaterThan(TANGENT_FRAME_EPSILON_SQUARED)),
            ),
          );
        }
      : undefined,
    albedo: attribute<"vec4">("color", "vec4")
      .rgb.mul(base.rgb)
      .mul(mix(vec3(1), albedoMap, flags.r)),
    roughness: properties.r.mul(mix(1, orm.g, flags.b)),
    metallic: properties.g.mul(mix(1, orm.b, flags.b)),
    occlusion: mix(1, orm.r, flags.a.mul(properties.b)),
    factionMask: clamp(attribute<"float">("factionMask", "float"), 0, 1),
  };
}
