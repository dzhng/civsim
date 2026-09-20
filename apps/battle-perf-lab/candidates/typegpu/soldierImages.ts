// One immutable material-image owner per crowd/catalog preparation on one
// device. The asset loader already hands every appearance the SAME image bytes
// when the baker copied one texture into many appearance directories; this owner
// is what stops those shared bytes from becoming one decode and one GPU
// allocation per surface. It is deliberately NOT an application cache: it lives
// and dies with the preparation that created it, so a staged reload allocates
// its own images while the outgoing preparation's images stay valid until it is
// disposed. Every image belongs to the preparation, not to an individual
// surface, so borrowers never release: `dispose` destroys the whole set once.
import type { TextureProps } from "typegpu";
import { crowdImage } from "../../src/crowdMaterial";
import {
  SOLDIER_TEXTURE_COLOR_SPACES,
  type SoldierSurface,
  type SoldierTextureChannel,
} from "../../../../packages/soldier-assets/src/material";
import { imageTextureBytes } from "../../../../packages/renderer-core/src/imageTexture";
import { createSoldierImageIdentity } from "../../../../packages/renderer-core/src/soldierImageIdentity";
import { createTypegpuImageTexture } from "./imageTexture";

type TypegpuImage = Awaited<ReturnType<typeof createTypegpuImageTexture>>;
/** A borrowed sampled image. The owner destroys it; never destroy it here. */
export type TypegpuSoldierImage = TypegpuImage["texture"];

export interface TypegpuSoldierImageStats {
  channel: SoldierTextureChannel;
  width: number;
  height: number;
  mipLevels: number;
  format: GPUTextureFormat;
  /** The image's own texel payload across its mips: never physical VRAM. */
  bytes: number;
  /** Surface bindings pointing at this image: never an allocation count. */
  references: number;
}

export interface TypegpuSoldierImageOwnerStats {
  /** One entry per GPU image this preparation actually allocated. */
  allocated: TypegpuSoldierImageStats[];
  allocatedImages: number;
  allocatedBytes: number;
  references: number;
  /** What those bindings would cost if each allocated its own image. */
  referencedBytes: number;
}

export interface TypegpuSoldierImageOwner {
  acquire(surface: SoldierSurface, channel: SoldierTextureChannel): Promise<TypegpuSoldierImage>;
  stats(): TypegpuSoldierImageOwnerStats;
  dispose(): void;
}

interface ImageEntry {
  channel: SoldierTextureChannel;
  image: Promise<TypegpuImage>;
  created?: TypegpuImage;
  references: number;
  destroyed: boolean;
}

const DISPOSED = "TypeGPU soldier image owner was disposed";

export function createTypegpuSoldierImageOwner(device: GPUDevice): TypegpuSoldierImageOwner {
  const identity = createSoldierImageIdentity();
  const entries = new Map<string, ImageEntry>();
  let disposed = false;

  // An image still being created when disposal arrives is destroyed by whichever
  // of the two lands second, so exactly one destroy reaches the device and none
  // is skipped.
  const destroy = (entry: ImageEntry) => {
    if (!entry.created || entry.destroyed) return;
    entry.destroyed = true;
    entry.created.dispose();
  };

  const load = async (surface: SoldierSurface, channel: SoldierTextureChannel) => {
    const definition = surface.textures[channel];
    // Decoding runs once per unique image, including the fallback an appearance
    // without this channel binds.
    const bitmap = await crowdImage(surface, channel);
    try {
      return await createTypegpuImageTexture(device, bitmap, {
        colorSpace: SOLDIER_TEXTURE_COLOR_SPACES[channel],
        generateMipmaps: !!definition && definition.sampler.mipmapFilter !== "none",
      });
    } finally {
      bitmap.close();
    }
  };

  const start = (surface: SoldierSurface, channel: SoldierTextureChannel, key: string) => {
    const image = load(surface, channel);
    const entry: ImageEntry = {
      channel,
      image,
      references: 0,
      destroyed: false,
    };
    image.then(
      (created) => {
        entry.created = created;
        if (disposed) destroy(entry);
      },
      // A failed creation retains nothing and leaves the key free to retry.
      () => entries.delete(key),
    );
    return entry;
  };

  return {
    async acquire(surface, channel) {
      if (disposed) throw new Error(DISPOSED);
      const definition = surface.textures[channel];
      // An appearance that does not author this channel borrows the one
      // fallback image this preparation keeps for it.
      const key = definition ? identity(channel, definition) : `fallback|${channel}`;
      let entry = entries.get(key);
      // Equal requests join the creation already in flight rather than racing
      // it to a second allocation.
      if (!entry) entries.set(key, (entry = start(surface, channel, key)));
      entry.references += 1;
      const created = await entry.image;
      if (disposed) throw new Error(DISPOSED);
      return created.texture;
    },
    stats() {
      const allocated = [...entries.values()]
        .filter((entry) => entry.created)
        .map((entry) => {
          // Read from the texture's own props: the resource the uploader
          // actually described to the device, not what this owner asked for.
          const { size, format, mipLevelCount }: TextureProps = entry.created!.texture.props;
          const [width, height] = size;
          const mipLevels = mipLevelCount ?? 1;
          return {
            channel: entry.channel,
            width,
            height,
            mipLevels,
            format,
            bytes: imageTextureBytes(width, height, mipLevels),
            references: entry.references,
          };
        });
      return {
        allocated,
        allocatedImages: allocated.length,
        allocatedBytes: allocated.reduce((sum, image) => sum + image.bytes, 0),
        references: allocated.reduce((sum, image) => sum + image.references, 0),
        referencedBytes: allocated.reduce((sum, image) => sum + image.bytes * image.references, 0),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) destroy(entry);
      entries.clear();
    },
  };
}
