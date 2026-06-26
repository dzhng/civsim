// Soldier look metadata shared by WebGPU battle/campaign UI. Raw WebGPU assets
// flow through packages/soldier-assets.

export interface ClassLook {
  weapon: 'sword' | 'spear' | 'greatsword' | 'pike' | 'bow' | 'javelin' | 'lance' | 'none';
  shield: 'tall' | 'round' | 'small' | 'none';
  armor: 'heavy' | 'medium' | 'light' | 'cloth' | 'rag';
  helmet: 'crested' | 'bronze' | 'cap' | 'hood' | 'bare';
  crest: boolean;
  mounted: boolean;
}

export const CLASS_LOOK: ClassLook[] = [
  { weapon: 'sword', shield: 'tall', armor: 'heavy', helmet: 'crested', crest: true, mounted: false },
  { weapon: 'spear', shield: 'round', armor: 'light', helmet: 'cap', crest: false, mounted: false },
  { weapon: 'greatsword', shield: 'none', armor: 'medium', helmet: 'bronze', crest: false, mounted: false },
  { weapon: 'pike', shield: 'small', armor: 'heavy', helmet: 'crested', crest: true, mounted: false },
  { weapon: 'bow', shield: 'none', armor: 'cloth', helmet: 'hood', crest: false, mounted: false },
  { weapon: 'javelin', shield: 'small', armor: 'light', helmet: 'bare', crest: false, mounted: false },
  { weapon: 'lance', shield: 'round', armor: 'heavy', helmet: 'crested', crest: true, mounted: true },
  { weapon: 'bow', shield: 'none', armor: 'light', helmet: 'cap', crest: false, mounted: true },
  { weapon: 'none', shield: 'none', armor: 'cloth', helmet: 'cap', crest: false, mounted: false },
  { weapon: 'sword', shield: 'none', armor: 'rag', helmet: 'bare', crest: false, mounted: false },
  { weapon: 'sword', shield: 'round', armor: 'light', helmet: 'cap', crest: false, mounted: false },
  { weapon: 'spear', shield: 'tall', armor: 'heavy', helmet: 'crested', crest: true, mounted: false },
  { weapon: 'sword', shield: 'round', armor: 'medium', helmet: 'bronze', crest: true, mounted: false },
  { weapon: 'spear', shield: 'round', armor: 'medium', helmet: 'bronze', crest: true, mounted: false },
];

export const CLASS_MODEL_LOOK: number[] = CLASS_LOOK.map((_, i) => i);
export const UNIT_CLASS_LOOK_COUNT = CLASS_MODEL_LOOK.length;
export const MODEL_LOOK_COUNT = CLASS_LOOK.length;

export function modelLookForClass(cls: number): number {
  return CLASS_MODEL_LOOK[cls] ?? CLASS_MODEL_LOOK[0];
}

export function modelLookForUnit(cls: number, unitTypeId?: number): number {
  void unitTypeId;
  return modelLookForClass(cls);
}

export function lookForModel(model: number): ClassLook {
  return CLASS_LOOK[model] ?? CLASS_LOOK[modelLookForClass(0)];
}
