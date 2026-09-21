import type { SoldierSurface, SoldierTextureChannel } from "../../soldier-assets/src/material";

/** One channel's immutable image exactly as the asset loader delivered it. */
export type SoldierTextureDefinition = NonNullable<
  SoldierSurface["textures"][SoldierTextureChannel]
>;

/**
 * The backend-neutral answer to "may these two texture definitions become one
 * GPU image?", so every renderer that owns soldier material images shares one
 * sharing policy rather than reinventing it per backend.
 *
 * Bytes are identified by the buffer the loader fetched them into, never by
 * filename or content hash: two appearances share an image exactly when the
 * loader gave them one buffer. Everything else sharing depends on is derived
 * from the rest of the key — color space and dimensions/format from the channel
 * and those bytes, the mip policy from the sampler's mipmap filter. Keying on
 * the channel rather than the color space alone keeps each reported image
 * attributable to one channel; it only ever costs a shared allocation between
 * two linear channels that carry byte-identical images. Filtering and wrapping
 * belong to the key because a backend may carry sampler state on the texture
 * itself; where samplers are separate objects this only ever over-separates.
 *
 * One identity per preparation: the buffer ids it hands out are meaningful only
 * inside the owner that created it, which is what keeps images out of an
 * application-global cache.
 */
export function createSoldierImageIdentity() {
  const bufferIds = new WeakMap<ArrayBufferLike, number>();
  let nextBufferId = 0;
  return (channel: SoldierTextureChannel, definition: SoldierTextureDefinition) => {
    const { image, sampler } = definition;
    let id = bufferIds.get(image.buffer);
    if (id === undefined) bufferIds.set(image.buffer, (id = nextBufferId++));
    return [
      channel,
      id,
      image.byteOffset,
      image.byteLength,
      definition.mimeType,
      sampler.magFilter,
      sampler.minFilter,
      sampler.mipmapFilter,
      sampler.wrapS,
      sampler.wrapT,
    ].join("|");
  };
}
