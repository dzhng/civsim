import type {
  SoldierSurface,
  SoldierTextureChannel,
} from "../../../packages/soldier-assets/src/material";
export const crowdTextureChannels = ["baseColor", "normal", "orm"] as const;
export function crowdSampler(
  surface: SoldierSurface,
  channel: SoldierTextureChannel,
): GPUSamplerDescriptor {
  const s = surface.textures[channel]?.sampler;
  return {
    magFilter: s?.magFilter ?? "linear",
    minFilter: s?.minFilter ?? "linear",
    mipmapFilter: s?.mipmapFilter === "none" ? "nearest" : (s?.mipmapFilter ?? "nearest"),
    addressModeU: s?.wrapS ?? "clamp-to-edge",
    addressModeV: s?.wrapT ?? "clamp-to-edge",
    ...(s?.mipmapFilter === "none" ? { lodMaxClamp: 0 } : {}),
  };
}
export async function crowdImage(surface: SoldierSurface, channel: SoldierTextureChannel) {
  const def = surface.textures[channel];
  return def
    ? createImageBitmap(new Blob([def.image.slice()], { type: def.mimeType }), {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
        imageOrientation: "none",
      })
    : createImageBitmap(new ImageData(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1));
}
