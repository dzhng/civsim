import * as THREE from "three/webgpu";
import { decodeRockDetail } from "../../../game-renderer/src/terrain/rockDetail";

/** Resolves the tiling rock face height map the shared landscape material
 *  samples. One world owns one instance for its whole lifetime: terrain tiles
 *  and rebuilds reuse it rather than decoding again. The caller disposes the
 *  returned texture, which closes the decoded bitmap with it; this module holds
 *  no cache and no shared instance. */
export async function loadRockDetailMap(url?: string): Promise<THREE.Texture> {
  const bitmap = await decodeRockDetail(url);
  try {
    const map = new THREE.Texture(bitmap);
    map.colorSpace = THREE.NoColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    // Mips are the distance filter for the fetch; the shared `detailVisibility`
    // fade in front of it converges the field to its mean below that.
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.addEventListener("dispose", () => bitmap.close());
    map.needsUpdate = true;
    return map;
  } catch (error) {
    // Nothing owns the decoded bytes until the texture carries them.
    bitmap.close();
    throw error;
  }
}
