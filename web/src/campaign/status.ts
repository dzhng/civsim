// Allegiance of a faction to the player — the single thing the map flags and
// label icons encode, shared by the 3D scene (terrain3d), the 2D overlay
// (renderer) and the scene that computes it. Kept in its own module so those
// three can import it without a dependency cycle.

/** 0 = friend (own or allied), 1 = neutral, 2 = foe (at war). */
export enum Allegiance { Friend = 0, Neutral = 1, Foe = 2 }

/** Status colours for the 3D flags (0..1 rgb): green friendly, amber neutral,
 *  red hostile. */
export const STATUS_RGB: [number, number, number][] = [
  [0.30, 0.82, 0.38],
  [0.93, 0.78, 0.30],
  [0.88, 0.27, 0.22],
];

/** The same three, as css for the 2D label icons. */
export const STATUS_CSS = ['#4ed163', '#edc74d', '#e0463a'];
