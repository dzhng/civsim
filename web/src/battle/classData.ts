export const UnitClass = {
  HeavySword: 'heavy_sword',
  LightSpear: 'light_spear',
  LongSwords: 'long_swords',
  HeavyPhalanx: 'heavy_phalanx',
  Archers: 'archers',
  Skirmishers: 'skirmishers',
  ShockCavalry: 'shock_cavalry',
  HorseArchers: 'horse_archers',
  ArtilleryCrew: 'artillery_crew',
  Peasant: 'peasant',
  LightSword: 'light_sword',
  HeavySpear: 'heavy_spear',
  MediumInfantry: 'medium_infantry',
  MediumSpear: 'medium_spear',
  MediumPhalanx: 'medium_phalanx',
} as const;

export type UnitClassKey = typeof UnitClass[keyof typeof UnitClass];

export const UNIT_CLASS_CATALOG = [
  { id: 0, key: UnitClass.HeavySword, name: 'Heavy Sword' },
  { id: 1, key: UnitClass.LightSpear, name: 'Light Spear' },
  { id: 2, key: UnitClass.LongSwords, name: 'Long Swords' },
  { id: 3, key: UnitClass.HeavyPhalanx, name: 'Heavy Phalanx' },
  { id: 4, key: UnitClass.Archers, name: 'Archers' },
  { id: 5, key: UnitClass.Skirmishers, name: 'Skirmishers' },
  { id: 6, key: UnitClass.ShockCavalry, name: 'Shock Cavalry' },
  { id: 7, key: UnitClass.HorseArchers, name: 'Horse Archers' },
  { id: 8, key: UnitClass.ArtilleryCrew, name: 'Artillery Crew' },
  { id: 9, key: UnitClass.Peasant, name: 'Peasants' },
  { id: 10, key: UnitClass.LightSword, name: 'Light Sword' },
  { id: 11, key: UnitClass.HeavySpear, name: 'Heavy Spear' },
  { id: 12, key: UnitClass.MediumInfantry, name: 'Medium Infantry' },
  { id: 13, key: UnitClass.MediumSpear, name: 'Medium Spear' },
  { id: 14, key: UnitClass.MediumPhalanx, name: 'Medium Phalanx' },
] as const;

export type UnitClassId = typeof UNIT_CLASS_CATALOG[number]['id'];

export const CLASS_NAMES = UNIT_CLASS_CATALOG.map((c) => c.name);

export const UNIT_CLASS_BY_KEY = Object.fromEntries(
  UNIT_CLASS_CATALOG.map((c) => [c.key, c.id]),
) as { [K in UnitClassKey]: Extract<typeof UNIT_CLASS_CATALOG[number], { key: K }>['id'] };

export const UNIT_CLASS_KEY_BY_ID = UNIT_CLASS_CATALOG.reduce((out, c) => {
  out[c.id] = c.key;
  return out;
}, [] as UnitClassKey[]);

export interface ClassCatalogSpec {
  id?: number;
  key?: string;
}

export function validateClassSpecCatalog(specs: readonly ClassCatalogSpec[]) {
  if (specs.length !== UNIT_CLASS_CATALOG.length) {
    throw new Error(`Wasm class table has ${specs.length} classes; expected ${UNIT_CLASS_CATALOG.length}`);
  }
  for (const expected of UNIT_CLASS_CATALOG) {
    const actual = specs[expected.id];
    if (actual?.id !== expected.id || actual?.key !== expected.key) {
      throw new Error(
        `Wasm class table mismatch at ${expected.id}: expected ${expected.key}, got ${actual?.key ?? 'missing'}`,
      );
    }
  }
}
