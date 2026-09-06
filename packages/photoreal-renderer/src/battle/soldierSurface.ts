import * as THREE from "three/webgpu";
import {
  attribute,
  clamp,
  int,
  ivec2,
  mix,
  smoothstep,
  step,
  textureLoad,
  varying,
  vec3,
} from "three/tsl";
import { packSoldierMaterials, type SoldierMaterial } from "../../../soldier-assets/src/material";
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

export function createSoldierMaterialTexture(
  materials: readonly SoldierMaterial[],
): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    packSoldierMaterials(materials),
    materials.length,
    2,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Unlit authored properties shared by the crowd shader and far-property bake. */
export function soldierSurfaceNodes(materialTexture: THREE.DataTexture) {
  // Slot IDs are categorical: fragment interpolation can round an integer down
  // and select its neighbor even when every vertex of a triangle shares an ID.
  const slot = varying(int(attribute<"float">("materialId", "float"))).setInterpolation("flat");
  const base = textureLoad(materialTexture, ivec2(slot, 0));
  const properties = textureLoad(materialTexture, ivec2(slot, 1));
  return {
    albedo: attribute<"vec4">("color", "vec4").rgb.mul(base.rgb),
    roughness: properties.r,
    metallic: properties.g,
    occlusion: properties.b,
    factionMask: clamp(attribute<"float">("factionMask", "float"), 0, 1),
  };
}
