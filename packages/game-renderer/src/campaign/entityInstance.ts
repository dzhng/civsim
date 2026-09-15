export interface CampaignEntityInstance {
  id: number;
  label: string;
  selected: boolean;
  x: number;
  y: number;
  z?: number;
  radius: number;
  selectionRadius?: number;
  faction: [number, number, number];
  allegiance: [number, number, number];
  kind: "city";
  strength?: number;
}
