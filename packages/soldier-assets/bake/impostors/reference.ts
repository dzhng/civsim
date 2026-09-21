import * as THREE from "three/webgpu";
import type { ImpostorAtlasData } from "../../src/impostorAtlas";

/** Control-only Three sampler inputs: every backend reads the same persisted property bytes. */
export function referenceAtlasTextures(atlas: ImpostorAtlasData) {
  const width = atlas.columns * atlas.tileSize,
    height = atlas.rows * atlas.tileSize;
  const make = (channel: "albedo" | "normal" | "orm") => {
    const texture = new THREE.DataTexture(
      atlas[channel][0],
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    texture.mipmaps = atlas[channel].map((data, mip) => ({
      data,
      width: Math.max(1, width >> mip),
      height: Math.max(1, height >> mip),
    }));
    texture.colorSpace = channel === "albedo" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  };
  const textures = { albedo: make("albedo"), normal: make("normal"), orm: make("orm") };
  return {
    textures,
    dispose() {
      for (const texture of Object.values(textures)) texture.dispose();
    },
  };
}
