import * as THREE from "three/webgpu";
import {
  attribute,
  clamp,
  int,
  ivec2,
  mix,
  smoothstep,
  step,
  texture,
  textureLoad,
  varying,
  vec3,
} from "three/tsl";
import {
  packSoldierMaterials,
  SOLDIER_MATERIAL_ROWS,
  SOLDIER_TEXTURE_COLOR_SPACES,
  type SoldierSurface,
  type SoldierTextureChannel,
} from "../../../soldier-assets/src/material";
import { uploadImageTexture } from "../../../renderer-core/src/imageTexture";
import { factionForTeam } from "../../../game-renderer/src/battle/factionColors";
import { linearAlbedo } from "./battleTsl";

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
  stats: {
    channel: SoldierTextureChannel;
    width: number;
    height: number;
    mipLevels: number;
    bytes: number;
  }[];
  dispose(): void;
}

/** Images belong to this preparation, never to a shared decoded-image cache. */
export async function prepareSoldierSurface(
  renderer: THREE.WebGPURenderer,
  source: SoldierSurface,
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
  const stats: PreparedSoldierSurface["stats"] = [];
  const owned = new Set<GPUTexture>();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    table.dispose();
    for (const image of Object.values(images)) image.dispose();
    // ExternalTexture deliberately borrows; its dispose does not free the GPU image.
    for (const image of owned) image.destroy();
  };
  try {
    const device = (renderer.backend as unknown as { device?: GPUDevice }).device;
    if (!device) throw new Error("Soldier surfaces require an initialized WebGPU device");
    for (const [key, definition] of Object.entries(source.textures)) {
      const channel = key as SoldierTextureChannel;
      const bitmap = await createImageBitmap(
        new Blob([definition.image], { type: definition.mimeType }),
        {
          colorSpaceConversion: "none",
          premultiplyAlpha: "none",
          imageOrientation: "none",
        },
      );
      try {
        const gpu = await uploadImageTexture(device, bitmap, {
          colorSpace: SOLDIER_TEXTURE_COLOR_SPACES[channel],
          generateMipmaps: definition.sampler.mipmapFilter !== "none",
        });
        owned.add(gpu);
        const image = new THREE.ExternalTexture(gpu);
        images[channel] = image;
        image.colorSpace = channel === "baseColor" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        image.flipY = false;
        image.generateMipmaps = false;
        const sampler = definition.sampler;
        image.magFilter =
          sampler.magFilter === "nearest" ? THREE.NearestFilter : THREE.LinearFilter;
        image.minFilter =
          sampler.mipmapFilter === "none"
            ? sampler.minFilter === "nearest"
              ? THREE.NearestFilter
              : THREE.LinearFilter
            : sampler.mipmapFilter === "nearest"
              ? sampler.minFilter === "nearest"
                ? THREE.NearestMipmapNearestFilter
                : THREE.LinearMipmapNearestFilter
              : sampler.minFilter === "nearest"
                ? THREE.NearestMipmapLinearFilter
                : THREE.LinearMipmapLinearFilter;
        const wraps = {
          repeat: THREE.RepeatWrapping,
          "clamp-to-edge": THREE.ClampToEdgeWrapping,
          "mirror-repeat": THREE.MirroredRepeatWrapping,
        } as const;
        image.wrapS = wraps[sampler.wrapS];
        image.wrapT = wraps[sampler.wrapT];
        let bytes = 0;
        for (let level = 0; level < gpu.mipLevelCount; level++)
          bytes += Math.max(1, gpu.width >> level) * Math.max(1, gpu.height >> level) * 4;
        stats.push({
          channel,
          width: gpu.width,
          height: gpu.height,
          mipLevels: gpu.mipLevelCount,
          bytes,
        });
      } finally {
        bitmap.close();
      }
    }
    return { table, images, stats, dispose };
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
    albedo: attribute<"vec4">("color", "vec4")
      .rgb.mul(base.rgb)
      .mul(mix(vec3(1), albedoMap, flags.r)),
    roughness: properties.r.mul(mix(1, orm.g, flags.b)),
    metallic: properties.g.mul(mix(1, orm.b, flags.b)),
    occlusion: mix(1, orm.r, flags.a.mul(properties.b)),
    factionMask: clamp(attribute<"float">("factionMask", "float"), 0, 1),
  };
}
