import type * as THREE from "three/webgpu";
import { mix, step, vec3 } from "three/tsl";
import { factionForTeam } from "../../../game-renderer/src/battle/factionColors";
import { linearAlbedo } from "../landscape/shaderNodes";

export function soldierFactionAccent(faction: THREE.Node<"float">) {
  const blue = linearAlbedo(vec3(...factionForTeam(0).primary));
  const red = linearAlbedo(vec3(...factionForTeam(1).primary));
  const neutral = linearAlbedo(vec3(...factionForTeam(2).primary));
  const team = mix(mix(blue, red, step(0.5, faction)), neutral, step(1.5, faction));
  return mix(team, linearAlbedo(vec3(0.42, 0.34, 0.26)), 0.35);
}
