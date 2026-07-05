export type ChipKind = "plain" | "hot" | "bad";

export interface BannerChip {
  text: string;
  kind?: ChipKind;
  title?: string;
}

export interface BannerState {
  team: 0 | 1;
  mine: boolean;
  hp: number;
  cohesion: number;
  morale: number;
  stamina: number;
  chips: BannerChip[];
  selected: boolean;
}

export const BANNER_GALLERY: { label: string; state: BannerState }[] = [
  {
    label: "fresh / player",
    state: {
      team: 0,
      mine: true,
      hp: 1,
      cohesion: 1,
      morale: 1,
      stamina: 1,
      selected: false,
      chips: [],
    },
  },
  {
    label: "fresh / enemy",
    state: {
      team: 1,
      mine: false,
      hp: 1,
      cohesion: 1,
      morale: 1,
      stamina: 1,
      selected: false,
      chips: [],
    },
  },
  {
    label: "selected",
    state: {
      team: 0,
      mine: true,
      hp: 0.86,
      cohesion: 0.93,
      morale: 0.88,
      stamina: 0.64,
      selected: true,
      chips: [
        { text: "ATK", title: "attacking" },
        { text: "CHG!", kind: "hot", title: "charging" },
      ],
    },
  },
  {
    label: "fighting",
    state: {
      team: 1,
      mine: false,
      hp: 0.62,
      cohesion: 0.58,
      morale: 0.46,
      stamina: 0.32,
      selected: false,
      chips: [{ text: "ATK" }, { text: "CHG!", kind: "hot" }, { text: "⚔7", kind: "hot" }],
    },
  },
  {
    label: "breaking",
    state: {
      team: 0,
      mine: true,
      hp: 0.24,
      cohesion: 0.12,
      morale: 0.08,
      stamina: 0.27,
      selected: false,
      chips: [
        { text: "ROUT", kind: "bad" },
        { text: "TIRED", kind: "bad" },
        { text: "CRUSH", kind: "bad" },
      ],
    },
  },
  {
    label: "ranged / dry",
    state: {
      team: 1,
      mine: false,
      hp: 0.78,
      cohesion: 0.71,
      morale: 0.67,
      stamina: 0.18,
      selected: false,
      chips: [{ text: "KITE" }, { text: "AMMO!", kind: "bad" }, { text: "2nd", kind: "hot" }],
    },
  },
];
