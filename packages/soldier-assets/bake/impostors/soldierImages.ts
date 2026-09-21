// One immutable material-image owner per world/catalog preparation. The asset
// loader already hands every appearance the SAME image bytes when the baker
// copied one texture into many appearance directories; this owner is what stops
// those shared bytes from becoming one GPU allocation per appearance. It is
// deliberately NOT an application cache: it lives and dies with the preparation
// that created it, so a staged reload allocates its own images and the old
// preparation's images stay valid until its surfaces are disposed.
import * as THREE from "three/webgpu";
import {
  SOLDIER_TEXTURE_COLOR_SPACES,
  type SoldierSampler,
  type SoldierTextureChannel,
} from "../../src/material";
import { imageTextureBytes, uploadImageTexture } from "../../../renderer-core/src/imageTexture";
import {
  createSoldierImageIdentity,
  type SoldierTextureDefinition,
} from "../../../renderer-core/src/soldierImageIdentity";

export interface SoldierImageStats {
  channel: SoldierTextureChannel;
  width: number;
  height: number;
  mipLevels: number;
  bytes: number;
}

/** A borrowed image. Release exactly once; never dispose the texture directly. */
export interface OwnedSoldierImage {
  texture: THREE.ExternalTexture;
  release(): void;
}

export interface SoldierImageOwnerStats {
  /** One entry per GPU image this preparation actually allocated. */
  allocated: (SoldierImageStats & { references: number })[];
  allocatedImages: number;
  allocatedBytes: number;
  /** Surface bindings pointing at those images: never an allocation count. */
  references: number;
  /** What those bindings would cost if each allocated its own image. */
  referencedBytes: number;
}

export interface SoldierImageOwner {
  acquire(
    device: GPUDevice,
    channel: SoldierTextureChannel,
    definition: SoldierTextureDefinition,
    assertUsable?: () => void,
  ): Promise<OwnedSoldierImage>;
  stats(): SoldierImageOwnerStats;
}

interface ImageEntry {
  device: GPUDevice;
  gpu: GPUTexture;
  texture: THREE.ExternalTexture;
  stats: SoldierImageStats;
  references: number;
}

function applySampling(
  texture: THREE.ExternalTexture,
  channel: SoldierTextureChannel,
  sampler: SoldierSampler,
) {
  texture.colorSpace = channel === "baseColor" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.magFilter = sampler.magFilter === "nearest" ? THREE.NearestFilter : THREE.LinearFilter;
  texture.minFilter =
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
  texture.wrapS = wraps[sampler.wrapS];
  texture.wrapT = wraps[sampler.wrapT];
}

export function createSoldierImageOwner(): SoldierImageOwner {
  // `shared` indexes images available for reuse; `live` is every image this
  // owner has allocated and not yet destroyed, so accounting stays exact even
  // for an image that left the index while still borrowed.
  const shared = new Map<string, ImageEntry>();
  const live = new Set<ImageEntry>();
  const imageKey = createSoldierImageIdentity();

  const load = async (
    device: GPUDevice,
    channel: SoldierTextureChannel,
    definition: SoldierTextureDefinition,
    assertUsable?: () => void,
  ): Promise<ImageEntry> => {
    const bitmap = await createImageBitmap(
      new Blob([definition.image], { type: definition.mimeType }),
      { colorSpaceConversion: "none", premultiplyAlpha: "none", imageOrientation: "none" },
    );
    let gpu: GPUTexture;
    try {
      assertUsable?.();
      gpu = await uploadImageTexture(device, bitmap, {
        colorSpace: SOLDIER_TEXTURE_COLOR_SPACES[channel],
        generateMipmaps: definition.sampler.mipmapFilter !== "none",
      });
    } finally {
      bitmap.close();
    }
    try {
      const texture = new THREE.ExternalTexture(gpu);
      applySampling(texture, channel, definition.sampler);
      const stats = {
        channel,
        width: gpu.width,
        height: gpu.height,
        mipLevels: gpu.mipLevelCount,
        bytes: imageTextureBytes(gpu.width, gpu.height, gpu.mipLevelCount),
      };
      return { device, gpu, texture, stats, references: 0 };
    } catch (error) {
      gpu.destroy();
      throw error;
    }
  };

  const borrow = (key: string, entry: ImageEntry): OwnedSoldierImage => {
    entry.references += 1;
    let released = false;
    return {
      texture: entry.texture,
      release() {
        if (released) return;
        released = true;
        entry.references -= 1;
        if (entry.references > 0) return;
        if (shared.get(key) === entry) shared.delete(key);
        live.delete(entry);
        // ExternalTexture deliberately borrows; its dispose does not free the
        // GPU image, so the last holder destroys it here and only here.
        entry.texture.dispose();
        entry.gpu.destroy();
      },
    };
  };

  return {
    async acquire(device, channel, definition, assertUsable) {
      const key = imageKey(channel, definition);
      const existing = shared.get(key);
      // Resources are never reused across devices; a new device allocates anew.
      if (existing && existing.device === device) return borrow(key, existing);
      const entry = await load(device, channel, definition, assertUsable);
      shared.set(key, entry);
      live.add(entry);
      return borrow(key, entry);
    },
    stats() {
      const allocated = [...live].map((entry) => ({
        ...entry.stats,
        references: entry.references,
      }));
      return {
        allocated,
        allocatedImages: allocated.length,
        allocatedBytes: allocated.reduce((sum, image) => sum + image.bytes, 0),
        references: allocated.reduce((sum, image) => sum + image.references, 0),
        referencedBytes: allocated.reduce((sum, image) => sum + image.bytes * image.references, 0),
      };
    },
  };
}
