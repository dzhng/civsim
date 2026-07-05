// The battle readout's state contract and its review ladder. The readout is
// text-status chips ONLY — unit stats live in the unit card, faction identity
// lives on the flag. The gallery ladder covers the layout envelope: one chip,
// a pair, a full row, and the wrap-to-two-rows maximum.

export type ChipKind = "plain" | "hot" | "bad";

export interface BannerChip {
  text: string;
  kind?: ChipKind;
  title?: string;
}

export interface ReadoutState {
  chips: BannerChip[];
}

export const READOUT_GALLERY: { label: string; state: ReadoutState }[] = [
  {
    label: "single",
    state: { chips: [{ text: "CHG!", kind: "hot", title: "charging" }] },
  },
  {
    label: "pair",
    state: {
      chips: [
        { text: "ATK", title: "attacking" },
        { text: "KITE", title: "skirmishing" },
      ],
    },
  },
  {
    label: "row",
    state: {
      chips: [
        { text: "ROUT", kind: "bad" },
        { text: "TIRED", kind: "bad" },
        { text: "CRUSH", kind: "bad" },
      ],
    },
  },
  {
    label: "max (wraps)",
    state: {
      chips: [
        { text: "ATK" },
        { text: "CHG!", kind: "hot" },
        { text: "KITE" },
        { text: "AMMO!", kind: "bad" },
        { text: "\u26947", kind: "hot" },
      ],
    },
  },
];
