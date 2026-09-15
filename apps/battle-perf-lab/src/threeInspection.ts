import type { PhotorealBattleWorld } from "../../../packages/photoreal-renderer/src/battle/battleWorld";
import type { Mesh, DataTexture } from "three/webgpu";

/** Borrow actual generated geometry/texture views through Three's public scene API. */
export function readGroundInputs(world: PhotorealBattleWorld) {
  const object = world.world.scene.getObjectByName("battle-ground");
  if (!object || !("geometry" in object)) return null;
  const ground = object as Mesh;
  const position = ground.geometry.getAttribute("position");
  const texture = ground.userData.earthDistanceTexture as DataTexture | undefined;
  return {
    vertices: position && "data" in position ? position.data.array : position?.array,
    indices: ground.geometry.index?.array,
    tint: ground.geometry.getAttribute("gTint")?.array,
    surfaceColor: ground.geometry.getAttribute("gSurfaceColor")?.array,
    earthDistance: texture
      ? {
          data: texture.image.data,
          width: texture.image.width,
          height: texture.image.height,
          ...ground.userData.earthDistance,
        }
      : null,
  };
}

/** Actual indirect commands after submission; diagnostic readback, never timed. */
export async function readGrassDraws(world: PhotorealBattleWorld) {
  const pending: Promise<{ name: string; visible: boolean; command: number[] }>[] = [];
  for (const object of world.world.scene.children) {
    if (!object.name.startsWith("battle-grass") || !("geometry" in object)) continue;
    const indirect = (object as Mesh).geometry.getIndirect();
    if (!indirect) continue;
    const name = object.name,
      visible = object.visible;
    // Three submits copyBufferToBuffer before its first await. Queue every copy
    // at this boundary, before later presentations can change indirect commands.
    pending.push(
      world.world.renderer
        .getArrayBufferAsync(indirect)
        .then((bytes) => ({ name, visible, command: Array.from(new Uint32Array(bytes)) })),
    );
  }
  return Promise.all(pending);
}
