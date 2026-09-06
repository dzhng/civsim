export interface SoldierMaterial {
  name: string;
  /** Linear RGBA, matching glTF base-color factors. */
  baseColor: [number, number, number, number];
  roughness: number;
  metallic: number;
  textures?: Partial<Record<keyof typeof SOLDIER_MATERIAL_TEXTURE_CHANNELS, true>>;
  normalScale?: number;
  occlusionStrength?: number;
}

export const SOLDIER_MATERIAL_TEXTURE_CHANNELS = {
  baseColor: "baseColor",
  normal: "normal",
  metallicRoughness: "orm",
  occlusion: "orm",
} as const;

export const SOLDIER_TEXTURE_COLOR_SPACES = {
  baseColor: "srgb",
  normal: "linear",
  orm: "linear",
} as const;
export type SoldierTextureChannel = keyof typeof SOLDIER_TEXTURE_COLOR_SPACES;

export interface SoldierSampler {
  magFilter: GPUFilterMode;
  minFilter: GPUFilterMode;
  mipmapFilter: GPUFilterMode | "none";
  wrapS: GPUAddressMode;
  wrapT: GPUAddressMode;
}

export interface SoldierSurface<Image = Uint8Array<ArrayBuffer>> {
  materials: SoldierMaterial[];
  textures: Partial<
    Record<
      SoldierTextureChannel,
      {
        image: Image;
        mimeType: "image/png" | "image/jpeg";
        sampler: SoldierSampler;
      }
    >
  >;
}

/** Serialized surfaces are admitted before fetching images or allocating GPU resources. */
export function readSoldierSurfaceAsset(value: unknown): SoldierSurface<string> {
  const surface = value as SoldierSurface<string>;
  if (
    !surface ||
    !Array.isArray(surface.materials) ||
    !surface.materials.length ||
    !surface.textures ||
    typeof surface.textures !== "object" ||
    Array.isArray(surface.textures)
  )
    throw new Error("appearance surface requires a material table and texture set");
  for (const material of surface.materials) {
    if (
      !material ||
      !Array.isArray(material.baseColor) ||
      material.baseColor.length !== 4 ||
      [...material.baseColor, material.roughness, material.metallic].some(
        (v) => !Number.isFinite(v) || v < 0 || v > 1,
      )
    )
      throw new Error(
        "appearance materials require finite base RGBA, roughness and metallic in [0, 1]",
      );
    if (
      material.normalScale !== undefined &&
      (!Number.isFinite(material.normalScale) ||
        !Number.isFinite(Math.fround(material.normalScale)))
    )
      throw new Error("appearance material normal scale must be finite in Float32");
    if (
      material.occlusionStrength !== undefined &&
      (!Number.isFinite(material.occlusionStrength) ||
        material.occlusionStrength < 0 ||
        material.occlusionStrength > 1)
    )
      throw new Error("appearance material occlusion strength must be in [0, 1]");
    if (material.textures !== undefined) {
      if (
        !material.textures ||
        typeof material.textures !== "object" ||
        Array.isArray(material.textures)
      )
        throw new Error("appearance material texture usage must be an object");
      for (const [usage, enabled] of Object.entries(material.textures)) {
        const channel =
          SOLDIER_MATERIAL_TEXTURE_CHANNELS[
            usage as keyof typeof SOLDIER_MATERIAL_TEXTURE_CHANNELS
          ];
        if (
          !Object.hasOwn(SOLDIER_MATERIAL_TEXTURE_CHANNELS, usage) ||
          enabled !== true ||
          !surface.textures[channel]
        )
          throw new Error(`appearance material references an invalid or missing ${usage} texture`);
      }
    }
  }
  for (const [channel, texture] of Object.entries(surface.textures)) {
    if (
      !Object.hasOwn(SOLDIER_TEXTURE_COLOR_SPACES, channel) ||
      !texture ||
      typeof texture.image !== "string" ||
      !texture.image ||
      !["image/png", "image/jpeg"].includes(texture.mimeType)
    )
      throw new Error(`appearance ${channel} texture requires a PNG/JPEG image reference`);
    const s = texture.sampler;
    if (
      !s ||
      !["nearest", "linear"].includes(s.magFilter) ||
      !["nearest", "linear"].includes(s.minFilter) ||
      !["none", "nearest", "linear"].includes(s.mipmapFilter) ||
      !["repeat", "clamp-to-edge", "mirror-repeat"].includes(s.wrapS) ||
      !["repeat", "clamp-to-edge", "mirror-repeat"].includes(s.wrapT)
    )
      throw new Error(`appearance ${channel} texture has an invalid sampler`);
  }
  return surface;
}

export const SOLDIER_MATERIAL_ROWS = 3;

/** RGBA32F rows: base RGBA; rough/metal/AO strength/normal scale; map-use flags. */
export function packSoldierMaterials(materials: readonly SoldierMaterial[]): Float32Array {
  const data = new Float32Array(materials.length * SOLDIER_MATERIAL_ROWS * 4);
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i];
    data.set(material.baseColor, i * 4);
    data.set(
      [
        material.roughness,
        material.metallic,
        material.occlusionStrength ?? 1,
        material.normalScale ?? 1,
      ],
      (materials.length + i) * 4,
    );
    data.set(
      [
        Number(material.textures?.baseColor === true),
        Number(material.textures?.normal === true),
        Number(material.textures?.metallicRoughness === true),
        Number(material.textures?.occlusion === true),
      ],
      (materials.length * 2 + i) * 4,
    );
  }
  return data;
}

export function soldierMaterialIdentity() {
  return {
    identity: "soldier-assets-explicit-materials",
    channels: ["albedo", "normal", "orm", "factionMask"],
    mapping: {
      albedo: "linear vertex color times base-color factor and optional sRGB image",
      normal: "four-weight posed tangent-frame normal maps with authored scale and handedness",
      orm: "roughness/metallic factors times independently enabled data maps; authored AO strength",
      factionMask: "explicit vertex factionMask, independent of color",
    },
  };
}
