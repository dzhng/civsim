export interface SoldierMaterial {
  name: string;
  /** Linear RGBA, matching glTF base-color factors. */
  baseColor: [number, number, number, number];
  roughness: number;
  metallic: number;
}

/** RGBA32F rows: base color, then roughness/metallic/occlusion/padding. */
export function packSoldierMaterials(materials: readonly SoldierMaterial[]): Float32Array {
  const data = new Float32Array(materials.length * 8);
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i];
    data.set(material.baseColor, i * 4);
    data.set([material.roughness, material.metallic, 1, 0], (materials.length + i) * 4);
  }
  return data;
}

export function soldierMaterialIdentity() {
  return {
    identity: "soldier-assets-explicit-materials",
    channels: ["albedo", "normal", "orm", "factionMask"],
    mapping: {
      albedo: "linear vertex color times authored material base-color factor",
      normal: "four-weight posed normal",
      orm: "authored roughness/metallic slots; scalar occlusion is one",
      factionMask: "explicit vertex factionMask, independent of color",
    },
  };
}
