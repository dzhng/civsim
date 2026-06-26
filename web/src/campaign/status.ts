// Campaign-map entities are coloured by exactly one of two schemes:
//   - FACTION colour  — the realm's livery, flown by the 3D city banners and
//                        army pennants (see Terrain3D.factionColors).
//   - ALLEGIANCE colour — friend/neutral/foe relative to the player, shown only
//                        in the 2D name-label icons (STATUS_CSS below).
// This module owns the allegiance scheme; it lives apart from scene/renderer/
// terrain3d so all three can share it without a dependency cycle.

/** 0 = friend (own or allied), 1 = neutral, 2 = foe (at war). */
export enum Allegiance { Friend = 0, Neutral = 1, Foe = 2 }

/** Allegiance colours for the 2D label icons: green friend, amber neutral,
 *  red foe. */
export const STATUS_CSS = ['#4ed163', '#edc74d', '#e0463a'];
