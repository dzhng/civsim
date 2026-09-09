export type Armor = "heavy" | "medium" | "light" | "cloth" | "rag";
export type Helmet = "crested" | "bronze" | "cap" | "hood" | "bare";
export type Shield = "tall" | "round" | "small" | "none";
type Weapon =
  | "sword"
  | "spear"
  | "greatsword"
  | "pike"
  | "pike_upright"
  | "pike_sidearm"
  | "bow"
  | "javelin"
  | "lance"
  | "lance_sidearm"
  | "artillery"
  | "none";

export interface AppearanceLook {
  armor: Armor;
  helmet: Helmet;
  shield: Shield;
  weapon: Weapon;
  mounted: boolean;
}

export interface AppearanceDescriptor {
  name: string;
  selection: { unitClass: number; state: "primary" | "atEase" | "sidearm" };
  look: AppearanceLook;
}

export const APPEARANCE_DESCRIPTORS: AppearanceDescriptor[] = [
  {
    name: "heavy-sword",
    selection: { unitClass: 0, state: "primary" },
    look: { weapon: "sword", shield: "tall", armor: "heavy", helmet: "crested", mounted: false },
  },
  {
    name: "light-spear",
    selection: { unitClass: 1, state: "primary" },
    look: { weapon: "spear", shield: "round", armor: "light", helmet: "cap", mounted: false },
  },
  {
    name: "longsword",
    selection: { unitClass: 2, state: "primary" },
    look: {
      weapon: "greatsword",
      shield: "none",
      armor: "medium",
      helmet: "bronze",
      mounted: false,
    },
  },
  {
    name: "phalanx",
    selection: { unitClass: 3, state: "primary" },
    look: { weapon: "pike", shield: "small", armor: "heavy", helmet: "crested", mounted: false },
  },
  {
    name: "archers",
    selection: { unitClass: 4, state: "primary" },
    look: { weapon: "bow", shield: "none", armor: "cloth", helmet: "hood", mounted: false },
  },
  {
    name: "skirmishers",
    selection: { unitClass: 5, state: "primary" },
    look: { weapon: "javelin", shield: "small", armor: "light", helmet: "bare", mounted: false },
  },
  {
    name: "shock-cav",
    selection: { unitClass: 6, state: "primary" },
    look: { weapon: "lance", shield: "round", armor: "heavy", helmet: "crested", mounted: true },
  },
  {
    name: "horse-archers",
    selection: { unitClass: 7, state: "primary" },
    look: { weapon: "bow", shield: "none", armor: "light", helmet: "cap", mounted: true },
  },
  {
    name: "artillery-crew",
    selection: { unitClass: 8, state: "primary" },
    look: { weapon: "artillery", shield: "none", armor: "cloth", helmet: "cap", mounted: false },
  },
  {
    name: "peasant",
    selection: { unitClass: 9, state: "primary" },
    look: { weapon: "sword", shield: "none", armor: "rag", helmet: "bare", mounted: false },
  },
  {
    name: "light-sword",
    selection: { unitClass: 10, state: "primary" },
    look: { weapon: "sword", shield: "round", armor: "light", helmet: "cap", mounted: false },
  },
  {
    name: "heavy-spear",
    selection: { unitClass: 11, state: "primary" },
    look: { weapon: "spear", shield: "tall", armor: "heavy", helmet: "crested", mounted: false },
  },
  {
    name: "medium-infantry",
    selection: { unitClass: 12, state: "primary" },
    look: { weapon: "sword", shield: "round", armor: "medium", helmet: "bronze", mounted: false },
  },
  {
    name: "medium-spear",
    selection: { unitClass: 13, state: "primary" },
    look: { weapon: "spear", shield: "round", armor: "medium", helmet: "bronze", mounted: false },
  },
  {
    name: "medium-phalanx",
    selection: { unitClass: 14, state: "primary" },
    look: { weapon: "pike", shield: "small", armor: "medium", helmet: "bronze", mounted: false },
  },
  {
    name: "shock-cav-sidearm",
    selection: { unitClass: 6, state: "sidearm" },
    look: {
      weapon: "lance_sidearm",
      shield: "round",
      armor: "heavy",
      helmet: "crested",
      mounted: true,
    },
  },
  {
    name: "heavy-phalanx-rest",
    selection: { unitClass: 3, state: "atEase" },
    look: {
      weapon: "pike_upright",
      shield: "small",
      armor: "heavy",
      helmet: "crested",
      mounted: false,
    },
  },
  {
    name: "medium-phalanx-rest",
    selection: { unitClass: 14, state: "atEase" },
    look: {
      weapon: "pike_upright",
      shield: "small",
      armor: "medium",
      helmet: "bronze",
      mounted: false,
    },
  },
  {
    name: "heavy-phalanx-sidearm",
    selection: { unitClass: 3, state: "sidearm" },
    look: {
      weapon: "pike_sidearm",
      shield: "small",
      armor: "heavy",
      helmet: "crested",
      mounted: false,
    },
  },
  {
    name: "medium-phalanx-sidearm",
    selection: { unitClass: 14, state: "sidearm" },
    look: {
      weapon: "pike_sidearm",
      shield: "small",
      armor: "medium",
      helmet: "bronze",
      mounted: false,
    },
  },
];
